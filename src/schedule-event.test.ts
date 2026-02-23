import { describe, expect, test } from 'bun:test';
import {
	normalizeScheduleEventQuery,
	shapeScheduleEventResult,
	toSafeScheduleEventError,
	toScheduleEventRestBody,
} from './schedule-event';

const FUTURE_TIME = '2099-03-01T15:00:00Z';

describe('normalizeScheduleEventQuery', () => {
	test('normalizes required fields and optional invitee name', () => {
		const query = normalizeScheduleEventQuery({
			eventType: ' https://api.calendly.com/event_types/ET_123 ',
			startTime: FUTURE_TIME,
			inviteeEmail: ' Person@Example.com ',
			inviteeTimezone: 'America/New_York',
			inviteeName: 'John Smith',
		});

		expect(query).toEqual({
			event_type: 'https://api.calendly.com/event_types/ET_123',
			start_time: FUTURE_TIME,
			invitee_email: 'person@example.com',
			invitee_timezone: 'America/New_York',
			invitee_name: 'John Smith',
		});
	});

	test('supports nested raw invitee defaults', () => {
		const query = normalizeScheduleEventQuery(
			{
				eventType: 'https://api.calendly.com/event_types/ET_123',
				startTime: FUTURE_TIME,
			},
			{
				invitee: {
					email: 'invitee@example.com',
					timezone: 'America/Los_Angeles',
					first_name: 'Ada',
					last_name: 'Lovelace',
				},
			}
		);

		expect(query.invitee_email).toBe('invitee@example.com');
		expect(query.invitee_timezone).toBe('America/Los_Angeles');
		expect(query.invitee_first_name).toBe('Ada');
		expect(query.invitee_last_name).toBe('Lovelace');
	});

	test('parses questions from JSON object map', () => {
		const query = normalizeScheduleEventQuery({
			eventType: 'https://api.calendly.com/event_types/ET_123',
			startTime: FUTURE_TIME,
			inviteeEmail: 'invitee@example.com',
			inviteeTimezone: 'America/New_York',
			questions: '{"Company size":"50-100","Use case":"Partnerships"}',
		});

		expect(query.questions_and_answers).toEqual([
			{ question: 'Company size', answer: '50-100', position: 1 },
			{ question: 'Use case', answer: 'Partnerships', position: 2 },
		]);
	});

	test('validates event guests and dedupes stable order', () => {
		const query = normalizeScheduleEventQuery({
			eventType: 'https://api.calendly.com/event_types/ET_123',
			startTime: FUTURE_TIME,
			inviteeEmail: 'invitee@example.com',
			inviteeTimezone: 'America/New_York',
			eventGuest: ['guest2@example.com', 'guest1@example.com', 'guest2@example.com'],
		});

		expect(query.event_guests).toEqual(['guest2@example.com', 'guest1@example.com']);
	});

	test('uses raw event_guests when repeated --event-guest flags are not provided', () => {
		const query = normalizeScheduleEventQuery(
			{
				eventType: 'https://api.calendly.com/event_types/ET_123',
				startTime: FUTURE_TIME,
				inviteeEmail: 'invitee@example.com',
				inviteeTimezone: 'America/New_York',
			},
			{
				event_guests: ['raw1@example.com', 'raw2@example.com'],
			}
		);

		expect(query.event_guests).toEqual(['raw1@example.com', 'raw2@example.com']);
	});

	test('rejects missing required args', () => {
		expect(() => normalizeScheduleEventQuery({})).toThrow('event_type is required');
		expect(() =>
			normalizeScheduleEventQuery({
				eventType: 'https://api.calendly.com/event_types/ET_123',
				startTime: FUTURE_TIME,
			})
		).toThrow('invitee_email is required');
	});

	test('rejects invalid format and conflicting name args', () => {
		expect(() =>
			normalizeScheduleEventQuery({
				eventType: 'not-a-uri',
				startTime: FUTURE_TIME,
				inviteeEmail: 'invitee@example.com',
				inviteeTimezone: 'America/New_York',
			})
		).toThrow('event_type must be a Calendly event type URI');

		expect(() =>
			normalizeScheduleEventQuery({
				eventType: 'https://api.calendly.com/event_types/ET_123',
				startTime: FUTURE_TIME,
				inviteeEmail: 'invitee@example.com',
				inviteeTimezone: 'America/New_York',
				inviteeName: 'John Smith',
				inviteeFirstName: 'John',
			})
		).toThrow('provide either invitee_name or invitee_first_name/invitee_last_name');
	});

	test('rejects invalid timezone, past start_time, and location details without kind', () => {
		expect(() =>
			normalizeScheduleEventQuery({
				eventType: 'https://api.calendly.com/event_types/ET_123',
				startTime: FUTURE_TIME,
				inviteeEmail: 'invitee@example.com',
				inviteeTimezone: 'Mars/Olympus',
			})
		).toThrow('invitee_timezone must be a valid IANA timezone');

		expect(() =>
			normalizeScheduleEventQuery({
				eventType: 'https://api.calendly.com/event_types/ET_123',
				startTime: '2020-01-01T00:00:00Z',
				inviteeEmail: 'invitee@example.com',
				inviteeTimezone: 'America/New_York',
			})
		).toThrow('start_time must be in the future');

		expect(() =>
			normalizeScheduleEventQuery({
				eventType: 'https://api.calendly.com/event_types/ET_123',
				startTime: FUTURE_TIME,
				inviteeEmail: 'invitee@example.com',
				inviteeTimezone: 'America/New_York',
				locationDetails: 'Conference Room A',
			})
		).toThrow('location_kind is required when location_details is provided');
	});
});

describe('toScheduleEventRestBody', () => {
	test('maps flattened query into REST invitees payload', () => {
		const payload = toScheduleEventRestBody({
			event_type: 'https://api.calendly.com/event_types/ET_123',
			start_time: FUTURE_TIME,
			invitee_email: 'invitee@example.com',
			invitee_timezone: 'America/New_York',
			invitee_name: 'Invitee Name',
			location_kind: 'zoom_conference',
			event_guests: ['guest@example.com'],
			utm_source: 'newsletter',
		});

		expect(payload).toEqual({
			event_type: 'https://api.calendly.com/event_types/ET_123',
			start_time: FUTURE_TIME,
			invitee: {
				email: 'invitee@example.com',
				timezone: 'America/New_York',
				name: 'Invitee Name',
			},
			location: {
				kind: 'zoom_conference',
			},
			event_guests: ['guest@example.com'],
			tracking: {
				utm_campaign: null,
				utm_source: 'newsletter',
				utm_medium: null,
				utm_content: null,
				utm_term: null,
				salesforce_uuid: null,
			},
		});
	});
});

describe('shapeScheduleEventResult', () => {
	test('shapes invitee response with event UUID, links, and meta', () => {
		const shaped = shapeScheduleEventResult(
			{
				resource: {
					uri: 'https://api.calendly.com/invitees/INV_123',
					event: 'https://api.calendly.com/scheduled_events/EVT_456',
					name: 'Invitee Name',
					email: 'invitee@example.com',
					status: 'active',
					reschedule_url: 'https://calendly.com/resched/INV_123',
					cancel_url: 'https://calendly.com/cancel/INV_123',
					location: {
						join_url: 'https://zoom.us/j/123',
					},
					calendar_event: {
						google: 'https://calendar.google.com/event?eid=abc',
						outlook: 'https://outlook.office.com/calendar/abc',
					},
				},
			},
			{
				event_type: 'https://api.calendly.com/event_types/ET_123',
				start_time: FUTURE_TIME,
				invitee_email: 'invitee@example.com',
				invitee_timezone: 'America/New_York',
			}
		);

		expect((shaped.meta as Record<string, unknown>).scheduled).toBe(true);
		expect((shaped.resource as Record<string, unknown>).event_uuid).toBe('EVT_456');
		expect((shaped.resource as Record<string, unknown>).invitee_uuid).toBe('INV_123');
		expect((shaped.resource as Record<string, unknown>).meeting_link).toBe('https://zoom.us/j/123');
		expect((shaped.resource as Record<string, unknown>).add_to_calendar_links).toEqual({
			google: 'https://calendar.google.com/event?eid=abc',
			outlook: 'https://outlook.office.com/calendar/abc',
		});
	});
});

describe('toSafeScheduleEventError', () => {
	test('maps known API errors to safe messages', () => {
		expect(
			toSafeScheduleEventError({
				response: {
					status: 403,
				},
			})
		).toContain('paid Calendly plan');

		expect(
			toSafeScheduleEventError({
				response: {
					status: 409,
				},
			})
		).toContain('selected start_time is unavailable');

		expect(
			toSafeScheduleEventError({
				response: {
					status: 422,
					data: {
						message: 'Questions are invalid',
					},
				},
			})
		).toContain('custom questions');
	});
});
