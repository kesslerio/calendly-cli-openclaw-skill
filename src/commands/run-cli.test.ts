import { describe, expect, test } from 'bun:test';
import { detectCommand, detectHelpTarget, rewriteHelpArgv, shouldShowGlobalHelp } from './run-cli';

describe('detectCommand', () => {
	test('detects handwritten commands after global flags', () => {
		expect(detectCommand(['bun', 'calendly', '-o', 'json', 'update-event-type', '--help'])).toBe(
			'update-event-type'
		);
	});

	test('detects generated command names after global flags', () => {
		expect(detectCommand(['bun', 'calendly', '-o', 'json', 'create-event-type', '--help'])).toBe(
			'create-event-type'
		);
	});
});

describe('shouldShowGlobalHelp', () => {
	test('treats bare help as global help', () => {
		expect(shouldShowGlobalHelp(undefined)).toBe(true);
		expect(shouldShowGlobalHelp('help')).toBe(true);
	});

	test('does not treat command-specific help as global help', () => {
		expect(shouldShowGlobalHelp('update-event-type')).toBe(false);
		expect(shouldShowGlobalHelp('create-event-type')).toBe(false);
		expect(shouldShowGlobalHelp('help', 'schedule-event')).toBe(false);
		expect(shouldShowGlobalHelp('help', 'create-event-type')).toBe(false);
	});
});

describe('detectHelpTarget', () => {
	test('returns undefined for bare help', () => {
		expect(detectHelpTarget(['bun', 'calendly', 'help'])).toBeUndefined();
	});

	test('detects handwritten help targets after global flags', () => {
		expect(detectHelpTarget(['bun', 'calendly', '-o', 'json', 'help', 'schedule-event'])).toBe(
			'schedule-event'
		);
	});

	test('detects generated help targets after global flags', () => {
		expect(detectHelpTarget(['bun', 'calendly', '-o', 'json', 'help', 'create-event-type'])).toBe(
			'create-event-type'
		);
	});
});

describe('rewriteHelpArgv', () => {
	test('rewrites handwritten help targets into command --help form', () => {
		expect(rewriteHelpArgv(['bun', 'calendly', '-o', 'json', 'help', 'schedule-event'], 'schedule-event')).toEqual([
			'bun',
			'calendly',
			'-o',
			'json',
			'schedule-event',
			'--help',
		]);
	});

	test('rewrites generated help targets into command --help form', () => {
		expect(rewriteHelpArgv(['bun', 'calendly', 'help', 'create-event-type'], 'create-event-type')).toEqual([
			'bun',
			'calendly',
			'create-event-type',
			'--help',
		]);
	});
});
