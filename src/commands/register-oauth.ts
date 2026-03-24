import { Command } from 'commander';
import { ensureRuntime, getServerProxy, invokeWithTimeout, printMcpResult, SERVER_NAME } from './runtime';

export function registerOauthCommands(program: Command): void {
	program
		.command('get-oauth-url')
		.summary('get-oauth-url --redirect-uri <redirect-uri> [--state <state>] [--raw <json>]')
		.description('Generate OAuth authorization URL for user authentication')
		.usage('--redirect-uri <redirect-uri> [--state <state>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.requiredOption('--redirect-uri <redirect-uri>', 'The redirect URI for your OAuth application')
		.option('--state <state>', 'Optional state parameter for security')
		.alias('get_oauth_url')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const runtime = await ensureRuntime();
			const proxy = getServerProxy(runtime) as any;
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				if (cmdOpts.redirectUri !== undefined) args.redirect_uri = cmdOpts.redirectUri;
				if (cmdOpts.state !== undefined) args.state = cmdOpts.state;
				const call = proxy.getOauthUrl(args);
				const result = await invokeWithTimeout(call, globalOptions.timeout || 30000);
				printMcpResult(result, globalOptions.output ?? 'text');
			} finally {
				await runtime.close(SERVER_NAME).catch(() => {});
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + 'mcporter call calendly.get_oauth_url(redirect_uri: "value")');

	program
		.command('exchange-code-for-tokens')
		.summary('exchange-code-for-tokens --code <code> --redirect-uri <redirect-uri> [--raw <json>]')
		.description('Exchange authorization code for access and refresh tokens')
		.usage('--code <code> --redirect-uri <redirect-uri> [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.requiredOption('--code <code>', 'The authorization code from OAuth callback')
		.requiredOption('--redirect-uri <redirect-uri>', 'The redirect URI used in authorization')
		.alias('exchange_code_for_tokens')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const runtime = await ensureRuntime();
			const proxy = getServerProxy(runtime) as any;
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				if (cmdOpts.code !== undefined) args.code = cmdOpts.code;
				if (cmdOpts.redirectUri !== undefined) args.redirect_uri = cmdOpts.redirectUri;
				const call = proxy.exchangeCodeForTokens(args);
				const result = await invokeWithTimeout(call, globalOptions.timeout || 30000);
				printMcpResult(result, globalOptions.output ?? 'text');
			} finally {
				await runtime.close(SERVER_NAME).catch(() => {});
			}
		})
		.addHelpText('after', () =>
			'\nExample:\n  ' + 'mcporter call calendly.exchange_code_for_tokens(code: "value", redirect_uri: "value")'
		);

	program
		.command('refresh-access-token')
		.summary('refresh-access-token --refresh-token <refresh-token> [--raw <json>]')
		.description('Refresh access token using refresh token')
		.usage('--refresh-token <refresh-token> [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.requiredOption('--refresh-token <refresh-token>', 'The refresh token to use')
		.alias('refresh_access_token')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			const runtime = await ensureRuntime();
			const proxy = getServerProxy(runtime) as any;
			try {
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				if (cmdOpts.refreshToken !== undefined) args.refresh_token = cmdOpts.refreshToken;
				const call = proxy.refreshAccessToken(args);
				const result = await invokeWithTimeout(call, globalOptions.timeout || 30000);
				printMcpResult(result, globalOptions.output ?? 'text');
			} finally {
				await runtime.close(SERVER_NAME).catch(() => {});
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + 'mcporter call calendly.refresh_access_token(refresh_token: "value")');
}
