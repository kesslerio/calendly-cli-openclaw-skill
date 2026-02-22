export type DateRangeInput = {
	min_start_time?: unknown;
	max_start_time?: unknown;
};

export type DateRangeOutput = {
	min_start_time?: string;
	max_start_time?: string;
};

const ISO_8601_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_8601_EXAMPLE = '2026-01-20T00:00:00Z';

function normalizeIso8601Timestamp(value: unknown, fieldName: 'min_start_time' | 'max_start_time'): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`${fieldName} must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	if (!ISO_8601_TIMESTAMP.test(trimmed)) {
		throw new Error(`${fieldName} must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	if (Number.isNaN(Date.parse(trimmed))) {
		throw new Error(`${fieldName} must be a valid ISO-8601 timestamp (example: ${ISO_8601_EXAMPLE})`);
	}
	return trimmed;
}

export function normalizeDateRange(input: DateRangeInput): DateRangeOutput {
	const minStartTime = normalizeIso8601Timestamp(input.min_start_time, 'min_start_time');
	const maxStartTime = normalizeIso8601Timestamp(input.max_start_time, 'max_start_time');

	if (minStartTime && maxStartTime && Date.parse(minStartTime) > Date.parse(maxStartTime)) {
		throw new Error('min_start_time must be less than or equal to max_start_time');
	}

	return {
		min_start_time: minStartTime,
		max_start_time: maxStartTime,
	};
}
