import { mkdir, lstat, readlink, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_BIN_DIR_SEGMENTS = ['.local', 'bin'] as const;

export interface InstallPathArgs {
	binDir?: string;
}

export interface ParsedInstallPathArgs extends InstallPathArgs {
	help: boolean;
}

export interface InstallTarget {
	binDir: string;
	linkPath: string;
	sourcePath: string;
}

export interface InstallOutcome {
	status: 'installed' | 'already-installed';
	target: InstallTarget;
	pathIncludesBinDir: boolean;
}

export function defaultBinDir(homeDirectory = os.homedir()): string {
	return path.join(homeDirectory, ...DEFAULT_BIN_DIR_SEGMENTS);
}

export function parseInstallPathArgs(argv: string[]): ParsedInstallPathArgs {
	const parsed: ParsedInstallPathArgs = {
		binDir: undefined,
		help: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}

		if (token === '--help' || token === '-h') {
			parsed.help = true;
			continue;
		}

		if (token === '--bin-dir') {
			const value = argv[index + 1];
			if (!value) {
				throw new Error('--bin-dir requires a value.');
			}
			parsed.binDir = value;
			index += 1;
			continue;
		}

		if (token.startsWith('--bin-dir=')) {
			parsed.binDir = token.slice('--bin-dir='.length);
			if (!parsed.binDir) {
				throw new Error('--bin-dir requires a value.');
			}
			continue;
		}

		throw new Error(`Unknown argument: ${token}`);
	}

	return parsed;
}

export function resolveInstallTarget(repoDirectory: string, options: InstallPathArgs = {}): InstallTarget {
	const sourcePath = path.resolve(repoDirectory, 'calendly');
	const binDir = path.resolve(options.binDir ?? defaultBinDir());
	return {
		binDir,
		linkPath: path.join(binDir, 'calendly'),
		sourcePath,
	};
}

export function pathIncludesDirectory(pathValue: string | undefined, directory: string): boolean {
	if (!pathValue) {
		return false;
	}

	const normalizedDirectory = path.resolve(directory);
	return pathValue
		.split(path.delimiter)
		.filter(Boolean)
		.some((entry) => path.resolve(entry) === normalizedDirectory);
}

export async function installCalendlyToPath(
	repoDirectory: string,
	options: InstallPathArgs = {}
): Promise<InstallOutcome> {
	const target = resolveInstallTarget(repoDirectory, options);

	await mkdir(target.binDir, { recursive: true });

	try {
		const existing = await lstat(target.linkPath);
		if (!existing.isSymbolicLink()) {
			throw new Error(
				`Cannot install ${target.linkPath} because a non-symlink file already exists there.`
			);
		}

		const existingDestination = await readlink(target.linkPath);
		const resolvedExistingDestination = path.resolve(target.binDir, existingDestination);
		if (resolvedExistingDestination === target.sourcePath) {
			return {
				status: 'already-installed',
				target,
				pathIncludesBinDir: pathIncludesDirectory(process.env.PATH, target.binDir),
			};
		}

		throw new Error(
			`Cannot install ${target.linkPath} because it already points to ${resolvedExistingDestination}. Remove the existing symlink, then rerun the installer.`
		);
	} catch (error) {
		const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
		if (code !== 'ENOENT') {
			throw error;
		}
	}

	await symlink(target.sourcePath, target.linkPath);

	return {
		status: 'installed',
		target,
		pathIncludesBinDir: pathIncludesDirectory(process.env.PATH, target.binDir),
	};
}

export function renderInstallSummary(outcome: InstallOutcome): string {
	const verb = outcome.status === 'installed' ? 'Installed' : 'Already installed';
	const pathHint = outcome.pathIncludesBinDir
		? `\n${outcome.target.binDir} is already on PATH. You can run: calendly --help`
		: `\n${outcome.target.binDir} is not currently on PATH. Add it to your shell profile, then run: calendly --help`;

	return `${verb} calendly at ${outcome.target.linkPath} -> ${outcome.target.sourcePath}${pathHint}`;
}

export function renderInstallHelp(defaultDirectory = defaultBinDir()): string {
	return [
		'Expose the local calendly CLI on PATH by creating a symlink.',
		'',
		'Usage:',
		'  bun run install:path [--bin-dir <dir>]',
		'  bun run ./scripts/install-path.ts [--bin-dir <dir>]',
		'',
		'Options:',
		`  --bin-dir <dir>  Install into a specific bin directory (default: ${defaultDirectory})`,
		'  -h, --help       Show this help output',
	].join('\n');
}
