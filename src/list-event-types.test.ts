import { describe, expect, test } from 'bun:test';
import {
	normalizeListEventTypesQuery,
	shapeListEventTypesResult,
	toListEventTypesMcpArgs,
} from './list-event-types';

describe('normalizeListEventTypesQuery', () => {
	test('normalizes scope and count from flags', () => {
		const query = normalizeListEventTypesQuery({
			userUri: ' https://api.calendly.com/users/U1 ',
			count: 25,
		});

		expect(query).toEqual({
			user_uri: 'https://api.calendly.com/users/U1',
			count: 25,
		});
	});

	test('supports raw fallbacks including upstream key names', () => {
		const query = normalizeListEventTypesQuery(
			{
				organizationUri: ' https://api.calendly.com/organizations/ORG_FLAG ',
			},
			{
				user: 'https://api.calendly.com/users/U_RAW',
				organization: 'https://api.calendly.com/organizations/ORG_RAW',
				count: 40,
			}
		);

		expect(query).toEqual({
			user_uri: 'https://api.calendly.com/users/U_RAW',
			organization_uri: 'https://api.calendly.com/organizations/ORG_FLAG',
			count: 40,
		});
	});

	test('rejects missing scope filters', () => {
		expect(() => normalizeListEventTypesQuery({})).toThrow('either user_uri or organization_uri is required');
	});

	test('rejects invalid count', () => {
		expect(() =>
			normalizeListEventTypesQuery(
				{
					userUri: 'https://api.calendly.com/users/U1',
				},
				{ count: 'bad' }
			)
		).toThrow('count must be an integer between 1 and 100');

		expect(() =>
			normalizeListEventTypesQuery({
				userUri: 'https://api.calendly.com/users/U1',
				count: 101,
			})
		).toThrow('count must be an integer between 1 and 100');
	});
});

describe('toListEventTypesMcpArgs', () => {
	test('maps normalized query to MCP argument names', () => {
		expect(
			toListEventTypesMcpArgs({
				user_uri: 'https://api.calendly.com/users/U1',
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 10,
			})
		).toEqual({
			user: 'https://api.calendly.com/users/U1',
			organization: 'https://api.calendly.com/organizations/O1',
			count: 10,
		});
	});
});

describe('shapeListEventTypesResult', () => {
	test('returns normalized query/meta and collection', () => {
		const shaped = shapeListEventTypesResult(
			{
				collection: [
					{
						uri: 'https://api.calendly.com/event_types/E1',
						name: 'Demo',
						duration: 30,
					},
					{
						uri: 'https://api.calendly.com/event_types/E2',
						name: 'Kickoff',
						duration: 60,
					},
				],
				pagination: {
					next_page_token: null,
				},
			},
			{
				user_uri: 'https://api.calendly.com/users/U1',
				count: 2,
			}
		);

		expect(shaped).toEqual({
			query: {
				user_uri: 'https://api.calendly.com/users/U1',
				count: 2,
			},
			meta: {
				event_types: 2,
			},
			collection: [
				{
					uri: 'https://api.calendly.com/event_types/E1',
					name: 'Demo',
					duration: 30,
				},
				{
					uri: 'https://api.calendly.com/event_types/E2',
					name: 'Kickoff',
					duration: 60,
				},
			],
			pagination: {
				next_page_token: null,
			},
		});
	});
});
