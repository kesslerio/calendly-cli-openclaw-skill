import { describe, expect, test } from 'bun:test';
import {
	normalizeCreateEventTypeQuery,
	shapeCreateEventTypeResult,
	toCreateEventTypeMcpArgs,
	toCreateEventTypeRestBody,
	toSafeCreateEventTypeError,
} from './create-event-type';

describe('normalizeCreateEventTypeQuery', () => {
	test('normalizes user owner, duration, and optional fields from flags', () => {
		const query = normalizeCreateEventTypeQuery({
			userUri: ' https://api.calendly.com/users/USER_123 ',
			name: ' Demo Call ',
			duration: '30',
			active: 'true',
			color: '#FFF200',
			locale: 'DE',
		});

		expect(query).toEqual({
			owner: 'https://api.calendly.com/users/USER_123',
			name: 'Demo Call',
			duration: 30,
			active: true,
			color: '#fff200',
			locale: 'de',
		});
	});

	test('supports raw owner, duration options, and raw locations', () => {
		const query = normalizeCreateEventTypeQuery(
			{
				name: 'Partner Intro',
			},
			{
				owner: 'https://api.calendly.com/teams/TEAM_123',
				duration_options: ['15', 30],
				locations: [
					{
						kind: 'zoom_conference',
					},
					{
						kind: 'physical',
						location: 'HQ',
						additional_info: 'Suite 300',
					},
				],
			}
		);

		expect(query).toEqual({
			owner: 'https://api.calendly.com/teams/TEAM_123',
			name: 'Partner Intro',
			duration_options: [15, 30],
			locations: [
				{ kind: 'zoom_conference' },
				{ kind: 'physical', location: 'HQ', additional_info: 'Suite 300' },
			],
		});
	});

	test('supports single-location convenience flags', () => {
		const query = normalizeCreateEventTypeQuery({
			userUri: 'https://api.calendly.com/users/USER_123',
			name: 'Onsite Visit',
			duration: 45,
			locationKind: 'physical',
			location: '123 Main St',
			locationAdditionalInfo: 'Lobby desk',
		});

		expect(query.locations).toEqual([
			{
				kind: 'physical',
				location: '123 Main St',
				additional_info: 'Lobby desk',
			},
		]);
	});

	test('supports team owner and raw convenience location fields', () => {
		const query = normalizeCreateEventTypeQuery(
			{
				name: 'Team Handoff',
			},
			{
				team_uri: 'https://api.calendly.com/teams/TEAM_123',
				duration: 30,
				location_kind: 'physical',
				location: 'HQ',
				location_additional_info: 'Front desk',
			}
		);

		expect(query).toEqual({
			owner: 'https://api.calendly.com/teams/TEAM_123',
			name: 'Team Handoff',
			duration: 30,
			locations: [{ kind: 'physical', location: 'HQ', additional_info: 'Front desk' }],
		});
	});

	test('rejects missing owner', () => {
		expect(() =>
			normalizeCreateEventTypeQuery({
				name: 'Missing Owner',
				duration: 30,
			})
		).toThrow('owner is required');
	});

	test('rejects conflicting owner sources', () => {
		expect(() =>
			normalizeCreateEventTypeQuery(
				{
					userUri: 'https://api.calendly.com/users/USER_123',
					name: 'Conflict',
					duration: 30,
				},
				{
					owner: 'https://api.calendly.com/teams/TEAM_123',
				}
			)
		).toThrow('provide exactly one owner source');
	});

	test('rejects organization URIs for owner inputs', () => {
		expect(() =>
			normalizeCreateEventTypeQuery({
				name: 'Bad Owner',
				duration: 30,
			}, {
				owner: 'https://api.calendly.com/organizations/ORG_123',
			})
		).toThrow('owner must be a Calendly user or team URI');
	});

	test('rejects missing duration sources', () => {
		expect(() =>
			normalizeCreateEventTypeQuery({
				userUri: 'https://api.calendly.com/users/USER_123',
				name: 'No Duration',
			})
		).toThrow('provide duration or duration_options');
	});

	test('rejects duration not present in duration options', () => {
		expect(() =>
			normalizeCreateEventTypeQuery({
				userUri: 'https://api.calendly.com/users/USER_123',
				name: 'Mismatch',
				duration: 45,
				durationOption: [15, 30],
			})
		).toThrow('duration must be one of the provided duration_options values');
	});

	test('rejects invalid color, locale, and location detail combinations', () => {
		expect(() =>
			normalizeCreateEventTypeQuery({
				userUri: 'https://api.calendly.com/users/USER_123',
				name: 'Bad Color',
				duration: 30,
				color: 'fff200',
			})
		).toThrow('color must be a hexadecimal color');

		expect(() =>
			normalizeCreateEventTypeQuery({
				userUri: 'https://api.calendly.com/users/USER_123',
				name: 'Bad Locale',
				duration: 30,
				locale: 'jp',
			})
		).toThrow('locale must be one of');

		expect(() =>
			normalizeCreateEventTypeQuery({
				userUri: 'https://api.calendly.com/users/USER_123',
				name: 'Missing Kind',
				duration: 30,
				location: 'HQ',
			})
		).toThrow('location_kind is required when providing location details');
	});

	test('rejects duplicate or oversized duration option collections', () => {
		expect(() =>
			normalizeCreateEventTypeQuery({
				userUri: 'https://api.calendly.com/users/USER_123',
				name: 'Duplicates',
				durationOption: [15, 15],
			})
		).toThrow('duration_options values must be unique');

		expect(() =>
			normalizeCreateEventTypeQuery({
				userUri: 'https://api.calendly.com/users/USER_123',
				name: 'Too Many',
				durationOption: [15, 30, 45, 60, 90],
			})
		).toThrow('duration_options cannot include more than 4 values');
	});
});

describe('create event type payload builders', () => {
	test('maps normalized query to MCP and REST payloads', () => {
		const query = normalizeCreateEventTypeQuery({
			userUri: 'https://api.calendly.com/users/USER_123',
			name: 'Partner Call',
			duration: 30,
			active: false,
			locationKind: 'zoom_conference',
		});

		expect(toCreateEventTypeMcpArgs(query)).toEqual({
			owner: 'https://api.calendly.com/users/USER_123',
			name: 'Partner Call',
			duration: 30,
			active: false,
			locations: [{ kind: 'zoom_conference' }],
		});

		expect(toCreateEventTypeRestBody(query)).toEqual({
			owner: 'https://api.calendly.com/users/USER_123',
			name: 'Partner Call',
			duration: 30,
			active: false,
			locations: [{ kind: 'zoom_conference' }],
		});
	});
});

describe('shapeCreateEventTypeResult', () => {
	test('shapes wrapped resources', () => {
		const query = normalizeCreateEventTypeQuery({
			userUri: 'https://api.calendly.com/users/USER_123',
			name: 'Partner Call',
			duration: 30,
		});

		expect(
			shapeCreateEventTypeResult(
				{
					resource: {
						uri: 'https://api.calendly.com/event_types/ET_123',
						name: 'Partner Call',
						scheduling_url: 'https://calendly.com/acme/partner-call',
					},
				},
				query
			)
		).toEqual({
			query: {
				owner: 'https://api.calendly.com/users/USER_123',
				name: 'Partner Call',
				duration: 30,
			},
			meta: {
				created: true,
			},
			resource: {
				uri: 'https://api.calendly.com/event_types/ET_123',
				name: 'Partner Call',
				scheduling_url: 'https://calendly.com/acme/partner-call',
			},
		});
	});

	test('supports direct resource payloads', () => {
		const query = normalizeCreateEventTypeQuery({
			userUri: 'https://api.calendly.com/users/USER_123',
			name: 'Demo',
			duration: 30,
		});

		expect(
			shapeCreateEventTypeResult(
				{
					uri: 'https://api.calendly.com/event_types/ET_456',
					name: 'Demo',
					scheduling_url: 'https://calendly.com/acme/demo',
				},
				query
			)
		).toEqual({
			query: {
				owner: 'https://api.calendly.com/users/USER_123',
				name: 'Demo',
				duration: 30,
			},
			meta: {
				created: true,
			},
			resource: {
				uri: 'https://api.calendly.com/event_types/ET_456',
				name: 'Demo',
				scheduling_url: 'https://calendly.com/acme/demo',
			},
		});
	});
});

describe('toSafeCreateEventTypeError', () => {
	test('maps local validation, scope, auth, and generic failures to safe messages', () => {
		expect(toSafeCreateEventTypeError(new Error('owner is required'))).toBe('owner is required');

		expect(
			toSafeCreateEventTypeError(
				new Error('Calendly API request failed (403): {"title":"Insufficient scope","required_scopes":["event_types:write"]}')
			)
		).toBe('Your token is missing the event_types:write scope required to create event types.');

		expect(
			toSafeCreateEventTypeError(new Error('Calendly API request failed (401): {"title":"Unauthenticated"}'))
		).toBe('Unable to authenticate with Calendly. Verify CALENDLY_API_KEY.');

		expect(
			toSafeCreateEventTypeError(
				new Error('Calendly API request failed (400): {"message":"This endpoint only supports one-on-one event types (kind: \\"solo\\")"}')
			)
		).toBe('Calendly only allows creating solo event types through this endpoint.');

		expect(toSafeCreateEventTypeError(new Error('something unexpected happened'))).toBe(
			'Unable to create event type. Verify owner, requested fields, and token scope.'
		);
	});
});
