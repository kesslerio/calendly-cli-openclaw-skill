import { describe, expect, test } from 'bun:test';
import {
	deriveEndTimeFromDuration,
	extractRescheduleIdentifiers,
	normalizeRescheduleEventQuery,
	shapeRescheduleEventResult,
	toRescheduleEventRestBody,
	toSafeRescheduleEventError,
} from './reschedule-event';

const FUTURE_START = '2099-03-01T15:00:00Z';

describe('normalizeRescheduleEventQuery', () => {
	test('normalizes event URI + new_start_time + reason', () => {
		const query = normalizeRescheduleEventQuery({
			eventUri: ' https://api.calendly.com/scheduled_events/EVT_123 ',
			newStartTime: FUTURE_START,
			reason: ' Need to move this by 30 minutes ',
		});

		expect(query).toEqual({
			event_uuid: 'EVT_123',
			new_start_time: FUTURE_START,
			reason: 'Need to move this by 30 minutes',
		});
	});

	test('supports invitee URI and reschedule URL identifier extraction', () => {
		const query = normalizeRescheduleEventQuery({
			newStartTime: FUTURE_START,
		}, {
			reschedule_url: 'https://calendly.com/reschedulings/INV_222',
		});

		expect(query.invitee_uuid).toBe('INV_222');
		expect(query.event_uuid).toBeUndefined();
		expect(query.reschedule_url).toContain('https://calendly.com/reschedulings/INV_222');
	});

	test('rejects missing identifiers and invalid times', () => {
		expect(() =>
			normalizeRescheduleEventQuery({
				newStartTime: FUTURE_START,
			})
		).toThrow('Provide at least one identifier');

		expect(() =>
			normalizeRescheduleEventQuery({
				eventUuid: 'EVT_123',
				newStartTime: '2020-01-01T00:00:00Z',
			})
		).toThrow('new_start_time must be in the future');

		expect(() =>
			normalizeRescheduleEventQuery({
				eventUuid: 'EVT_123',
				newStartTime: FUTURE_START,
				newEndTime: '2099-03-01T14:59:59Z',
			})
		).toThrow('new_end_time must be greater than new_start_time');
	});

	test('rejects conflicting event identifiers', () => {
		expect(() =>
			normalizeRescheduleEventQuery({
				eventUuid: 'EVT_A',
				eventUri: 'https://api.calendly.com/scheduled_events/EVT_B',
				newStartTime: FUTURE_START,
			})
		).toThrow('conflicting event_uuid values were provided');
	});
});

describe('extractRescheduleIdentifiers', () => {
	test('extracts IDs from Calendly API URIs', () => {
		expect(extractRescheduleIdentifiers('https://api.calendly.com/invitees/INV_1')).toEqual({ invitee_uuid: 'INV_1' });
		expect(extractRescheduleIdentifiers('https://api.calendly.com/scheduled_events/EVT_1')).toEqual({ event_uuid: 'EVT_1' });
	});

	test('extracts event/invitee IDs from reschedule URL params', () => {
		const extracted = extractRescheduleIdentifiers(
			'https://calendly.com/reschedulings/INV_55?event=https%3A%2F%2Fapi.calendly.com%2Fscheduled_events%2FEVT_55'
		);

		expect(extracted).toEqual({
			event_uuid: 'EVT_55',
			invitee_uuid: 'INV_55',
		});
	});

	test('extracts invitee ID from bare reschedule URL path', () => {
		const extracted = extractRescheduleIdentifiers('https://calendly.com/reschedulings/INV_99');
		expect(extracted).toEqual({
			invitee_uuid: 'INV_99',
		});
	});
});

describe('toRescheduleEventRestBody', () => {
	test('maps normalized query into Calendly invitee patch payload', () => {
		const payload = toRescheduleEventRestBody({
			invitee_uuid: 'INV_123',
			new_start_time: FUTURE_START,
			invitee_timezone: 'America/Los_Angeles',
			invitee_time_notation: '12h',
			reason: 'Conflict with another customer call',
		});

		expect(payload).toEqual({
			event: {
				start_time: FUTURE_START,
			},
			invitee: {
				uuid: 'INV_123',
				timezone: 'America/Los_Angeles',
				time_notation: '12h',
				cancel_reason: 'Conflict with another customer call',
			},
			rescheduling: {
				invitee_uuid: 'INV_123',
				is_publisher: false,
			},
		});
	});

	test('preserves duration and event type override when provided', () => {
		const payload = toRescheduleEventRestBody({
			invitee_uuid: 'INV_456',
			new_start_time: FUTURE_START,
			new_end_time: '2099-03-01T15:45:00Z',
			event_type: 'https://api.calendly.com/event_types/ET_456',
			invitee_timezone: 'America/New_York',
			invitee_time_notation: '24h',
		});

		expect(payload).toEqual({
			event: {
				start_time: FUTURE_START,
				duration_override: 45,
			},
			event_type_uuid: 'ET_456',
			invitee: {
				uuid: 'INV_456',
				timezone: 'America/New_York',
				time_notation: '24h',
			},
			rescheduling: {
				invitee_uuid: 'INV_456',
				is_publisher: false,
			},
		});
	});
});

describe('shapeRescheduleEventResult', () => {
	test('supports invitee-centric Calendly booking response shape', () => {
		const shaped = shapeRescheduleEventResult(
			{
				uri: 'https://api.calendly.com/scheduled_events/EVT_NEW/invitees/INV_NEW',
				event: {
					uri: 'https://api.calendly.com/scheduled_events/EVT_NEW',
					start_time: FUTURE_START,
					end_time: '2099-03-01T15:40:00Z',
					status: 'active',
				},
			},
			{
				new_start_time: FUTURE_START,
				invitee_uuid: 'INV_OLD',
				reschedule_url: 'https://calendly.com/reschedulings/INV_OLD',
			}
		);

		expect(shaped.resource).toMatchObject({
			event_uri: 'https://api.calendly.com/scheduled_events/EVT_NEW',
			event_uuid: 'EVT_NEW',
			invitee_uri: 'https://api.calendly.com/scheduled_events/EVT_NEW/invitees/INV_NEW',
			invitee_uuid: 'INV_NEW',
		});
	});
});

describe('deriveEndTimeFromDuration', () => {
	test('derives end time from source event duration', () => {
		const derived = deriveEndTimeFromDuration(
			'2099-03-01T15:00:00Z',
			'2026-03-01T10:00:00Z',
			'2026-03-01T10:45:00Z'
		);
		expect(derived).toBe('2099-03-01T15:45:00.000Z');
	});
});

describe('toSafeRescheduleEventError', () => {
	test('maps plan limitation and slot conflicts', () => {
		expect(
			toSafeRescheduleEventError({
				response: { status: 403 },
			})
		).toContain('paid Calendly plan');

		expect(
			toSafeRescheduleEventError({
				response: { status: 409 },
			})
		).toContain('new_start_time is unavailable');
	});

	test('maps invalid identifier and payload validation errors', () => {
		expect(
			toSafeRescheduleEventError({
				response: { status: 404 },
			})
		).toContain('identifier was not found');

		expect(
			toSafeRescheduleEventError({
				response: {
					status: 422,
					data: { message: 'event_end_time is invalid' },
				},
			})
		).toContain('event_end_time is invalid');
	});
});
