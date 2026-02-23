import { describe, expect, test } from 'bun:test';
import {
	extractEventTypeUuid,
	normalizeGetEventTypeQuery,
	shapeGetEventTypeResult,
} from './get-event-type';

describe('normalizeGetEventTypeQuery', () => {
	test('normalizes required args from flags', () => {
		const query = normalizeGetEventTypeQuery({
			eventTypeUri: ' https://api.calendly.com/event_types/AAA ',
		});

		expect(query).toEqual({
			event_type_uri: 'https://api.calendly.com/event_types/AAA',
			event_type: 'https://api.calendly.com/event_types/AAA',
		});
	});

	test('uses raw fallback and flag override', () => {
		const query = normalizeGetEventTypeQuery(
			{
				eventTypeUri: 'https://api.calendly.com/event_types/FLAG',
			},
			{
				event_type_uri: 'https://api.calendly.com/event_types/RAW',
			}
		);

		expect(query).toEqual({
			event_type_uri: 'https://api.calendly.com/event_types/FLAG',
			event_type: 'https://api.calendly.com/event_types/FLAG',
		});
	});

	test('accepts MCP-style event_type key in raw input', () => {
		const query = normalizeGetEventTypeQuery(
			{},
			{
				event_type: 'https://api.calendly.com/event_types/RAW_MCP',
			}
		);

		expect(query).toEqual({
			event_type_uri: 'https://api.calendly.com/event_types/RAW_MCP',
			event_type: 'https://api.calendly.com/event_types/RAW_MCP',
		});
	});

	test('rejects missing required args', () => {
		expect(() => normalizeGetEventTypeQuery({})).toThrow('event_type_uri is required');
	});
});

describe('extractEventTypeUuid', () => {
	test('extracts UUID from event type URI', () => {
		expect(extractEventTypeUuid('https://api.calendly.com/event_types/ABC123')).toBe('ABC123');
		expect(extractEventTypeUuid('https://api.calendly.com/event_types/ABC123/')).toBe('ABC123');
		expect(extractEventTypeUuid('https://api.calendly.com/event_types/ABC123?foo=bar')).toBe('ABC123');
	});

	test('rejects invalid event type URI format', () => {
		expect(() => extractEventTypeUuid('https://api.calendly.com/users/U1')).toThrow(
			'event_type_uri must include an event type UUID'
		);
	});
});

describe('shapeGetEventTypeResult', () => {
	test('returns normalized query/meta and resource from API-style payload', () => {
		const shaped = shapeGetEventTypeResult(
			{
				resource: {
					uri: 'https://api.calendly.com/event_types/E1',
					name: 'Demo',
					slug: 'demo',
					duration: 30,
				},
			},
			{
				event_type_uri: 'https://api.calendly.com/event_types/E1',
				event_type: 'https://api.calendly.com/event_types/E1',
			}
		);

		expect(shaped).toEqual({
			query: {
				event_type_uri: 'https://api.calendly.com/event_types/E1',
			},
			meta: {
				found: true,
			},
			resource: {
				uri: 'https://api.calendly.com/event_types/E1',
				name: 'Demo',
				slug: 'demo',
				duration: 30,
			},
		});
	});

	test('supports direct resource payloads and marks missing resources', () => {
		const direct = shapeGetEventTypeResult(
			{
				uri: 'https://api.calendly.com/event_types/E2',
				name: 'Kickoff',
			},
			{
				event_type_uri: 'https://api.calendly.com/event_types/E2',
				event_type: 'https://api.calendly.com/event_types/E2',
			}
		);
		expect((direct.meta as Record<string, unknown>).found).toBe(true);
		expect((direct.resource as Record<string, unknown>).uri).toBe('https://api.calendly.com/event_types/E2');

		const missing = shapeGetEventTypeResult(
			{},
			{
				event_type_uri: 'https://api.calendly.com/event_types/E3',
				event_type: 'https://api.calendly.com/event_types/E3',
			}
		);
		expect(missing).toEqual({
			query: {
				event_type_uri: 'https://api.calendly.com/event_types/E3',
			},
			meta: {
				found: false,
			},
			resource: null,
		});
	});
});
