export type ListEventsInviteesQuery = {
	user_uri?: string;
	organization_uri?: string;
	status?: string;
	max_start_time?: string;
	min_start_time?: string;
	count?: number;
	expand?: string | string[];
	include_invitees?: boolean;
};

export type Invitee = {
	email?: string;
	name?: string;
};

export type InviteePaginationMeta = {
	has_more: boolean;
	next_page_token?: string;
};

export function normalizeExpandValues(expand: unknown): string[] {
	if (Array.isArray(expand)) {
		return expand
			.flatMap((entry) => String(entry).split(','))
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean);
	}
	if (typeof expand === 'string') {
		return expand
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean);
	}
	return [];
}

export function shouldIncludeInvitees(options: ListEventsInviteesQuery): boolean {
	if (options.include_invitees === true) {
		return true;
	}
	const expands = normalizeExpandValues(options.expand);
	return expands.includes('invitees');
}

export function toCalendlyScheduledEventsParams(options: ListEventsInviteesQuery): URLSearchParams {
	const params = new URLSearchParams();
	if (options.user_uri) params.append('user', options.user_uri);
	if (options.organization_uri) params.append('organization', options.organization_uri);
	if (options.status) params.append('status', options.status);
	if (options.max_start_time) params.append('max_start_time', options.max_start_time);
	if (options.min_start_time) params.append('min_start_time', options.min_start_time);
	if (options.count !== undefined) params.append('count', String(options.count));
	if (shouldIncludeInvitees(options)) params.append('expand', 'invitees');
	return params;
}

export function normalizeInvitees(invitees: unknown): Invitee[] {
	if (!Array.isArray(invitees)) {
		return [];
	}
	return invitees.filter((invitee) => Boolean(invitee) && typeof invitee === 'object') as Invitee[];
}

export function eventInviteeCount(event: any): number {
	return normalizeInvitees(event?.invitees).length;
}

export function extractInviteePaginationMeta(responseData: any): InviteePaginationMeta {
	const token = responseData?.pagination?.next_page_token;
	const nextPageToken = typeof token === 'string' && token.length > 0 ? token : undefined;
	return {
		has_more: Boolean(nextPageToken),
		next_page_token: nextPageToken,
	};
}
