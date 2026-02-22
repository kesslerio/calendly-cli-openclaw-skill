import { describe, expect, test } from "bun:test";
import { filterInviteesByEmail, getCountPageWindow, getTeamSearchTruncationReason, normalizeTeamSearchOptions, toMembershipUserUri, toTeamMemberContext } from "./search-team-helpers";

describe('normalizeTeamSearchOptions', () => {
	test('throws when email is missing', () => {
		expect(() => normalizeTeamSearchOptions({}, {})).toThrow('email is required');
	});

	test('normalizes email and clamps count', () => {
		const options = normalizeTeamSearchOptions(
			{ email: ' Person@Example.com ', count: 999, status: 'active' },
			{}
		);
		expect(options.email).toBe('person@example.com');
		expect(options.count).toBe(100);
		expect(options.max_membership_pages).toBe(10);
		expect(options.status).toBe('active');
	});

	test('uses raw args fallback and preserves optional filters', () => {
		const options = normalizeTeamSearchOptions(
			{},
			{
				email: 'person@example.com',
				min_start_time: '2026-01-01T00:00:00Z',
				max_start_time: '2026-12-31T23:59:59Z',
				organization_uri: 'https://api.calendly.com/organizations/ORG',
				count: 12,
				max_membership_pages: 3,
			}
		);
		expect(options.email).toBe('person@example.com');
		expect(options.min_start_time).toBe('2026-01-01T00:00:00Z');
		expect(options.max_start_time).toBe('2026-12-31T23:59:59Z');
		expect(options.organization_uri).toBe('https://api.calendly.com/organizations/ORG');
		expect(options.count).toBe(12);
		expect(options.max_membership_pages).toBe(3);
	});

	test('rejects invalid status and non-numeric count', () => {
		expect(() => normalizeTeamSearchOptions(
			{ email: 'person@example.com', status: 'pending' },
			{}
		)).toThrow('status must be either "active" or "canceled"');

		expect(() => normalizeTeamSearchOptions(
			{ email: 'person@example.com', count: 'wat' },
			{}
		)).toThrow('count must be a valid number');

		expect(() => normalizeTeamSearchOptions(
			{ email: 'person@example.com', maxMembershipPages: 'wat' },
			{}
		)).toThrow('max_membership_pages must be a valid number');
	});

	test('rejects invalid ISO-8601 date bounds', () => {
		expect(() => normalizeTeamSearchOptions(
			{ email: 'person@example.com', minStartTime: '2026-01-01' },
			{}
		)).toThrow('min_start_time must be a valid ISO-8601 timestamp');

		expect(() => normalizeTeamSearchOptions(
			{ email: 'person@example.com', maxStartTime: 'invalid-date' },
			{}
		)).toThrow('max_start_time must be a valid ISO-8601 timestamp');
	});

	test('rejects min_start_time greater than max_start_time', () => {
		expect(() => normalizeTeamSearchOptions(
			{
				email: 'person@example.com',
				minStartTime: '2026-01-03T00:00:00Z',
				maxStartTime: '2026-01-01T00:00:00Z',
			},
			{}
		)).toThrow('min_start_time must be less than or equal to max_start_time');
	});

	test('clamps max membership pages to at least one', () => {
		const options = normalizeTeamSearchOptions(
			{ email: 'person@example.com', maxMembershipPages: 0 },
			{}
		);
		expect(options.max_membership_pages).toBe(1);
	});
});

describe('filterInviteesByEmail', () => {
	test('returns case-insensitive invitee matches only', () => {
		const matches = filterInviteesByEmail(
			[
				{ email: 'PERSON@example.com', name: 'Person' },
				{ email: 'other@example.com', name: 'Other' },
				{ name: 'No Email' },
				null,
			],
			'person@example.com'
		);
		expect(matches.length).toBe(1);
		expect(matches[0].email).toBe('PERSON@example.com');
	});

	test('handles non-array invitees', () => {
		expect(filterInviteesByEmail(undefined, 'person@example.com')).toEqual([]);
		expect(filterInviteesByEmail({}, 'person@example.com')).toEqual([]);
	});
});

describe('getCountPageWindow', () => {
	test('returns bounded multi-page scan window', () => {
		expect(getCountPageWindow(1)).toEqual({ pageSize: 20, maxPages: 5 });
		expect(getCountPageWindow(25)).toEqual({ pageSize: 25, maxPages: 5 });
		expect(getCountPageWindow(100)).toEqual({ pageSize: 100, maxPages: 5 });
	});
});

describe('getTeamSearchTruncationReason', () => {
	test('returns undefined when no truncation happened', () => {
		expect(getTeamSearchTruncationReason({
			membershipPageLimitReached: false,
			memberEventPageLimitReached: false,
			resultCapReached: false,
		})).toBeUndefined();
	});

	test('prioritizes membership limit, then member event limit, then result cap', () => {
		expect(getTeamSearchTruncationReason({
			membershipPageLimitReached: true,
			memberEventPageLimitReached: true,
			resultCapReached: true,
		})).toBe('membership_page_limit');

		expect(getTeamSearchTruncationReason({
			membershipPageLimitReached: false,
			memberEventPageLimitReached: true,
			resultCapReached: true,
		})).toBe('member_event_page_limit');

		expect(getTeamSearchTruncationReason({
			membershipPageLimitReached: false,
			memberEventPageLimitReached: false,
			resultCapReached: true,
		})).toBe('result_cap');
	});
});

describe('toMembershipUserUri', () => {
	test('extracts URI when membership.user is a string', () => {
		expect(toMembershipUserUri({ user: 'https://api.calendly.com/users/U1' })).toBe('https://api.calendly.com/users/U1');
	});

	test('extracts URI when membership.user is an object', () => {
		expect(
			toMembershipUserUri({
				user: {
					uri: 'https://api.calendly.com/users/U2',
					email: 'person@example.com',
					name: 'Person',
				},
			})
		).toBe('https://api.calendly.com/users/U2');
	});
});

describe('toTeamMemberContext', () => {
	test('uses flattened membership fields when present', () => {
		expect(
			toTeamMemberContext({
				uri: 'https://api.calendly.com/organization_memberships/M1',
				user: 'https://api.calendly.com/users/U1',
				user_email: 'flat@example.com',
				user_name: 'Flat Person',
				organization: 'https://api.calendly.com/organizations/O1',
			})
		).toEqual({
			membership_uri: 'https://api.calendly.com/organization_memberships/M1',
			user_uri: 'https://api.calendly.com/users/U1',
			user_email: 'flat@example.com',
			user_name: 'Flat Person',
			organization_uri: 'https://api.calendly.com/organizations/O1',
		});
	});

	test('falls back to nested user object when flattened fields are missing', () => {
		expect(
			toTeamMemberContext({
				uri: 'https://api.calendly.com/organization_memberships/M2',
				user: {
					uri: 'https://api.calendly.com/users/U2',
					email: 'nested@example.com',
					name: 'Nested Person',
				},
				organization: 'https://api.calendly.com/organizations/O2',
			})
		).toEqual({
			membership_uri: 'https://api.calendly.com/organization_memberships/M2',
			user_uri: 'https://api.calendly.com/users/U2',
			user_email: 'nested@example.com',
			user_name: 'Nested Person',
			organization_uri: 'https://api.calendly.com/organizations/O2',
		});
	});
});
