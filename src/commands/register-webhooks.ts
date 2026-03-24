// @ts-nocheck
import { Command } from 'commander';
import { printResult } from './output';

function requireApiKey(): string {
	const apiKey = process.env.CALENDLY_API_KEY;
	if (!apiKey) {
		throw new Error('CALENDLY_API_KEY environment variable is required');
	}
	return apiKey;
}

function webhookIdFromUri(uri: string): string {
	return String(uri).split('/').pop() ?? uri;
}

async function requestCalendlyJson(
	url: string,
	apiKey: string,
	timeout: number,
	init?: RequestInit
): Promise<{ data: unknown; status: number }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, {
			...init,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				...(init?.headers ?? {}),
			},
			signal: controller.signal,
		});

		let data: unknown = {};
		const text = await response.text();
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

		return { data, status: response.status };
	} finally {
		clearTimeout(timer);
	}
}

export function registerWebhookCommands(program: Command): void {
	program
		.command('list-webhook-subscriptions')
		.summary('list-webhook-subscriptions [--organization-uri <organization-uri>] [--scope <scope:user|organization>] [--count <count:number>]')
		.description('List webhook subscriptions')
		.usage('[--organization-uri <organization-uri>] [--scope <scope:user|organization>] [--count <count:number>]')
		.option('--organization-uri <organization-uri>', 'Organization URI to filter subscriptions')
		.option('--scope <scope:user|organization>', 'Filter by scope (choices: user, organization)')
		.option('--count <count:number>', 'Number of subscriptions to return (default 20, max 100)', (value) => parseInt(value, 10))
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const apiKey = requireApiKey();
				const urlParams = new URLSearchParams();
				if (cmdOpts.organizationUri) urlParams.append('organization', cmdOpts.organizationUri);
				if (cmdOpts.scope) urlParams.append('scope', cmdOpts.scope);
				if (cmdOpts.count !== undefined) urlParams.append('count', String(cmdOpts.count));

				const response = await requestCalendlyJson(
					`https://api.calendly.com/webhook_subscriptions?${urlParams.toString()}`,
					apiKey,
					globalOptions.timeout || 30000
				);

				printResult(response.data, globalOptions.output ?? 'text');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly list-webhook-subscriptions --organization-uri https://api.calendly.com/organizations/ORG_ID');

	program
		.command('get-webhook-subscription')
		.summary('get-webhook-subscription --webhook-subscription-uri <webhook-subscription-uri>')
		.description('Get details for a webhook subscription')
		.usage('--webhook-subscription-uri <webhook-subscription-uri>')
		.requiredOption('--webhook-subscription-uri <webhook-subscription-uri>', 'Webhook subscription URI')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const apiKey = requireApiKey();
				const webhookId = webhookIdFromUri(String(cmdOpts.webhookSubscriptionUri));

				const response = await requestCalendlyJson(
					`https://api.calendly.com/webhook_subscriptions/${encodeURIComponent(String(webhookId))}`,
					apiKey,
					globalOptions.timeout || 30000
				);

				printResult(response.data, globalOptions.output ?? 'text');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly get-webhook-subscription --webhook-subscription-uri https://api.calendly.com/webhook_subscriptions/WH_ID');

	program
		.command('create-webhook-subscription')
		.summary('create-webhook-subscription --url <url> --events <events> --organization-uri <organization-uri> [--scope <scope:user|organization>] [--user-uri <user-uri>] [--signing-key <signing-key>]')
		.description('Create a webhook subscription')
		.usage('--url <url> --events <events> --organization-uri <organization-uri> [--scope <scope:user|organization>] [--user-uri <user-uri>] [--signing-key <signing-key>]')
		.requiredOption('--url <url>', 'Webhook callback URL')
		.requiredOption('--events <events>', 'Comma-separated events (e.g. invitee.created,invitee.canceled)')
		.requiredOption('--organization-uri <organization-uri>', 'Organization URI')
		.option('--scope <scope:user|organization>', 'Subscription scope (choices: user, organization)', 'organization')
		.option('--user-uri <user-uri>', 'User URI (required when --scope user)')
		.option('--signing-key <signing-key>', 'Signing key for signature verification')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const apiKey = requireApiKey();
				const payload: Record<string, unknown> = {
					url: cmdOpts.url,
					events: String(cmdOpts.events)
						.split(',')
						.map((e: string) => e.trim())
						.filter(Boolean),
					scope: cmdOpts.scope,
					organization: cmdOpts.organizationUri,
				};
				if (cmdOpts.scope === 'user' && !cmdOpts.userUri) {
					throw new Error('--user-uri is required when --scope user');
				}
				if (cmdOpts.userUri) payload.user = cmdOpts.userUri;
				if (cmdOpts.signingKey) payload.signing_key = cmdOpts.signingKey;

				const response = await requestCalendlyJson(
					'https://api.calendly.com/webhook_subscriptions',
					apiKey,
					globalOptions.timeout || 30000,
					{
						method: 'POST',
						body: JSON.stringify(payload),
					}
				);

				printResult(response.data, globalOptions.output ?? 'text');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly create-webhook-subscription --url https://example.com/webhook --events invitee.created,invitee.canceled --organization-uri https://api.calendly.com/organizations/ORG_ID --scope organization');

	program
		.command('delete-webhook-subscription')
		.summary('delete-webhook-subscription --webhook-subscription-uri <webhook-subscription-uri>')
		.description('Delete a webhook subscription')
		.usage('--webhook-subscription-uri <webhook-subscription-uri>')
		.requiredOption('--webhook-subscription-uri <webhook-subscription-uri>', 'Webhook subscription URI')
		.action(async (cmdOpts) => {
			const globalOptions = program.opts();
			try {
				const apiKey = requireApiKey();
				const webhookId = webhookIdFromUri(String(cmdOpts.webhookSubscriptionUri));

				const response = await requestCalendlyJson(
					`https://api.calendly.com/webhook_subscriptions/${encodeURIComponent(String(webhookId))}`,
					apiKey,
					globalOptions.timeout || 30000,
					{
						method: 'DELETE',
					}
				);

				printResult(
					{
						deleted: true,
						webhook_subscription_uri: String(cmdOpts.webhookSubscriptionUri),
						status: response.status,
					},
					globalOptions.output ?? 'text'
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Error: ${message}`);
				process.exit(1);
			}
		})
		.addHelpText('after', () => '\nExample:\n  ' + './calendly delete-webhook-subscription --webhook-subscription-uri https://api.calendly.com/webhook_subscriptions/WH_ID');
}
