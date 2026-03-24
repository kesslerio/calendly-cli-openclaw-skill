#!/usr/bin/env bun
process.env.MCPORTER_DISABLE_AUTORUN = '1';
import { runCli } from './commands/run-cli';

runCli().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});
