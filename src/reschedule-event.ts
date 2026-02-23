const ISO_8601_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_8601_EXAMPLE = '2026-01-20T00:00:00Z';
const EVENT_URI_EXAMPLE = 'https://api.calendly.com/scheduled_events/AAAAAAAAAAAAAAAA';
const INVITEE_URI_EXAMPLE = 'https://api.calendly.com/invitees/BBBBBBBBBBBBBBBB';
const EVENT_TYPE_URI_EXAMPLE = 'https://api.calendly.com/event_types/CCCCCCCCCCCCCCCC';
const RESCHEDULE_URL_EXAMPLE = 'https://calendly.com/reschedulings/BBBBBBBBBBBBBBBB';
const CALENDLY_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{1,199}$/;

export type RescheduleEventCmdOptions = {
	raw?: string;
	eventUuid?: string;
	eventUri?: string;
	inviteeUuid?: string;
	inviteeUri?: string;
	rescheduleUrl?: string;
	newStartTime?: string;
	startTime?: string;
	newEndTime?: string;
	eventEndTime?: string;
	eventType?: string;
	reason?: string;
};

export type RescheduleEventQuery = {
	new_start_time: string;
	event_uuid?: string;
	invitee_uuid?: string;
	reschedule_url?: string;
	new_end_time?: string;
	event_type?: string;
	reason?: string;
};

export type RescheduleEventResolvedQuery = RescheduleEventQuery & {
	event_uuid: string;
	new_end_time: string;
	event_type: string;
};

type IdentifierSegment = 'scheduled_events' | 'invitees';

function toRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

function normalizeRequiredString(value: unknown, fieldName: string, requiredMessage: string): string {
	if (value === undefined || value === null) {
		throw new Error(requiredMessage);
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	return trimmed;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	return trimmed;
}

function parseUuidFromUri(uri: string | undefined, segment: string): string | undefined {
	if (!uri) {
		return undefined;
	}
	const regex = new RegExp(`/${segment}/([^/?#]+)(?:[/?#]|$)`);
	const match = uri.match(regex);
	return match && match[1] ? match[1] : undefined;
}

function tryDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function extractIdentifierValue(value: unknown, segment: IdentifierSegment): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const fromUri = parseUuidFromUri(trimmed, segment);
	if (fromUri && CALENDLY_ID_REGEX.test(fromUri)) {
		return fromUri;
	}

	const decoded = tryDecodeURIComponent(trimmed);
	if (decoded !== trimmed) {
		const fromDecoded = parseUuidFromUri(decoded, segment);
		if (fromDecoded && CALENDLY_ID_REGEX.test(fromDecoded)) {
			return fromDecoded;
		}
	}

	if (CALENDLY_ID_REGEX.test(trimmed)) {
		return trimmed;
	}
	return undefined;
}

function normalizeIdentifierInput(
	value: unknown,
	fieldName: string,
	segment: IdentifierSegment,
	example: string
): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	const identifier = extractIdentifierValue(trimmed, segment);
	if (!identifier) {
		const label = segment === 'scheduled_events' ? 'event UUID or URI' : 'invitee UUID or URI';
		throw new Error(`${fieldName} must be a Calendly ${label} (example: ${example})`);
	}
	return identifier;
}

function normalizeRescheduleUrl(value: unknown): string | undefined {
	const url = normalizeOptionalString(value, 'reschedule_url');
	if (!url) {
		return undefined;
	}
	try {
		new URL(url);
	} catch {
		throw new Error(`reschedule_url must be a valid URL (example: ${RESCHEDULE_URL_EXAMPLE})`);
	}
	return url;
}

function coalesceIdentifier(fieldName: string, values: Array<string | undefined>): string | undefined {
	const normalized = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
	if (normalized.length === 0) {
		return undefined;
	}
	const unique = [...new Set(normalized)];
	if (unique.length > 1) {
		throw new Error(`conflicting ${fieldName} values were provided; supply only one target ${fieldName}`);
	}
	return unique[0];
}

function normalizeNewStartTime(value: unknown): string {
	const newStartTime = normalizeRequiredString(
		value,
		'new_start_time',
		'new_start_time is required (use --new-start-time or --start-time or --raw {"new_start_time":"..."})'
	);
	if (!ISO_8601_TIMESTAMP.test(newStartTime) || Number.isNaN(Date.parse(newStartTime))) {
		throw new Error(`new_start_time must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	if (Date.parse(newStartTime) <= Date.now()) {
		throw new Error('new_start_time must be in the future');
	}
	return newStartTime;
}

function normalizeOptionalEndTime(value: unknown, newStartTime: string): string | undefined {
	const endTime = normalizeOptionalString(value, 'new_end_time');
	if (!endTime) {
		return undefined;
	}
	if (!ISO_8601_TIMESTAMP.test(endTime) || Number.isNaN(Date.parse(endTime))) {
		throw new Error(`new_end_time must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	if (Date.parse(endTime) <= Date.parse(newStartTime)) {
		throw new Error('new_end_time must be greater than new_start_time');
	}
	return endTime;
}

function normalizeEventType(value: unknown): string | undefined {
	const eventType = normalizeOptionalString(value, 'event_type');
	if (!eventType) {
		return undefined;
	}
	if (!eventType.includes('/event_types/')) {
		throw new Error(`event_type must be a Calendly event type URI (example: ${EVENT_TYPE_URI_EXAMPLE})`);
	}
	return eventType;
}

function normalizeReason(value: unknown): string | undefined {
	const reason = normalizeOptionalString(value, 'reason');
	if (!reason) {
		return undefined;
	}
	if (reason.length > 1000) {
		throw new Error('reason must be 1000 characters or fewer');
	}
	return reason;
}

export function extractRescheduleIdentifiers(value: unknown): {
	event_uuid?: string;
	invitee_uuid?: string;
} {
	if (typeof value !== 'string') {
		return {};
	}
	const raw = value.trim();
	if (!raw) {
		return {};
	}

	let eventUuid = extractIdentifierValue(raw, 'scheduled_events');
	let inviteeUuid = extractIdentifierValue(raw, 'invitees');

	let parsed: URL | undefined;
	try {
		parsed = new URL(raw);
	} catch {
		parsed = undefined;
	}

	if (parsed) {
		const eventParamKeys = ['event', 'event_uuid', 'eventUri', 'event_uri', 'scheduled_event'];
		for (const key of eventParamKeys) {
			if (eventUuid) break;
			const valueFromParam = parsed.searchParams.get(key);
			eventUuid = extractIdentifierValue(valueFromParam, 'scheduled_events') ?? eventUuid;
		}

		const inviteeParamKeys = ['invitee', 'invitee_uuid', 'inviteeUri', 'invitee_uri'];
		for (const key of inviteeParamKeys) {
			if (inviteeUuid) break;
			const valueFromParam = parsed.searchParams.get(key);
			inviteeUuid = extractIdentifierValue(valueFromParam, 'invitees') ?? inviteeUuid;
		}

		if (!inviteeUuid) {
			const fromReschedulingsPath = parseUuidFromUri(parsed.href, 'reschedulings');
			const fromReschedulePath = parseUuidFromUri(parsed.href, 'reschedule');
			const fromPath = fromReschedulingsPath ?? fromReschedulePath;
			if (fromPath && CALENDLY_ID_REGEX.test(fromPath)) {
				inviteeUuid = fromPath;
			}
		}
	}

	return {
		...(eventUuid ? { event_uuid: eventUuid } : {}),
		...(inviteeUuid ? { invitee_uuid: inviteeUuid } : {}),
	};
}

function pickString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value;
		}
	}
	return undefined;
}

function trimErrorDetail(value: string): string {
	return value.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function extractErrorDetail(data: unknown): string | undefined {
	const record = toRecord(data);
	const candidates = [
		record.message,
		record.title,
		record.detail,
		record.error,
		toRecord(record.resource)?.message,
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return trimErrorDetail(candidate);
		}
	}
	const details = Array.isArray(record.details) ? record.details : [];
	for (const entry of details) {
		const message = toRecord(entry).message;
		if (typeof message === 'string' && message.trim()) {
			return trimErrorDetail(message);
		}
	}
	return undefined;
}

export function normalizeRescheduleEventQuery(
	cmdOpts: RescheduleEventCmdOptions,
	defaults: Record<string, unknown> = {}
): RescheduleEventQuery {
	const rawEvent = toRecord(defaults.event);
	const rawInvitee = toRecord(defaults.invitee);

	const rescheduleUrl = normalizeRescheduleUrl(cmdOpts.rescheduleUrl ?? defaults.reschedule_url ?? defaults.rescheduleUrl);
	const urlIdentifiers = extractRescheduleIdentifiers(rescheduleUrl);

	const eventUuid = coalesceIdentifier('event_uuid', [
		normalizeIdentifierInput(cmdOpts.eventUuid ?? defaults.event_uuid ?? defaults.eventUuid, 'event_uuid', 'scheduled_events', EVENT_URI_EXAMPLE),
		normalizeIdentifierInput(cmdOpts.eventUri ?? defaults.event_uri ?? defaults.eventUri ?? rawEvent.uri, 'event_uri', 'scheduled_events', EVENT_URI_EXAMPLE),
		urlIdentifiers.event_uuid,
	]);

	const inviteeUuid = coalesceIdentifier('invitee_uuid', [
		normalizeIdentifierInput(cmdOpts.inviteeUuid ?? defaults.invitee_uuid ?? defaults.inviteeUuid, 'invitee_uuid', 'invitees', INVITEE_URI_EXAMPLE),
		normalizeIdentifierInput(cmdOpts.inviteeUri ?? defaults.invitee_uri ?? defaults.inviteeUri ?? rawInvitee.uri, 'invitee_uri', 'invitees', INVITEE_URI_EXAMPLE),
		urlIdentifiers.invitee_uuid,
	]);

	if (!eventUuid && !inviteeUuid) {
		throw new Error(
			'Provide at least one identifier: --event-uuid/--event-uri, --invitee-uuid/--invitee-uri, or --reschedule-url'
		);
	}

	const newStartTime = normalizeNewStartTime(
		cmdOpts.newStartTime ?? cmdOpts.startTime ?? defaults.new_start_time ?? defaults.start_time ?? defaults.event_start_time
	);
	const newEndTime = normalizeOptionalEndTime(
		cmdOpts.newEndTime ?? cmdOpts.eventEndTime ?? defaults.new_end_time ?? defaults.end_time ?? defaults.event_end_time,
		newStartTime
	);
	const eventType = normalizeEventType(cmdOpts.eventType ?? defaults.event_type ?? rawEvent.event_type);
	const reason = normalizeReason(cmdOpts.reason ?? defaults.reason ?? defaults.rescheduling_reason);

	return {
		new_start_time: newStartTime,
		...(eventUuid ? { event_uuid: eventUuid } : {}),
		...(inviteeUuid ? { invitee_uuid: inviteeUuid } : {}),
		...(rescheduleUrl ? { reschedule_url: rescheduleUrl } : {}),
		...(newEndTime ? { new_end_time: newEndTime } : {}),
		...(eventType ? { event_type: eventType } : {}),
		...(reason ? { reason } : {}),
	};
}

export function deriveEndTimeFromDuration(newStartTime: string, sourceStartTime: string, sourceEndTime: string): string {
	const newStartMs = Date.parse(newStartTime);
	const sourceStartMs = Date.parse(sourceStartTime);
	const sourceEndMs = Date.parse(sourceEndTime);
	if (!Number.isFinite(newStartMs) || !Number.isFinite(sourceStartMs) || !Number.isFinite(sourceEndMs)) {
		throw new Error('Unable to derive event_end_time from source event timestamps');
	}
	const durationMs = sourceEndMs - sourceStartMs;
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		throw new Error('Unable to derive event_end_time because source event duration is invalid');
	}
	return new Date(newStartMs + durationMs).toISOString();
}

export function toRescheduleEventMcpArgs(query: RescheduleEventQuery): Record<string, unknown> {
	return {
		...query,
		start_time: query.new_start_time,
		event_start_time: query.new_start_time,
		...(query.new_end_time ? { end_time: query.new_end_time, event_end_time: query.new_end_time } : {}),
	};
}

export function toRescheduleEventRestBody(query: RescheduleEventResolvedQuery): Record<string, unknown> {
	return {
		event_type: query.event_type,
		event_start_time: query.new_start_time,
		event_end_time: query.new_end_time,
		...(query.reason ? { reason: query.reason } : {}),
	};
}

export function shapeRescheduleEventResult(
	result: unknown,
	query: RescheduleEventQuery
): Record<string, unknown> {
	const response = toRecord(result);
	const resource = response.resource && typeof response.resource === 'object'
		? toRecord(response.resource)
		: response;

	const eventRecord = toRecord(resource.event ?? resource.scheduled_event ?? resource.new_event);
	const previousEventRecord = toRecord(resource.previous_event ?? resource.old_event);
	const inviteeRecord = toRecord(resource.invitee);

	const eventUri = pickString(resource.uri, resource.event, eventRecord.uri);
	const previousEventUri = pickString(resource.previous_event_uri, previousEventRecord.uri);
	const inviteeUri = pickString(resource.invitee_uri, inviteeRecord.uri, resource.invitee);

	return {
		query: {
			new_start_time: query.new_start_time,
			...(query.event_uuid ? { event_uuid: query.event_uuid } : {}),
			...(query.invitee_uuid ? { invitee_uuid: query.invitee_uuid } : {}),
		},
		meta: {
			rescheduled: Boolean(resource && Object.keys(resource).length > 0),
		},
		resource: {
			event_uri: eventUri ?? null,
			event_uuid: parseUuidFromUri(eventUri, 'scheduled_events') ?? query.event_uuid ?? null,
			previous_event_uri: previousEventUri ?? null,
			previous_event_uuid: parseUuidFromUri(previousEventUri, 'scheduled_events') ?? null,
			invitee_uri: inviteeUri ?? null,
			invitee_uuid: parseUuidFromUri(inviteeUri, 'invitees') ?? query.invitee_uuid ?? null,
			status: pickString(resource.status, eventRecord.status) ?? null,
			new_start_time: pickString(resource.event_start_time, eventRecord.start_time, query.new_start_time) ?? null,
			new_end_time: pickString(resource.event_end_time, eventRecord.end_time, query.new_end_time) ?? null,
			cancel_url: pickString(resource.cancel_url, inviteeRecord.cancel_url) ?? null,
			reschedule_url: pickString(resource.reschedule_url, inviteeRecord.reschedule_url, query.reschedule_url) ?? null,
		},
	};
}

export function toSafeRescheduleEventError(error: unknown): string {
	const record = toRecord(error);
	const response = toRecord(record.response);
	const status = typeof response.status === 'number' ? response.status : undefined;
	const detail = extractErrorDetail(response.data ?? record);
	const detailLower = detail?.toLowerCase();

	if (status === 401) {
		return 'Authentication failed. Set a valid CALENDLY_API_KEY.';
	}
	if (status === 403) {
		return 'Rescheduling API requires a paid Calendly plan (Standard or higher).';
	}
	if (status === 404) {
		return 'The event/invitee identifier was not found. Verify --event-uuid, --invitee-uuid, or --reschedule-url.';
	}
	if (status === 409 || (status === 422 && detailLower?.includes('available'))) {
		return 'The selected new_start_time is unavailable. Choose another slot from get-event-type-availability.';
	}
	if (status === 422 && detailLower?.includes('event_type')) {
		return 'Reschedule failed because event_type is invalid or inaccessible.';
	}
	if (status === 422 && detailLower?.includes('event_end_time')) {
		return 'Reschedule failed because event_end_time is invalid. Provide --new-end-time or verify event duration.';
	}
	if (status === 422) {
		return 'Reschedule request was rejected by Calendly. Verify identifiers and requested time.';
	}
	if (status === 429) {
		return 'Calendly API rate limit reached. Retry shortly.';
	}
	if (detail) {
		return `Unable to reschedule event: ${detail}`;
	}
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return 'Unable to reschedule event. Verify identifiers, event type, and requested time.';
}
