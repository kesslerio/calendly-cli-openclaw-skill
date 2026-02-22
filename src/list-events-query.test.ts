import { describe, expect, test } from 'bun:test';
import { normalizeListEventsQuery } from './list-events-query';

describe('normalizeListEventsQuery', () => {
	test('applies validated date range in standard flag mode', () => {
		const query = normalizeListEventsQuery({
			minStartTime: '2026-01-20T00:00:00Z',
			maxStartTime: '2026-01-27T23:59:59Z',
		});
		expect(query.min_start_time).toBe('2026-01-20T00:00:00Z');
		expect(query.max_start_time).toBe('2026-01-27T23:59:59Z');
	});

	test('applies validated date range in raw mode', () => {
		const query = normalizeListEventsQuery(
			{},
			{
				min_start_time: '2026-02-01T00:00:00Z',
				max_start_time: '2026-02-28T23:59:59Z',
			}
		);
		expect(query.min_start_time).toBe('2026-02-01T00:00:00Z');
		expect(query.max_start_time).toBe('2026-02-28T23:59:59Z');
	});

	test('keeps date-range behavior identical for include-invitees path', () => {
		const query = normalizeListEventsQuery(
			{
				includeInvitees: true,
				minStartTime: '2026-03-01T00:00:00Z',
				maxStartTime: '2026-03-31T23:59:59Z',
			},
			{}
		);
		expect(query.include_invitees).toBe(true);
		expect(query.min_start_time).toBe('2026-03-01T00:00:00Z');
		expect(query.max_start_time).toBe('2026-03-31T23:59:59Z');
	});

	test('flags override raw values before validation', () => {
		const query = normalizeListEventsQuery(
			{
				minStartTime: '2026-04-01T00:00:00Z',
				maxStartTime: '2026-04-30T23:59:59Z',
			},
			{
				min_start_time: '2026-05-01T00:00:00Z',
				max_start_time: '2026-05-31T23:59:59Z',
			}
		);
		expect(query.min_start_time).toBe('2026-04-01T00:00:00Z');
		expect(query.max_start_time).toBe('2026-04-30T23:59:59Z');
	});

	test('rejects invalid ISO-8601 timestamps in raw mode', () => {
		expect(() => normalizeListEventsQuery(
			{},
			{ min_start_time: '2026-03-01' }
		)).toThrow('min_start_time must be a valid ISO-8601 timestamp');
	});

	test('rejects min_start_time > max_start_time', () => {
		expect(() => normalizeListEventsQuery({
			minStartTime: '2026-03-02T00:00:00Z',
			maxStartTime: '2026-03-01T00:00:00Z',
		})).toThrow('min_start_time must be less than or equal to max_start_time');
	});
});
