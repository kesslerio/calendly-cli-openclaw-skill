export type ListEventTypesCmdOptions = {
	raw?: string;
	userUri?: string;
	organizationUri?: string;
	count?: number;
};

export type ListEventTypesQuery = {
	user_uri?: string;
	organization_uri?: string;
	count?: number;
};

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

function normalizeCount(value: unknown): number | undefined {
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
		throw new Error('count must be an integer between 1 and 100');
	}
	if (numeric < 1 || numeric > 100) {
		throw new Error('count must be an integer between 1 and 100');
	}
	return numeric;
}

export function normalizeListEventTypesQuery(
	cmdOpts: ListEventTypesCmdOptions,
	defaults: Record<string, unknown> = {}
): ListEventTypesQuery {
	const userUri = normalizeOptionalString(cmdOpts.userUri ?? defaults.user_uri ?? defaults.user, 'user_uri');
	const organizationUri = normalizeOptionalString(
		cmdOpts.organizationUri ?? defaults.organization_uri ?? defaults.organization,
		'organization_uri'
	);
	const count = normalizeCount(cmdOpts.count ?? defaults.count);

	if (!userUri && !organizationUri) {
		throw new Error(
			'either user_uri or organization_uri is required (use --user-uri, --organization-uri, or --raw {"user_uri":"..."} / {"organization_uri":"..."})'
		);
	}

	return {
		...(userUri ? { user_uri: userUri } : {}),
		...(organizationUri ? { organization_uri: organizationUri } : {}),
		...(count !== undefined ? { count } : {}),
	};
}

export function toListEventTypesMcpArgs(query: ListEventTypesQuery): Record<string, unknown> {
	return {
		...(query.user_uri ? { user: query.user_uri } : {}),
		...(query.organization_uri ? { organization: query.organization_uri } : {}),
		...(query.count !== undefined ? { count: query.count } : {}),
	};
}

function toRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};
}

export function shapeListEventTypesResult(
	result: unknown,
	query: ListEventTypesQuery
): Record<string, unknown> {
	const response = toRecord(result);
	const collectionRaw = Array.isArray(response.collection) ? response.collection : [];
	const collection = collectionRaw.map((item) => toRecord(item));
	const shaped: Record<string, unknown> = {
		query: {
			...(query.user_uri ? { user_uri: query.user_uri } : {}),
			...(query.organization_uri ? { organization_uri: query.organization_uri } : {}),
			...(query.count !== undefined ? { count: query.count } : {}),
		},
		meta: {
			event_types: collection.length,
		},
		collection,
	};
	if (response.pagination && typeof response.pagination === 'object') {
		shaped.pagination = response.pagination;
	}
	return shaped;
}
