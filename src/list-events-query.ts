import { normalizeDateRange } from './date-range';

export type ListEventsCmdOptions = {
	raw?: string;
	userUri?: string;
	organizationUri?: string;
	status?: 'active' | 'canceled';
	maxStartTime?: string;
	minStartTime?: string;
	count?: number;
	includeInvitees?: boolean;
	expand?: string;
	hydrateInvitees?: boolean;
	maxInviteeFetches?: number;
};

export function normalizeListEventsQuery(
	cmdOpts: ListEventsCmdOptions,
	defaults: Record<string, unknown> = {}
): Record<string, unknown> {
	const query: Record<string, unknown> = { ...defaults };
	if (cmdOpts.userUri !== undefined) query.user_uri = cmdOpts.userUri;
	if (cmdOpts.organizationUri !== undefined) query.organization_uri = cmdOpts.organizationUri;
	if (cmdOpts.status !== undefined) query.status = cmdOpts.status;
	if (cmdOpts.maxStartTime !== undefined) query.max_start_time = cmdOpts.maxStartTime;
	if (cmdOpts.minStartTime !== undefined) query.min_start_time = cmdOpts.minStartTime;
	if (cmdOpts.count !== undefined) query.count = cmdOpts.count;
	if (cmdOpts.includeInvitees === true) query.include_invitees = true;
	if (cmdOpts.expand !== undefined) query.expand = cmdOpts.expand;
	if (cmdOpts.hydrateInvitees !== undefined) query.hydrate_invitees = cmdOpts.hydrateInvitees;
	if (cmdOpts.maxInviteeFetches !== undefined) query.max_invitee_fetches = cmdOpts.maxInviteeFetches;

	const { min_start_time, max_start_time } = normalizeDateRange({
		min_start_time: query.min_start_time,
		max_start_time: query.max_start_time,
	});
	if (min_start_time !== undefined) {
		query.min_start_time = min_start_time;
	} else {
		delete query.min_start_time;
	}
	if (max_start_time !== undefined) {
		query.max_start_time = max_start_time;
	} else {
		delete query.max_start_time;
	}
	return query;
}
