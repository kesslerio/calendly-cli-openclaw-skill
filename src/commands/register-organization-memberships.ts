import { Command } from 'commander';
import { buildOrganizationMembershipParams } from '../organization-memberships';
import { printResult } from './output';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

function parseIntegerFlag(value: string, optionName: string): number {
	const trimmed = String(value).trim();
	if (!/^-?\d+$/.test(trimmed)) {
		throw new Error(`Invalid ${optionName} value "${value}". Use an integer.`);
	}
	return Number.parseInt(trimmed, 10);
}

async function requestCalendlyJson(
	url: string,
	apiKey: string,
	timeout: number
): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			signal: controller.signal,
		});

		const text = await response.text();
		let data: unknown = {};
		if (text) {
			try {
				data = JSON.parse(text);
			} catch {
				data = text;
			}
		}

		if (!response.ok) {
			const message = typeof data === 'string' ? data : JSON.stringify(data);
			throw new Error(`Calendly API request failed (${response.status}): ${message}`);
		}

		return data;
	} finally {
		clearTimeout(timer);
	}
}

export function registerOrganizationMembershipCommands(program: Command): void {
	program
		.command('list-organization-memberships')
		.summary('list-organization-memberships [--user-uri <user-uri>] [--organization-uri <organization-uri>] [--email <email>] [--count <count:number>] [--raw <json>]')
		.description('List organization memberships for the authenticated user')
		.usage('[--user-uri <user-uri>] [--organization-uri <organization-uri>] [--email <email>] [--count <count:number>] [--raw <json>]')
		.option('--raw <json>', 'Provide raw JSON arguments to the tool, bypassing flag parsing.')
		.option('--user-uri <user-uri>', 'URI of the user')
		.option('--organization-uri <organization-uri>', 'URI of the organization')
		.option('--email <email>', 'Filter by email')
		.option('--count <count:number>', 'Number of memberships to return (default 20, max 100) (example: 1)', (value) => parseIntegerFlag(value, 'count'))
		.alias('list_organization_memberships')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const apiKey = requireApiKey();
				const args = cmdOpts.raw ? JSON.parse(cmdOpts.raw) : ({} as Record<string, unknown>);
				const userUri = cmdOpts.userUri ?? args.user_uri;
				const organizationUri = cmdOpts.organizationUri ?? args.organization_uri;
				const email = cmdOpts.email ?? args.email;
				const count = cmdOpts.count ?? args.count;

				const urlParams = buildOrganizationMembershipParams({
					user_uri: userUri as string | undefined,
					organization_uri: organizationUri as string | undefined,
					email: email as string | undefined,
					count: count as number | string | undefined,
				});

				const data = await requestCalendlyJson(
					`https://api.calendly.com/organization_memberships?${urlParams.toString()}`,
					apiKey,
					globalOptions.timeout || 30000
				);

				printResult(data, globalOptions.output ?? 'text');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + 'mcporter call calendly.list_organization_memberships(count: 1)');
}
