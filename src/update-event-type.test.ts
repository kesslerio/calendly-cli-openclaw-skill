import { describe, expect, test } from 'bun:test';
import {
	normalizeUpdateEventTypeQuery,
	shapeUpdateEventTypeDryRun,
	shapeUpdateEventTypeResult,
	toSafeUpdateEventTypeError,
	toUpdateEventTypeMcpArgs,
	toUpdateEventTypeRestBody,
} from './update-event-type';

describe('normalizeUpdateEventTypeQuery', () => {
	test('normalizes uri, patch fields, and dry-run from flags', () => {
		const query = normalizeUpdateEventTypeQuery({
			eventTypeUri: ' https://api.calendly.com/event_types/ET_123 ',
			duration: '30',
			active: 'true',
			dryRun: true,
		});

		expect(query).toEqual({
			event_type_uri: 'https://api.calendly.com/event_types/ET_123',
			event_type_uuid: 'ET_123',
			patch: {
				duration: 30,
				active: true,
			},
			changed_fields: ['duration', 'active'],
			dry_run: true,
		});
	});

	test('supports uuid alias and raw fallbacks', () => {
		const query = normalizeUpdateEventTypeQuery(
			{
				eventTypeUuid: 'ET_FLAG',
				name: ' Updated Name ',
			},
			{
				description: 'Updated description',
				secret: 'false',
			}
		);

		expect(query).toEqual({
			event_type_uri: 'https://api.calendly.com/event_types/ET_FLAG',
			event_type_uuid: 'ET_FLAG',
			patch: {
				name: 'Updated Name',
				description: 'Updated description',
				secret: false,
			},
			changed_fields: ['name', 'description', 'secret'],
			dry_run: false,
		});
	});

	test('rejects missing identifier', () => {
		expect(() => normalizeUpdateEventTypeQuery({ duration: 30 })).toThrow(
			'event_type_uri or event_type_uuid is required'
		);
	});

	test('rejects uri and uuid mismatch', () => {
		expect(() =>
			normalizeUpdateEventTypeQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/ET_URI',
				eventTypeUuid: 'ET_FLAG',
				duration: 30,
			})
		).toThrow('event_type_uri and event_type_uuid must refer to the same event type');
	});

	test('rejects missing mutable fields', () => {
		expect(() =>
			normalizeUpdateEventTypeQuery({
				eventTypeUri: 'https://api.calendly.com/event_types/ET_123',
			})
		).toThrow('at least one mutable field is required');
	});

	test('rejects invalid duration bounds and non-integers', () => {
		expect(() =>
			normalizeUpdateEventTypeQuery({
				eventTypeUuid: 'ET_123',
				duration: 10,
			})
		).toThrow('duration must be an integer between 15 and 480');

		expect(() =>
			normalizeUpdateEventTypeQuery({
				eventTypeUuid: 'ET_123',
				duration: '30.5',
			})
		).toThrow('duration must be an integer between 15 and 480');
	});

	test('rejects invalid boolean values', () => {
		expect(() =>
			normalizeUpdateEventTypeQuery({
				eventTypeUuid: 'ET_123',
				active: 'yes',
			})
		).toThrow('active must be true or false');
	});

	test('rejects uuid aliases containing reserved uri delimiters', () => {
		expect(() =>
			normalizeUpdateEventTypeQuery({
				eventTypeUuid: 'ET_123?foo=bar',
				duration: 30,
			})
		).toThrow('event_type_uuid must be a Calendly event type id segment, not a URI');
	});
});

describe('update event type payload builders', () => {
	test('maps normalized query to MCP and REST payloads', () => {
		const query = normalizeUpdateEventTypeQuery({
			eventTypeUri: 'https://api.calendly.com/event_types/ET_123',
			name: 'Demo',
			duration: 45,
			secret: false,
		});

		expect(toUpdateEventTypeMcpArgs(query)).toEqual({
			event_type: 'https://api.calendly.com/event_types/ET_123',
			name: 'Demo',
			duration: 45,
			secret: false,
		});

		expect(toUpdateEventTypeRestBody(query)).toEqual({
			name: 'Demo',
			duration: 45,
			secret: false,
		});
	});
});

describe('update event type result shaping', () => {
	test('returns dry-run output with patch payload', () => {
		const query = normalizeUpdateEventTypeQuery({
			eventTypeUuid: 'ET_123',
			description: 'Updated description',
			dryRun: true,
		});

		expect(shapeUpdateEventTypeDryRun(query)).toEqual({
			query: {
				event_type_uri: 'https://api.calendly.com/event_types/ET_123',
				event_type_uuid: 'ET_123',
			},
			meta: {
				dry_run: true,
				changed_fields: ['description'],
			},
			patch: {
				description: 'Updated description',
			},
			resource: null,
		});
	});

	test('returns shaped resource from api-style payload', () => {
		const query = normalizeUpdateEventTypeQuery({
			eventTypeUri: 'https://api.calendly.com/event_types/ET_123',
			name: 'Updated',
		});

		expect(
			shapeUpdateEventTypeResult(
				{
					resource: {
						uri: 'https://api.calendly.com/event_types/ET_123',
						name: 'Updated',
						duration: 30,
					},
				},
				query
			)
		).toEqual({
			query: {
				event_type_uri: 'https://api.calendly.com/event_types/ET_123',
				event_type_uuid: 'ET_123',
			},
			meta: {
				dry_run: false,
				changed_fields: ['name'],
			},
			resource: {
				uri: 'https://api.calendly.com/event_types/ET_123',
				name: 'Updated',
				duration: 30,
			},
		});
	});

	test('supports direct resource payloads', () => {
		const query = normalizeUpdateEventTypeQuery({
			eventTypeUuid: 'ET_123',
			active: false,
		});

		expect(
			shapeUpdateEventTypeResult(
				{
					uri: 'https://api.calendly.com/event_types/ET_123',
					active: false,
				},
				query
			)
		).toEqual({
			query: {
				event_type_uri: 'https://api.calendly.com/event_types/ET_123',
				event_type_uuid: 'ET_123',
			},
			meta: {
				dry_run: false,
				changed_fields: ['active'],
			},
			resource: {
				uri: 'https://api.calendly.com/event_types/ET_123',
				active: false,
			},
		});
	});
});

describe('toSafeUpdateEventTypeError', () => {
	test('maps not found, permission, non-solo, and generic failures to safe messages', () => {
		expect(
			toSafeUpdateEventTypeError(new Error('Calendly API request failed (404): {"title":"Not Found"}'))
		).toBe('event_type was not found. Verify --event-type-uri or --event-type-uuid.');

		expect(
			toSafeUpdateEventTypeError(new Error('Calendly API request failed (403): {"title":"Forbidden"}'))
		).toBe('You do not have permission to update this event type. Verify token access and event type ownership.');

		expect(
			toSafeUpdateEventTypeError(
				new Error(
					'Calendly API request failed (400): {"title":"Invalid Argument","message":"The supplied parameters are invalid.","details":[{"message":"Cannot update a non solo event type"}]}'
				)
			)
		).toBe(
			'Calendly only allows updating solo event types through this endpoint. Team, collective, and round-robin event types are not supported.'
		);

		expect(
			toSafeUpdateEventTypeError(
				new Error(
					'event_type_uri must include an event type UUID (example: https://api.calendly.com/event_types/AAAAAAAAAAAAAAAA)'
				)
			)
		).toBe(
			'event_type_uri must include an event type UUID (example: https://api.calendly.com/event_types/AAAAAAAAAAAAAAAA)'
		);

		expect(toSafeUpdateEventTypeError(new Error('something unexpected happened'))).toBe(
			'Unable to update event type. Verify identifiers, requested fields, and account permissions.'
		);
	});
});
