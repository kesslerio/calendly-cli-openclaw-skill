import { afterEach, describe, expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
	defaultBinDir,
	installCalendlyToPath,
	parseInstallPathArgs,
	pathIncludesDirectory,
	renderInstallHelp,
	renderInstallSummary,
	resolveInstallTarget,
} from './path-install';

const temporaryDirectories: string[] = [];
const originalPath = process.env.PATH;

afterEach(async () => {
	process.env.PATH = originalPath;
	await Promise.allSettled(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createTempRepo(): Promise<string> {
	const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), 'calendly-cli-install-'));
	temporaryDirectories.push(repositoryDirectory);
	await writeFile(path.join(repositoryDirectory, 'calendly'), '#!/usr/bin/env bun\n');
	return repositoryDirectory;
}

describe('parseInstallPathArgs', () => {
	test('parses --bin-dir and help flags', () => {
		expect(parseInstallPathArgs(['--bin-dir', '/tmp/bin', '--help'])).toEqual({
			binDir: '/tmp/bin',
			help: true,
		});
	});

	test('rejects unknown flags', () => {
		expect(() => parseInstallPathArgs(['--wat'])).toThrow('Unknown argument: --wat');
	});
});

describe('path install helpers', () => {
	test('defaultBinDir points to ~/.local/bin', () => {
		expect(defaultBinDir('/Users/example')).toBe('/Users/example/.local/bin');
	});

	test('resolveInstallTarget builds the symlink destination', () => {
		expect(resolveInstallTarget('/repo', { binDir: '/tmp/bin' })).toEqual({
			binDir: '/tmp/bin',
			linkPath: '/tmp/bin/calendly',
			sourcePath: '/repo/calendly',
		});
	});

	test('pathIncludesDirectory matches normalized PATH entries', () => {
		expect(pathIncludesDirectory('/usr/bin:/tmp/bin:/bin', '/tmp/bin')).toBe(true);
		expect(pathIncludesDirectory('/usr/bin:/bin', '/tmp/bin')).toBe(false);
	});

	test('renderInstallHelp documents the installer entrypoints', () => {
		expect(renderInstallHelp('/tmp/bin')).toContain('bun run install:path');
		expect(renderInstallHelp('/tmp/bin')).toContain('default: /tmp/bin');
	});
});

describe('installCalendlyToPath', () => {
	test('creates a symlink in the target bin directory', async () => {
		const repositoryDirectory = await createTempRepo();
		const binDirectory = path.join(repositoryDirectory, 'bin');
		process.env.PATH = binDirectory;

		const outcome = await installCalendlyToPath(repositoryDirectory, { binDir: binDirectory });
		const linkPath = path.join(binDirectory, 'calendly');
		const stats = await lstat(linkPath);

		expect(outcome.status).toBe('installed');
		expect(stats.isSymbolicLink()).toBe(true);
		expect(await readlink(linkPath)).toBe(path.join(repositoryDirectory, 'calendly'));
		expect(renderInstallSummary(outcome)).toContain('already on PATH');
	});

	test('returns already-installed when the expected symlink already exists', async () => {
		const repositoryDirectory = await createTempRepo();
		const binDirectory = path.join(repositoryDirectory, 'bin');
		await mkdir(binDirectory, { recursive: true });
		await symlink(path.join(repositoryDirectory, 'calendly'), path.join(binDirectory, 'calendly'));

		const outcome = await installCalendlyToPath(repositoryDirectory, { binDir: binDirectory });

		expect(outcome.status).toBe('already-installed');
	});

	test('fails when a regular file already occupies the target path', async () => {
		const repositoryDirectory = await createTempRepo();
		const binDirectory = path.join(repositoryDirectory, 'bin');
		await mkdir(binDirectory, { recursive: true });
		await writeFile(path.join(binDirectory, 'calendly'), 'not a symlink');

		await expect(
			installCalendlyToPath(repositoryDirectory, { binDir: binDirectory })
		).rejects.toThrow('non-symlink file already exists');
	});
});
