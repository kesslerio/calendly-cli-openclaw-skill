import { describe, expect, test } from "bun:test";
import { filterInviteesByEmail, getCountPageWindow, getTeamSearchTruncationReason, normalizeTeamSearchOptions } from "./search-team-helpers";

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
