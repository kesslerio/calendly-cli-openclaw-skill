export type GetEventTypeCmdOptions = {
	raw?: string;
	eventTypeUri?: string;
};

export type GetEventTypeQuery = {
	event_type_uri: string;
	event_type: string;
};

const EVENT_TYPE_URI_EXAMPLE = 'https://api.calendly.com/event_types/AAAAAAAAAAAAAAAA';

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

export function normalizeGetEventTypeQuery(
	cmdOpts: GetEventTypeCmdOptions,
	defaults: Record<string, unknown> = {}
): GetEventTypeQuery {
	const eventTypeUri = normalizeRequiredString(
		cmdOpts.eventTypeUri ?? defaults.event_type_uri ?? defaults.event_type,
		'event_type_uri',
		'event_type_uri is required (use --event-type-uri or --raw {"event_type_uri":"..."})'
	);
	return {
		event_type_uri: eventTypeUri,
		event_type: eventTypeUri,
	};
}

export function extractEventTypeUuid(eventTypeUri: string): string {
	const match = eventTypeUri.match(/\/event_types\/([^/?#]+)(?:[/?#]|$)/);
	if (!match || !match[1]) {
		throw new Error(`event_type_uri must include an event type UUID (example: ${EVENT_TYPE_URI_EXAMPLE})`);
	}
	return match[1];
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

export function shapeGetEventTypeResult(
	result: unknown,
	query: GetEventTypeQuery
): Record<string, unknown> {
	const response = toRecord(result);
	const resource = extractResource(response);
	const shaped: Record<string, unknown> = {
		query: {
			event_type_uri: query.event_type_uri,
		},
		meta: {
			found: Boolean(resource),
		},
		resource,
	};
	return shaped;
}
