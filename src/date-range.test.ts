import { describe, expect, test } from 'bun:test';
import { normalizeDateRange } from './date-range';

describe('normalizeDateRange', () => {
	test('accepts min-only date range', () => {
		expect(normalizeDateRange({
			min_start_time: '2026-01-20T00:00:00Z',
		})).toEqual({
			min_start_time: '2026-01-20T00:00:00Z',
			max_start_time: undefined,
		});
	});

	test('accepts max-only date range', () => {
		expect(normalizeDateRange({
			max_start_time: '2026-01-27T23:59:59Z',
		})).toEqual({
			min_start_time: undefined,
			max_start_time: '2026-01-27T23:59:59Z',
		});
	});

	test('accepts min+max date range when min <= max', () => {
		expect(normalizeDateRange({
			min_start_time: '2026-01-20T00:00:00Z',
			max_start_time: '2026-01-27T23:59:59Z',
		})).toEqual({
			min_start_time: '2026-01-20T00:00:00Z',
			max_start_time: '2026-01-27T23:59:59Z',
		});
	});

	test('rejects invalid ISO-8601 timestamps', () => {
		expect(() => normalizeDateRange({
			min_start_time: '2026-01-20',
		})).toThrow('min_start_time must be a valid ISO-8601 timestamp');
	});

	test('rejects min_start_time greater than max_start_time', () => {
		expect(() => normalizeDateRange({
			min_start_time: '2026-01-28T00:00:00Z',
			max_start_time: '2026-01-27T23:59:59Z',
		})).toThrow('min_start_time must be less than or equal to max_start_time');
	});
});
