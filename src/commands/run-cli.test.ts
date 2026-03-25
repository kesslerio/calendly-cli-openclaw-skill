import { describe, expect, test } from 'bun:test';
import { detectCommand, shouldShowGlobalHelp } from './run-cli';

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
	});
});
