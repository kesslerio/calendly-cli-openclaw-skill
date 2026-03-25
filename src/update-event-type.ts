import { extractEventTypeUuid } from './get-event-type';

export type UpdateEventTypeCmdOptions = {
	raw?: string;
	eventTypeUri?: string;
	eventTypeUuid?: string;
	name?: string;
	description?: string;
	duration?: number | string;
	active?: boolean | string;
	secret?: boolean | string;
	dryRun?: boolean;
};

export type UpdateEventTypePatch = {
	name?: string;
	description?: string;
	duration?: number;
	active?: boolean;
	secret?: boolean;
};

export type UpdateEventTypeQuery = {
	event_type_uri: string;
	event_type_uuid: string;
	patch: UpdateEventTypePatch;
	changed_fields: string[];
	dry_run: boolean;
};

const EVENT_TYPE_URI_PREFIX = 'https://api.calendly.com/event_types/';
const DURATION_MIN = 15;
const DURATION_MAX = 480;

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

function normalizeOptionalBoolean(value: unknown, fieldName: 'active' | 'secret'): boolean | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be true or false`);
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') {
		return true;
	}
	if (normalized === 'false') {
		return false;
	}
	throw new Error(`${fieldName} must be true or false`);
}

function normalizeOptionalDuration(value: unknown): number | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const numeric =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: Number.NaN;
	if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
		throw new Error(`duration must be an integer between ${DURATION_MIN} and ${DURATION_MAX}`);
	}
	if (numeric < DURATION_MIN || numeric > DURATION_MAX) {
		throw new Error(`duration must be an integer between ${DURATION_MIN} and ${DURATION_MAX}`);
	}
	return numeric;
}

function normalizeOptionalEventTypeUuid(value: unknown): string | undefined {
	const normalized = normalizeOptionalString(value, 'event_type_uuid');
	if (!normalized) {
		return undefined;
	}
	if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
		throw new Error('event_type_uuid must be a Calendly event type id segment, not a URI');
	}
	return normalized;
}

function toEventTypeUri(eventTypeUuid: string): string {
	return `${EVENT_TYPE_URI_PREFIX}${eventTypeUuid}`;
}

function toRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

function extractResource(result: Record<string, unknown>): Record<string, unknown> | null {
	if (result.resource && typeof result.resource === 'object') {
		return toRecord(result.resource);
	}
	if (typeof result.uri === 'string' || typeof result.slug === 'string' || typeof result.name === 'string') {
		return toRecord(result);
	}
	return null;
}

function buildPatch(fields: Array<[string, unknown]>): { patch: UpdateEventTypePatch; changedFields: string[] } {
	const patch: UpdateEventTypePatch = {};
	const changedFields: string[] = [];

	for (const [field, value] of fields) {
		if (value !== undefined) {
			(patch as Record<string, unknown>)[field] = value;
			changedFields.push(field);
		}
	}

	if (changedFields.length === 0) {
		throw new Error(
			'at least one mutable field is required (provide one of --name, --description, --duration, --active, or --secret)'
		);
	}

	return { patch, changedFields };
}

export function normalizeUpdateEventTypeQuery(
	cmdOpts: UpdateEventTypeCmdOptions,
	defaults: Record<string, unknown> = {}
): UpdateEventTypeQuery {
	const eventTypeUri = normalizeOptionalString(cmdOpts.eventTypeUri ?? defaults.event_type_uri, 'event_type_uri');
	const eventTypeUuid = normalizeOptionalEventTypeUuid(cmdOpts.eventTypeUuid ?? defaults.event_type_uuid);

	if (!eventTypeUri && !eventTypeUuid) {
		throw new Error(
			'event_type_uri or event_type_uuid is required (use --event-type-uri, --event-type-uuid, or --raw {"event_type_uri":"..."} / {"event_type_uuid":"..."})'
		);
	}

	const resolvedUuid = eventTypeUri ? extractEventTypeUuid(eventTypeUri) : eventTypeUuid!;
	if (eventTypeUri && eventTypeUuid && resolvedUuid !== eventTypeUuid) {
		throw new Error('event_type_uri and event_type_uuid must refer to the same event type');
	}

	const name = normalizeOptionalString(cmdOpts.name ?? defaults.name, 'name');
	const description = normalizeOptionalString(cmdOpts.description ?? defaults.description, 'description');
	const duration = normalizeOptionalDuration(cmdOpts.duration ?? defaults.duration);
	const active = normalizeOptionalBoolean(cmdOpts.active ?? defaults.active, 'active');
	const secret = normalizeOptionalBoolean(cmdOpts.secret ?? defaults.secret, 'secret');

	const { patch, changedFields } = buildPatch([
		['name', name],
		['description', description],
		['duration', duration],
		['active', active],
		['secret', secret],
	]);

	return {
		event_type_uri: eventTypeUri ?? toEventTypeUri(resolvedUuid),
		event_type_uuid: resolvedUuid,
		patch,
		changed_fields: changedFields,
		dry_run: Boolean(cmdOpts.dryRun ?? defaults.dry_run ?? defaults.dryRun),
	};
}

export function toUpdateEventTypeMcpArgs(query: UpdateEventTypeQuery): Record<string, unknown> {
	return {
		event_type: query.event_type_uri,
		...query.patch,
	};
}

export function toUpdateEventTypeRestBody(query: UpdateEventTypeQuery): Record<string, unknown> {
	return { ...query.patch };
}

export function shapeUpdateEventTypeResult(
	result: unknown,
	query: UpdateEventTypeQuery
): Record<string, unknown> {
	const response = toRecord(result);
	const resource = extractResource(response);
	return {
		query: {
			event_type_uri: query.event_type_uri,
			event_type_uuid: query.event_type_uuid,
		},
		meta: {
			dry_run: false,
			changed_fields: [...query.changed_fields],
		},
		resource,
	};
}

export function shapeUpdateEventTypeDryRun(
	query: UpdateEventTypeQuery
): Record<string, unknown> {
	return {
		query: {
			event_type_uri: query.event_type_uri,
			event_type_uuid: query.event_type_uuid,
		},
		meta: {
			dry_run: true,
			changed_fields: [...query.changed_fields],
		},
		patch: toUpdateEventTypeRestBody(query),
		resource: null,
	};
}

export function toSafeUpdateEventTypeError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (message.includes('Cannot update a non solo event type')) {
		return 'Calendly only allows updating solo event types through this endpoint. Team, collective, and round-robin event types are not supported.';
	}
	if (/\b401\b|\b403\b/.test(message)) {
		return 'You do not have permission to update this event type. Verify token access and event type ownership.';
	}
	if (/\b404\b/.test(message)) {
		return 'event_type was not found. Verify --event-type-uri or --event-type-uuid.';
	}
	if (message.includes('duration must be an integer between')) {
		return message;
	}
	if (
		message.includes('event_type_uri or event_type_uuid is required') ||
		message.includes('event_type_uri and event_type_uuid must refer to the same event type') ||
		message.includes('event_type_uri must include an event type UUID') ||
		message.includes('event_type_uuid must be a Calendly event type id segment') ||
		message.includes('at least one mutable field is required') ||
		message.includes('must be a non-empty string') ||
		message.includes('must be true or false')
	) {
		return message;
	}
	return 'Unable to update event type. Verify identifiers, requested fields, and account permissions.';
}
