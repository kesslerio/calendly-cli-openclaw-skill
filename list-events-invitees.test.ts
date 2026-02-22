import { describe, expect, test } from 'bun:test';
import {
	eventInviteeCount,
	extractInviteePaginationMeta,
	normalizeExpandValues,
	normalizeInvitees,
	shouldIncludeInvitees,
	toCalendlyScheduledEventsParams,
} from './src/list-events-invitees';

describe('normalizeExpandValues', () => {
	test('handles csv, arrays and empty values', () => {
		expect(normalizeExpandValues(' invitees , location ')).toEqual(['invitees', 'location']);
		expect(normalizeExpandValues(['invitees,location', ' questions '])).toEqual(['invitees', 'location', 'questions']);
		expect(normalizeExpandValues(undefined)).toEqual([]);
	});
});

describe('shouldIncludeInvitees', () => {
	test('enables invitees from explicit flag or expand value', () => {
		expect(shouldIncludeInvitees({ include_invitees: true })).toBe(true);
		expect(shouldIncludeInvitees({ expand: 'invitees' })).toBe(true);
		expect(shouldIncludeInvitees({ expand: ['location', 'invitees'] })).toBe(true);
		expect(shouldIncludeInvitees({ expand: 'location' })).toBe(false);
	});
});

describe('toCalendlyScheduledEventsParams', () => {
	test('builds compatibility params without invitee expansion by default', () => {
		const params = toCalendlyScheduledEventsParams({
			user_uri: 'https://api.calendly.com/users/U',
			status: 'active',
			count: 20,
		});
		expect(params.get('user')).toBe('https://api.calendly.com/users/U');
		expect(params.get('status')).toBe('active');
		expect(params.get('count')).toBe('20');
		expect(params.get('expand')).toBeNull();
	});

	test('adds invitee expansion when requested', () => {
		const params = toCalendlyScheduledEventsParams({ include_invitees: true });
		expect(params.get('expand')).toBe('invitees');
	});
});

describe('normalizeInvitees and eventInviteeCount', () => {
	test('parses invitees arrays and ignores invalid values', () => {
		const invitees = normalizeInvitees([
			{ email: 'one@example.com', name: 'One' },
			null,
			'bad',
			{ email: 'two@example.com' },
		]);
		expect(invitees.length).toBe(2);
		expect(invitees[0].email).toBe('one@example.com');
		expect(eventInviteeCount({ invitees })).toBe(2);
	});

	test('returns empty array/count for empty and non-array cases', () => {
		expect(normalizeInvitees(undefined)).toEqual([]);
		expect(normalizeInvitees({})).toEqual([]);
		expect(eventInviteeCount({ invitees: undefined })).toBe(0);
		expect(eventInviteeCount({ invitees: [] })).toBe(0);
	});
});

describe('extractInviteePaginationMeta', () => {
	test('tracks pagination token presence', () => {
		expect(extractInviteePaginationMeta({ pagination: { next_page_token: 'abc' } })).toEqual({
			has_more: true,
			next_page_token: 'abc',
		});
		expect(extractInviteePaginationMeta({ pagination: { next_page_token: '' } })).toEqual({
			has_more: false,
			next_page_token: undefined,
		});
		expect(extractInviteePaginationMeta({})).toEqual({
			has_more: false,
			next_page_token: undefined,
		});
	});
});
