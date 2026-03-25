#!/usr/bin/env bun
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	installCalendlyToPath,
	parseInstallPathArgs,
	renderInstallHelp,
	renderInstallSummary,
} from '../src/path-install';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(scriptDirectory, '..');

async function main(): Promise<void> {
	const args = parseInstallPathArgs(process.argv.slice(2));
	if (args.help) {
		console.log(renderInstallHelp());
		return;
	}

	const outcome = await installCalendlyToPath(repositoryDirectory, args);
	console.log(renderInstallSummary(outcome));
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});
