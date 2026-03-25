export type CreateEventTypeCmdOptions = {
	raw?: string;
	userUri?: string;
	teamUri?: string;
	name?: string;
	active?: boolean | string;
	description?: string;
	duration?: number | string;
	durationOption?: Array<number | string>;
	color?: string;
	locale?: string;
	locationKind?: string;
	location?: string;
	locationAdditionalInfo?: string;
	locationPhoneNumber?: string;
};

export type CreateEventTypeLocationConfiguration = {
	kind: CreateEventTypeLocationKind;
	location?: string;
	additional_info?: string;
	phone_number?: string;
};

export type CreateEventTypeLocationKind =
	| 'ask_invitee'
	| 'custom'
	| 'google_conference'
	| 'gotomeeting_conference'
	| 'inbound_call'
	| 'microsoft_teams_conference'
	| 'outbound_call'
	| 'physical'
	| 'webex_conference'
	| 'zoom_conference';

export type CreateEventTypeLocale = 'de' | 'en' | 'es' | 'fr' | 'it' | 'nl' | 'pt' | 'uk';

export type CreateEventTypeQuery = {
	owner: string;
	name: string;
	active?: boolean;
	description?: string;
	duration?: number;
	duration_options?: number[];
	locations?: CreateEventTypeLocationConfiguration[];
	color?: string;
	locale?: CreateEventTypeLocale;
};

const HEX_COLOR_REGEX = /^#[a-f\d]{6}$/i;
const COLOR_EXAMPLE = '#fff200';
const DURATION_MIN = 1;
const DURATION_MAX = 720;
const MAX_DURATION_OPTIONS = 4;
const USER_URI_PREFIX = 'https://api.calendly.com/users/';
const TEAM_URI_PREFIX = 'https://api.calendly.com/teams/';

const LOCATION_KINDS: CreateEventTypeLocationKind[] = [
	'ask_invitee',
	'custom',
	'google_conference',
	'gotomeeting_conference',
	'inbound_call',
	'microsoft_teams_conference',
	'outbound_call',
	'physical',
	'webex_conference',
	'zoom_conference',
];

const LOCALES: CreateEventTypeLocale[] = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pt', 'uk'];

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

function normalizeOptionalBoolean(value: unknown, fieldName: 'active'): boolean | undefined {
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

function normalizeDurationValue(value: unknown, fieldName: 'duration' | 'duration_options'): number {
	const numeric =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: Number.NaN;

	if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
		throw new Error(`${fieldName} must contain integers between ${DURATION_MIN} and ${DURATION_MAX}`);
	}
	if (numeric < DURATION_MIN || numeric > DURATION_MAX) {
		throw new Error(`${fieldName} must contain integers between ${DURATION_MIN} and ${DURATION_MAX}`);
	}
	return numeric;
}

function normalizeOptionalDuration(value: unknown): number | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	return normalizeDurationValue(value, 'duration');
}

function normalizeDurationOptions(value: unknown): number[] | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const values = Array.isArray(value) ? value : [value];
	if (values.length === 0) {
		return undefined;
	}
	if (values.length > MAX_DURATION_OPTIONS) {
		throw new Error(`duration_options cannot include more than ${MAX_DURATION_OPTIONS} values`);
	}

	const normalized: number[] = [];
	for (const entry of values) {
		const numeric = normalizeDurationValue(entry, 'duration_options');
		if (normalized.includes(numeric)) {
			throw new Error('duration_options values must be unique');
		}
		normalized.push(numeric);
	}

	return normalized;
}

function normalizeColor(value: unknown): string | undefined {
	const color = normalizeOptionalString(value, 'color');
	if (!color) {
		return undefined;
	}
	if (!HEX_COLOR_REGEX.test(color)) {
		throw new Error(`color must be a hexadecimal color like ${COLOR_EXAMPLE}`);
	}
	return color.toLowerCase();
}

function normalizeLocale(value: unknown): CreateEventTypeLocale | undefined {
	const locale = normalizeOptionalString(value, 'locale');
	if (!locale) {
		return undefined;
	}
	const normalized = locale.toLowerCase();
	if (!LOCALES.includes(normalized as CreateEventTypeLocale)) {
		throw new Error(`locale must be one of: ${LOCALES.join(', ')}`);
	}
	return normalized as CreateEventTypeLocale;
}

function normalizeLocationKind(value: unknown): CreateEventTypeLocationKind | undefined {
	const kind = normalizeOptionalString(value, 'location_kind');
	if (!kind) {
		return undefined;
	}
	if (!LOCATION_KINDS.includes(kind as CreateEventTypeLocationKind)) {
		throw new Error(`location_kind must be one of: ${LOCATION_KINDS.join(', ')}`);
	}
	return kind as CreateEventTypeLocationKind;
}

function normalizeOwnerUri(value: unknown, fieldName: 'owner' | 'user_uri' | 'team_uri'): string | undefined {
	const owner = normalizeOptionalString(value, fieldName);
	if (!owner) {
		return undefined;
	}
	if (owner.startsWith(USER_URI_PREFIX) || owner.startsWith(TEAM_URI_PREFIX)) {
		return owner;
	}
	throw new Error(`${fieldName} must be a Calendly user or team URI`);
}

function normalizeFlagLocation(
	locationKindValue: unknown,
	locationValue: unknown,
	locationAdditionalInfoValue: unknown,
	locationPhoneNumberValue: unknown
): CreateEventTypeLocationConfiguration[] | undefined {
	const kind = normalizeLocationKind(locationKindValue);
	const location = normalizeOptionalString(locationValue, 'location');
	const additionalInfo = normalizeOptionalString(locationAdditionalInfoValue, 'location_additional_info');
	const phoneNumber = normalizeOptionalString(locationPhoneNumberValue, 'location_phone_number');

	if (!kind) {
		if (location || additionalInfo || phoneNumber) {
			throw new Error('location_kind is required when providing location details');
		}
		return undefined;
	}

	return [
		{
			kind,
			...(location ? { location } : {}),
			...(additionalInfo ? { additional_info: additionalInfo } : {}),
			...(phoneNumber ? { phone_number: phoneNumber } : {}),
		},
	];
}

function normalizeLocationRecord(value: unknown): CreateEventTypeLocationConfiguration {
	const record = toRecord(value);
	const kind = normalizeLocationKind(record.kind);
	if (!kind) {
		throw new Error('locations entries require a supported kind value');
	}

	const location = normalizeOptionalString(record.location, 'location');
	const additionalInfo = normalizeOptionalString(record.additional_info ?? record.additionalInfo, 'additional_info');
	const phoneNumber = normalizeOptionalString(record.phone_number ?? record.phoneNumber, 'phone_number');

	return {
		kind,
		...(location ? { location } : {}),
		...(additionalInfo ? { additional_info: additionalInfo } : {}),
		...(phoneNumber ? { phone_number: phoneNumber } : {}),
	};
}

function normalizeRawLocations(value: unknown): CreateEventTypeLocationConfiguration[] | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const values = Array.isArray(value) ? value : [value];
	if (values.length === 0) {
		return undefined;
	}
	return values.map((entry) => normalizeLocationRecord(entry));
}

function normalizeOwner(cmdOpts: CreateEventTypeCmdOptions, defaults: Record<string, unknown>): string {
	const ownerFromRaw = normalizeOwnerUri(defaults.owner ?? defaults.owner_uri, 'owner');
	const userUri = normalizeOwnerUri(cmdOpts.userUri ?? defaults.user_uri ?? defaults.user, 'user_uri');
	const teamUri = normalizeOwnerUri(cmdOpts.teamUri ?? defaults.team_uri ?? defaults.team, 'team_uri');

	const providedOwners = [ownerFromRaw, userUri, teamUri].filter((value): value is string => typeof value === 'string');
	const uniqueOwners = [...new Set(providedOwners)];
	if (uniqueOwners.length === 0) {
		throw new Error(
			'owner is required (use --user-uri, --team-uri, or --raw {"owner":"https://api.calendly.com/users/..."} )'
		);
	}
	if (uniqueOwners.length > 1) {
		throw new Error('provide exactly one owner source: owner, user_uri, or team_uri');
	}
	return uniqueOwners[0]!;
}

function extractResource(result: Record<string, unknown>): Record<string, unknown> | null {
	if (result.resource && typeof result.resource === 'object') {
		return toRecord(result.resource);
	}
	if (
		typeof result.uri === 'string' ||
		typeof result.scheduling_url === 'string' ||
		typeof result.slug === 'string' ||
		typeof result.name === 'string'
	) {
		return toRecord(result);
	}
	return null;
}

export function normalizeCreateEventTypeQuery(
	cmdOpts: CreateEventTypeCmdOptions,
	defaults: Record<string, unknown> = {}
): CreateEventTypeQuery {
	const owner = normalizeOwner(cmdOpts, defaults);
	const name = normalizeRequiredString(
		cmdOpts.name ?? defaults.name,
		'name',
		'name is required (use --name or --raw {"name":"..."} )'
	);
	const active = normalizeOptionalBoolean(cmdOpts.active ?? defaults.active, 'active');
	const description = normalizeOptionalString(cmdOpts.description ?? defaults.description, 'description');
	const duration = normalizeOptionalDuration(cmdOpts.duration ?? defaults.duration);
	const durationOptions =
		Array.isArray(cmdOpts.durationOption) && cmdOpts.durationOption.length > 0
			? normalizeDurationOptions(cmdOpts.durationOption)
			: normalizeDurationOptions(defaults.duration_options ?? defaults.durationOptions);
	const color = normalizeColor(cmdOpts.color ?? defaults.color);
	const locale = normalizeLocale(cmdOpts.locale ?? defaults.locale);
	const locations =
		normalizeFlagLocation(
			cmdOpts.locationKind ?? defaults.location_kind ?? defaults.locationKind,
			cmdOpts.location ?? defaults.location,
			cmdOpts.locationAdditionalInfo ?? defaults.location_additional_info ?? defaults.locationAdditionalInfo,
			cmdOpts.locationPhoneNumber ?? defaults.location_phone_number ?? defaults.locationPhoneNumber
		) ?? normalizeRawLocations(defaults.locations);

	if (duration === undefined && durationOptions === undefined) {
		throw new Error(
			'provide duration or duration_options (use --duration, repeated --duration-option, or --raw {"duration":15} / {"duration_options":[15,30]})'
		);
	}

	if (duration !== undefined && durationOptions && !durationOptions.includes(duration)) {
		throw new Error('duration must be one of the provided duration_options values');
	}

	return {
		owner,
		name,
		...(active !== undefined ? { active } : {}),
		...(description ? { description } : {}),
		...(duration !== undefined ? { duration } : {}),
		...(durationOptions ? { duration_options: durationOptions } : {}),
		...(locations ? { locations } : {}),
		...(color ? { color } : {}),
		...(locale ? { locale } : {}),
	};
}

export function toCreateEventTypeMcpArgs(query: CreateEventTypeQuery): Record<string, unknown> {
	return { ...query };
}

export function toCreateEventTypeRestBody(query: CreateEventTypeQuery): Record<string, unknown> {
	return { ...query };
}

export function shapeCreateEventTypeResult(
	result: unknown,
	query: CreateEventTypeQuery
): Record<string, unknown> {
	const response = toRecord(result);
	const resource = extractResource(response);
	return {
		query: { ...query },
		meta: {
			created: Boolean(resource),
		},
		resource,
	};
}

export function toSafeCreateEventTypeError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (
		message.includes('owner is required') ||
		message.includes('provide exactly one owner source') ||
		message.includes('name is required') ||
		message.includes('must be a non-empty string') ||
		message.includes('must be true or false') ||
		message.includes('provide duration or duration_options') ||
		message.includes('duration must be one of the provided duration_options values') ||
		message.includes('duration_options cannot include more than') ||
		message.includes('duration_options values must be unique') ||
		message.includes('duration must contain integers between') ||
		message.includes('duration_options must contain integers between') ||
		message.includes('color must be a hexadecimal color') ||
		message.includes('locale must be one of') ||
			message.includes('location_kind must be one of') ||
			message.includes('location_kind is required when providing location details') ||
			message.includes('locations entries require a supported kind value') ||
			message.includes('must be a Calendly user or team URI')
	) {
		return message;
	}
	if (message.includes('kind: "solo"') || message.includes('only supports one-on-one event types') || message.includes('non solo')) {
		return 'Calendly only allows creating solo event types through this endpoint.';
	}
	if (message.includes('Insufficient scope') || message.includes('required_scopes') || message.includes('event_types:write')) {
		return 'Your token is missing the event_types:write scope required to create event types.';
	}
	if (/\b401\b/.test(message)) {
		return 'Unable to authenticate with Calendly. Verify CALENDLY_API_KEY.';
	}
	if (/\b403\b/.test(message)) {
		return 'You do not have permission to create this event type. Verify token scope and owner access.';
	}
	if (/\b404\b/.test(message)) {
		return 'owner was not found. Verify --user-uri, --team-uri, or raw owner URI.';
	}
	return 'Unable to create event type. Verify owner, requested fields, and token scope.';
}
