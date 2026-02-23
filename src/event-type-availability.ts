const ISO_8601_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_8601_EXAMPLE = '2026-01-20T00:00:00Z';
const TIMEZONE_EXAMPLE = 'America/New_York';
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type EventTypeAvailabilityCmdOptions = {
	raw?: string;
	eventTypeUri?: string;
	startTime?: string;
	endTime?: string;
	timezone?: string;
};

export type EventTypeAvailabilityQuery = {
	event_type_uri: string;
	event_type: string;
	start_time: string;
	end_time: string;
	timezone?: string;
};

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

function normalizeIso8601Timestamp(value: unknown, fieldName: 'start_time' | 'end_time'): string {
	const normalized = normalizeRequiredString(
		value,
		fieldName,
		`${fieldName} is required (use --${fieldName.replace('_', '-')} or --raw {"${fieldName}":"..."})`
	);
	if (!ISO_8601_TIMESTAMP.test(normalized)) {
		throw new Error(`${fieldName} must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	if (Number.isNaN(Date.parse(normalized))) {
		throw new Error(`${fieldName} must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	return normalized;
}

function normalizeTimezone(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`timezone must be a valid IANA timezone (example: ${TIMEZONE_EXAMPLE})`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`timezone must be a valid IANA timezone (example: ${TIMEZONE_EXAMPLE})`);
	}
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
	} catch {
		throw new Error(`timezone must be a valid IANA timezone (example: ${TIMEZONE_EXAMPLE})`);
	}
	return trimmed;
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeEventTypeAvailabilityQuery(
	cmdOpts: EventTypeAvailabilityCmdOptions,
	defaults: Record<string, unknown> = {}
): EventTypeAvailabilityQuery {
	const eventTypeUri = normalizeRequiredString(
		cmdOpts.eventTypeUri ?? defaults.event_type_uri ?? defaults.event_type,
		'event_type_uri',
		'event_type_uri is required (use --event-type-uri or --raw {"event_type_uri":"..."})'
	);
	const startTime = normalizeIso8601Timestamp(cmdOpts.startTime ?? defaults.start_time, 'start_time');
	const endTime = normalizeIso8601Timestamp(cmdOpts.endTime ?? defaults.end_time, 'end_time');
	const timezone = normalizeTimezone(cmdOpts.timezone ?? defaults.timezone);

	const startMs = Date.parse(startTime);
	const endMs = Date.parse(endTime);
	if (startMs > endMs) {
		throw new Error('start_time must be less than or equal to end_time');
	}
	if (endMs - startMs > MAX_WINDOW_MS) {
		throw new Error('availability window cannot exceed 7 days');
	}

	return {
		event_type_uri: eventTypeUri,
		event_type: eventTypeUri,
		start_time: startTime,
		end_time: endTime,
		...(timezone ? { timezone } : {}),
	};
}

type AvailabilitySlot = {
	start_time: string;
	end_time: string | null;
	scheduling_url: string | null;
	status?: string;
	invitees_remaining?: number;
};

function normalizeAvailabilitySlot(slot: unknown): AvailabilitySlot {
	const record = slot && typeof slot === 'object' ? (slot as Record<string, unknown>) : {};
	const startTime = typeof record.start_time === 'string' ? record.start_time : '';
	const endTime = typeof record.end_time === 'string' ? record.end_time : null;
	const schedulingUrl = typeof record.scheduling_url === 'string' ? record.scheduling_url : null;
	const status = typeof record.status === 'string' ? record.status : undefined;
	const inviteesRemaining = toOptionalFiniteNumber(record.invitees_remaining);
	return {
		start_time: startTime,
		end_time: endTime,
		scheduling_url: schedulingUrl,
		...(status ? { status } : {}),
		...(inviteesRemaining !== undefined ? { invitees_remaining: inviteesRemaining } : {}),
	};
}

export function shapeEventTypeAvailabilityResult(
	result: unknown,
	query: EventTypeAvailabilityQuery
): Record<string, unknown> {
	const response = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
	const collectionRaw = Array.isArray(response.collection) ? response.collection : [];
	const collection = collectionRaw.map((slot) => normalizeAvailabilitySlot(slot));
	const querySummary: Record<string, unknown> = {
		event_type_uri: query.event_type_uri,
		start_time: query.start_time,
		end_time: query.end_time,
	};
	if (query.timezone) {
		querySummary.timezone = query.timezone;
	}
	const shaped: Record<string, unknown> = {
		query: querySummary,
		meta: {
			slots: collection.length,
		},
		collection,
	};
	if (response.pagination && typeof response.pagination === 'object') {
		shaped.pagination = response.pagination;
	}
	return shaped;
}
