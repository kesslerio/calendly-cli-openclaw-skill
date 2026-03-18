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

	test('accepts camelCase raw maxMembershipPages input', () => {
		const query = normalizeTeamEventsQuery(
			{},
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				maxMembershipPages: 3,
			}
		);

		expect(query.max_membership_pages).toBe(3);
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

	test('uses active invitee counts for active events and total counts for canceled events when invitees are not embedded', async () => {
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 10,
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
					],
				}),
				fetchMemberEventsPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/scheduled_events/E-active',
							name: 'Active Demo Call',
							start_time: '2026-03-01T15:00:00Z',
							status: 'active',
							invitees_counter: { total: 4, active: 1 },
						},
						{
							uri: 'https://api.calendly.com/scheduled_events/E1',
							name: 'Demo Call',
							start_time: '2026-03-02T15:00:00Z',
							status: 'canceled',
							invitees_counter: { total: 4, active: 0 },
						},
					],
				}),
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(result.collection).toHaveLength(2);
		expect(result.collection[0].invitee_count).toBe(1);
		expect(result.collection[1].invitee_count).toBe(4);
	});

	test('supplements current memberships with organization events so former-member history is still returned', async () => {
		let orgEventCalls = 0;
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 1,
			},
			{
				fetchMembershipPage: async () => ({ collection: [] }),
				fetchMemberEventsPage: async () => ({ collection: [] }),
				fetchOrganizationEventsPage: async () => {
					orgEventCalls += 1;
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/scheduled_events/E-former',
								name: 'Former Member Demo',
								start_time: '2026-02-01T15:00:00Z',
								status: 'active',
								invitees_counter: { active: 1, total: 1 },
							},
						],
					};
				},
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(orgEventCalls).toBe(1);
		expect(result.collection).toHaveLength(1);
		expect(result.collection[0].event.name).toBe('Former Member Demo');
		expect(result.collection[0].member.user_name).toBe('Former or unknown member');
	});

	test('keeps the org-wide supplement when membership scanning is truncated, with a conservative attribution label', async () => {
		let membershipCalls = 0;
		let orgEventCalls = 0;
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 1,
			},
			{
				fetchMembershipPage: async () => {
					membershipCalls += 1;
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/organization_memberships/M1',
								user: { uri: 'https://api.calendly.com/users/U1', email: 'a@example.com', name: 'Member A' },
								organization: 'https://api.calendly.com/organizations/O1',
							},
						],
						next_page_token: 'page-2',
					};
				},
				fetchMemberEventsPage: async () => ({ collection: [] }),
				fetchOrganizationEventsPage: async () => {
					orgEventCalls += 1;
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/scheduled_events/E-recovered',
								name: 'Recovered Org Event',
								start_time: '2026-03-03T15:00:00Z',
								status: 'active',
								invitees_counter: { active: 1, total: 1 },
							},
						],
					};
				},
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(membershipCalls).toBe(1);
		expect(orgEventCalls).toBe(1);
		expect(result.collection.some((record) => record.event.name === 'Recovered Org Event')).toBe(true);
		expect(result.collection.find((record) => record.event.name === 'Recovered Org Event')?.member.user_name).toBe('Unscanned, former, or unknown member');
		expect(result.meta.truncation_reason).toBe('membership_page_limit');
	});

	test('de-duplicates shared events returned from multiple member calendars', async () => {
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 10,
			},
			{
				fetchMembershipPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/organization_memberships/M1',
							user: { uri: 'https://api.calendly.com/users/U1', email: 'a@example.com', name: 'Member A' },
							organization: 'https://api.calendly.com/organizations/O1',
						},
						{
							uri: 'https://api.calendly.com/organization_memberships/M2',
							user: { uri: 'https://api.calendly.com/users/U2', email: 'b@example.com', name: 'Member B' },
							organization: 'https://api.calendly.com/organizations/O1',
						},
					],
				}),
				fetchMemberEventsPage: async (memberUserUri) => ({
					collection: [
						{
							uri: 'https://api.calendly.com/scheduled_events/E-shared',
							uuid: 'E-shared',
							name: `Shared Demo for ${memberUserUri}`,
							start_time: '2026-03-01T15:00:00Z',
							status: 'active',
						},
					],
				}),
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(result.collection).toHaveLength(1);
		expect(result.meta.events_returned).toBe(1);
		expect(result.collection[0].member.user_email).toBe('a@example.com');
		expect(result.collection[0].members.map((member) => member.user_email)).toEqual(['a@example.com', 'b@example.com']);
		expect(result.collection[0].event.uuid).toBe('E-shared');
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

	test('does not match event_type_name against event_type uri alone', async () => {
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 10,
				event_type_name: 'sales',
			},
			{
				fetchMembershipPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/organization_memberships/M1',
							user: { uri: 'https://api.calendly.com/users/U1', email: 'a@example.com', name: 'Member A' },
							organization: 'https://api.calendly.com/organizations/O1',
						},
					],
				}),
				fetchMemberEventsPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/scheduled_events/E1',
							name: 'Customer Check-in',
							start_time: '2026-03-01T15:00:00Z',
							status: 'active',
							event_type: {
								name: 'Customer Success Review',
								slug: 'customer-success-review',
								uri: 'https://api.calendly.com/event_types/sales-demo',
							},
						},
					],
				}),
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(result.collection).toHaveLength(0);
	});

	test('keeps upstream-prefiltered memberships when member_email is set but user_email is omitted', async () => {
		let eventCalls = 0;
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 10,
				member_email: 'prefiltered@example.com',
			},
			{
				fetchMembershipPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/organization_memberships/M1',
							user: 'https://api.calendly.com/users/U1',
							organization: 'https://api.calendly.com/organizations/O1',
						},
					],
				}),
				fetchMemberEventsPage: async () => {
					eventCalls += 1;
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/scheduled_events/E-prefiltered',
								name: 'Prefiltered Demo',
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
		expect(result.collection[0].event.name).toBe('Prefiltered Demo');
	});

	test('forwards computed page size so later sparse-match pages are still scanned', async () => {
		const pageSizes: number[] = [];
		const pageTokens: Array<string | undefined> = [];

		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 1,
				max_membership_pages: 10,
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
					],
				}),
				fetchMemberEventsPage: async (_memberUserUri, pageToken, _includeInvitees, pageSize) => {
					pageSizes.push(pageSize ?? -1);
					pageTokens.push(pageToken);
					if (!pageToken) {
						return {
							collection: [
								{
									uri: 'https://api.calendly.com/scheduled_events/E1',
									name: 'Internal Sync',
									start_time: '2026-03-01T15:00:00Z',
									status: 'active',
								},
							],
							next_page_token: 'page-2',
						};
					}
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/scheduled_events/E2',
								name: 'Demo Review',
								start_time: '2026-03-02T15:00:00Z',
								status: 'active',
							},
						],
					};
				},
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(pageSizes).toEqual([20, 20]);
		expect(pageTokens).toEqual([undefined, 'page-2']);
		expect(result.collection).toHaveLength(1);
		expect(result.collection[0].event.name).toBe('Demo Review');
		expect(result.meta.event_pages_scanned).toBe(2);
	});

	test('applies count after global chronological ordering across members', async () => {
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 2,
				max_membership_pages: 10,
			},
			{
				fetchMembershipPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/organization_memberships/M1',
							user: { uri: 'https://api.calendly.com/users/U1', email: 'a@example.com', name: 'Member A' },
							organization: 'https://api.calendly.com/organizations/O1',
						},
						{
							uri: 'https://api.calendly.com/organization_memberships/M2',
							user: { uri: 'https://api.calendly.com/users/U2', email: 'b@example.com', name: 'Member B' },
							organization: 'https://api.calendly.com/organizations/O1',
						},
					],
				}),
				fetchMemberEventsPage: async (memberUserUri) => {
					if (memberUserUri === 'https://api.calendly.com/users/U1') {
						return {
							collection: [
								{
									uri: 'https://api.calendly.com/scheduled_events/E1',
									name: 'Older A',
									start_time: '2026-03-03T15:00:00Z',
									status: 'active',
								},
								{
									uri: 'https://api.calendly.com/scheduled_events/E2',
									name: 'Newest A',
									start_time: '2026-03-05T15:00:00Z',
									status: 'active',
								},
							],
						};
					}
					return {
						collection: [
							{
								uri: 'https://api.calendly.com/scheduled_events/E3',
								name: 'Middle B',
								start_time: '2026-03-04T15:00:00Z',
								status: 'active',
							},
						],
					};
				},
				fetchEventInviteesPage: async () => ({ collection: [] }),
			}
		);

		expect(result.collection).toHaveLength(2);
		expect(result.collection.map((record) => record.event.name)).toEqual(['Older A', 'Middle B']);
		expect(result.meta.has_more).toBe(true);
		expect(result.meta.truncation_reason).toBe('result_cap');
	});

	test('treats max_invitee_fetches as a per-event cap during team hydration', async () => {
		let inviteeCalls = 0;
		const result = await scanTeamEvents(
			{
				organization_uri: 'https://api.calendly.com/organizations/O1',
				count: 20,
				max_membership_pages: 10,
				include_invitees: true,
				hydrate_invitees: true,
				max_invitee_fetches: 1,
			},
			{
				fetchMembershipPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/organization_memberships/M1',
							user: { uri: 'https://api.calendly.com/users/U1', email: 'a@example.com', name: 'Member A' },
							organization: 'https://api.calendly.com/organizations/O1',
						},
					],
				}),
				fetchMemberEventsPage: async () => ({
					collection: [
						{
							uri: 'https://api.calendly.com/scheduled_events/E1',
							name: 'Demo One',
							start_time: '2026-03-01T15:00:00Z',
							status: 'active',
							invitees_counter: { total: 1, active: 1 },
							invitees: [],
						},
						{
							uri: 'https://api.calendly.com/scheduled_events/E2',
							name: 'Demo Two',
							start_time: '2026-03-02T15:00:00Z',
							status: 'active',
							invitees_counter: { total: 1, active: 1 },
							invitees: [],
						},
					],
				}),
				fetchEventInviteesPage: async (eventUuid) => {
					inviteeCalls += 1;
					return { collection: [{ email: `${eventUuid.toLowerCase()}@example.com` }] };
				},
			}
		);

		expect(inviteeCalls).toBe(2);
		expect(result.collection).toHaveLength(2);
		expect(result.collection[0].invitees).toEqual([{ email: 'e1@example.com' }]);
		expect(result.collection[1].invitees).toEqual([{ email: 'e2@example.com' }]);
		expect(result.meta.invitee_hydration).toMatchObject({
			fetches_used: 2,
			max_fetches: 2,
			max_fetches_per_event: 1,
			events_hydrated: 2,
		});
	});
});
