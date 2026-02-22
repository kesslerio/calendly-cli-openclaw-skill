export type TeamSearchOptions = {
	email: string;
	min_start_time?: string;
	max_start_time?: string;
	status?: 'active' | 'canceled';
	organization_uri?: string;
	count: number;
	max_membership_pages: number;
};

export type TeamSearchTruncationReason = 'membership_page_limit' | 'member_event_page_limit' | 'result_cap';

export type TeamMemberContext = {
	membership_uri?: string;
	user_uri?: string;
	user_email?: string;
	user_name?: string;
	organization_uri?: string;
};

export function normalizeTeamSearchOptions(cmdOpts: Record<string, unknown>, rawArgs: Record<string, unknown>): TeamSearchOptions {
	const emailInput = cmdOpts.email ?? rawArgs.email;
	if (!emailInput || typeof emailInput !== 'string' || emailInput.trim().length === 0) {
		throw new Error('email is required (use --email or --raw {"email":"..."})');
	}

	const countInput = Number(cmdOpts.count ?? rawArgs.count ?? 20);
	if (!Number.isFinite(countInput)) {
		throw new Error('count must be a valid number');
	}
	const count = Math.max(1, Math.min(100, Math.trunc(countInput)));

	const maxMembershipPagesInput = Number(cmdOpts.maxMembershipPages ?? rawArgs.max_membership_pages ?? 10);
	if (!Number.isFinite(maxMembershipPagesInput)) {
		throw new Error('max_membership_pages must be a valid number');
	}
	const max_membership_pages = Math.max(1, Math.trunc(maxMembershipPagesInput));

	const statusInput = cmdOpts.status ?? rawArgs.status;
	if (statusInput !== undefined && statusInput !== 'active' && statusInput !== 'canceled') {
		throw new Error('status must be either "active" or "canceled"');
	}

	return {
		email: emailInput.trim().toLowerCase(),
		min_start_time: (cmdOpts.minStartTime ?? rawArgs.min_start_time) as string | undefined,
		max_start_time: (cmdOpts.maxStartTime ?? rawArgs.max_start_time) as string | undefined,
		status: statusInput as 'active' | 'canceled' | undefined,
		organization_uri: (cmdOpts.organizationUri ?? rawArgs.organization_uri) as string | undefined,
		count,
		max_membership_pages,
	};
}

export function filterInviteesByEmail(invitees: unknown, normalizedEmail: string): any[] {
	if (!Array.isArray(invitees)) return [];
	return invitees.filter((invitee: any) => {
		return typeof invitee?.email === 'string' && invitee.email.toLowerCase() === normalizedEmail;
	});
}

export function toTeamMemberContext(membership: any): TeamMemberContext {
	return {
		membership_uri: membership?.uri,
		user_uri: membership?.user,
		user_email: membership?.user_email,
		user_name: membership?.user_name,
		organization_uri: membership?.organization,
	};
}

export function getCountPageWindow(totalCount: number): { pageSize: number; maxPages: number } {
	const pageSize = Math.max(1, Math.min(100, Math.max(20, totalCount)));
	const maxPages = 5;
	return { pageSize, maxPages };
}

export function getTeamSearchTruncationReason(flags: {
	membershipPageLimitReached: boolean;
	memberEventPageLimitReached: boolean;
	resultCapReached: boolean;
}): TeamSearchTruncationReason | undefined {
	if (flags.membershipPageLimitReached) return 'membership_page_limit';
	if (flags.memberEventPageLimitReached) return 'member_event_page_limit';
	if (flags.resultCapReached) return 'result_cap';
	return undefined;
}
