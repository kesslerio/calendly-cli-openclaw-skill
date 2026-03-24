import { Command } from 'commander';
import { ensureRuntime, getServerProxy, invokeWithTimeout, printMcpResult, SERVER_NAME } from './runtime';

export function registerCurrentUserCommands(program: Command): void {
	program
		.command('get-current-user')
		.summary('get-current-user [--raw <json>]')
		.description('Get the current authenticated user information')
		.usage('[--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.alias('get_current_user')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const runtime = await ensureRuntime();
			const proxy = getServerProxy(runtime) as any;
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				const call = proxy.getCurrentUser(args);
				const result = await invokeWithTimeout(call, globalOptions.timeout || 30000);
				printMcpResult(result, globalOptions.output ?? 'text');
			} finally {
				await runtime.close(SERVER_NAME).catch(() => {});
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + 'mcporter call calendly.get_current_user()');
}
