import { describe, expect, test } from 'bun:test';
import {
	deriveEndTimeFromDuration,
	extractRescheduleIdentifiers,
	normalizeRescheduleEventQuery,
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
			inviteeUri: 'https://api.calendly.com/invitees/INV_222',
			newStartTime: FUTURE_START,
		}, {
			reschedule_url: 'https://calendly.com/reschedulings/INV_222?event=https%3A%2F%2Fapi.calendly.com%2Fscheduled_events%2FEVT_999',
		});

		expect(query.invitee_uuid).toBe('INV_222');
		expect(query.event_uuid).toBe('EVT_999');
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
});

describe('toRescheduleEventRestBody', () => {
	test('maps normalized query into Calendly reschedulings payload', () => {
		const payload = toRescheduleEventRestBody({
			event_uuid: 'EVT_123',
			new_start_time: FUTURE_START,
			new_end_time: '2099-03-01T15:30:00Z',
			event_type: 'https://api.calendly.com/event_types/ET_123',
			reason: 'Conflict with another customer call',
		});

		expect(payload).toEqual({
			event_type: 'https://api.calendly.com/event_types/ET_123',
			event_start_time: FUTURE_START,
			event_end_time: '2099-03-01T15:30:00Z',
			reason: 'Conflict with another customer call',
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
