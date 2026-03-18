import { describe, expect, test } from 'bun:test';
import { normalizeTeamEventsQuery, scanTeamEvents } from './team-events';

describe('normalizeTeamEventsQuery', () => {
	test('requires an organization URI and preserves filters', () => {
		const query = normalizeTeamEventsQuery(
			{
				organizationUri: ' https://api.calendly.com/organizations/O1 ',
				count: 5,
				includeInvitees: true,
				maxMembershipPages: 2,
				memberEmail: 'person@example.com',
				eventTypeName: 'demo',
			},
			{}
		);

		expect(query.organization_uri).toBe('https://api.calendly.com/organizations/O1');
		expect(query.count).toBe(5);
		expect(query.include_invitees).toBe(true);
		expect(query.max_membership_pages).toBe(2);
		expect(query.member_email).toBe('person@example.com');
		expect(query.event_type_name).toBe('demo');
	});
});

describe('scanTeamEvents', () => {
	test('scans member calendars and hydrates invitees when requested', async () => {
		let membershipCalls = 0;
		let eventCalls = 0;
		let inviteeCalls = 0;

		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 10,
				include_invitees: true,
				hydrate_invitees: true,
			},
			{
				fetchMembershipPage: async () => {
					membershipCalls += 1;
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/organization_memberships/M1',
								user: {
									uri: 'https://api.calendly.com/users/U1',
									email: 'a@example.com',
									name: 'Member A',
								},
								organization: 'https://api.calendly.com/organizations/O1',
							},
						],
					};
				},
				fetchMemberEventsPage: async (memberUserUri, pageToken, includeInvitees) => {
					eventCalls += 1;
					expect(memberUserUri).toBe('https://api.calendly.com/users/U1');
					expect(pageToken).toBeUndefined();
					expect(includeInvitees).toBe(true);
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/scheduled_events/E1',
								name: 'Demo Call',
								start_time: '2026-03-01T15:00:00Z',
								status: 'active',
								invitees_counter: { active: 1 },
								invitees: [],
							},
						],
					};
				},
				fetchEventInviteesPage: async (eventUuid) => {
					inviteeCalls += 1;
					expect(eventUuid).toBe('E1');
					return {
						collection: [{ email: 'invitee@example.com', name: 'Invitee One' }],
					};
				},
			}
		);

		expect(membershipCalls).toBe(1);
		expect(eventCalls).toBe(1);
		expect(inviteeCalls).toBe(1);
		expect(result.collection).toHaveLength(1);
		expect(result.collection[0].member.user_email).toBe('a@example.com');
		expect(result.collection[0].event.name).toBe('Demo Call');
		expect(result.collection[0].invitee_count).toBe(1);
		expect(result.collection[0].invitees).toEqual([{ email: 'invitee@example.com', name: 'Invitee One' }]);
		expect(result.meta.events_returned).toBe(1);
		expect(result.meta.include_invitees).toBe(true);
		expect(result.meta.invitee_hydration).toBeDefined();
	});

	test('filters by member email and event type name', async () => {
		let eventCalls = 0;

		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 10,
				member_email: 'b@example.com',
				event_type_name: 'demo',
			},
			{
				fetchMembershipPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/organization_memberships/M1',
							user: {
								uri: 'https://api.calendly.com/users/U1',
								email: 'a@example.com',
								name: 'Member A',
							},
							organization: 'https://api.calendly.com/organizations/O1',
						},
						{
							uri: 'https://api.calendly.com/organization_memberships/M2',
							user: {
								uri: 'https://api.calendly.com/users/U2',
								email: 'b@example.com',
								name: 'Member B',
							},
							organization: 'https://api.calendly.com/organizations/O1',
						},
					],
				}),
				fetchMemberEventsPage: async (memberUserUri) => {
					eventCalls += 1;
					return {
						collection: [
							{
								uri: `https://api.calendly.com/scheduled_events/${memberUserUri === 'https://api.calendly.com/users/U2' ? 'E2' : 'E1'}`,
								name: memberUserUri === 'https://api.calendly.com/users/U2' ? 'Demo Review' : 'Internal Sync',
								start_time: '2026-03-01T15:00:00Z',
								status: 'active',
							},
						],
					};
				},
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(eventCalls).toBe(1);
		expect(result.collection).toHaveLength(1);
		expect(result.collection[0].member.user_email).toBe('b@example.com');
		expect(result.collection[0].event.name).toBe('Demo Review');
		expect(result.meta.events_returned).toBe(1);
	});
});
