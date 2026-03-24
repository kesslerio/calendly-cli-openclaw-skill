import { createProgram } from './program';
import { registerBatchEventInviteesCommands } from './register-batch-event-invitees';
import { registerCurrentUserCommands } from './register-current-user';
import { registerBasicEventCommands } from './register-events-basic';
import { registerEventTypeCommands } from './register-event-types';
import { registerListEventsCommands } from './register-list-events';
import { registerOauthCommands } from './register-oauth';
import { registerOrganizationMembershipCommands } from './register-organization-memberships';
import { registerSearchInviteesCommands } from './register-search-invitees';
import { registerSearchTeamCommands } from './register-search-team';
import { registerSchedulingCommands } from './register-scheduling';
import { registerTeamEventsCommands } from './register-team-events';
import { registerWebhookCommands } from './register-webhooks';

const HANDWRITTEN_COMMANDS = new Set([
	'list-webhook-subscriptions',
	'get-webhook-subscription',
	'create-webhook-subscription',
	'delete-webhook-subscription',
	'list-organization-memberships',
	'list_organization_memberships',
	'get-current-user',
	'get_current_user',
	'list-events',
	'list_events',
	'list-events-with-invitees',
	'get-oauth-url',
	'get_oauth_url',
	'exchange-code-for-tokens',
	'exchange_code_for_tokens',
	'refresh-access-token',
	'refresh_access_token',
	'list-event-types',
	'list_event_types',
	'get-event-type',
	'get_event_type',
	'get-event-type-availability',
	'get_event_type_availability',
	'get-event',
	'get_event',
	'list-event-invitees',
	'list_event_invitees',
	'cancel-event',
	'cancel_event',
	'batch-event-invitees',
	'batch_event_invitees',
	'search-invitees',
	'list-team-events',
	'search-team',
	'schedule-event',
	'schedule_event',
	'reschedule-event',
	'reschedule_event',
]);

function detectCommand(argv: string[]): string | undefined {
	for (let index = 2; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (token === '--') {
			return argv[index + 1];
		}
		if (!token.startsWith('-')) {
			return token;
		}
		if (
			token === '-o' ||
			token === '--output' ||
			token === '-t' ||
			token === '--timeout'
		) {
			if (argv[index + 1] !== undefined) {
				index += 1;
			}
			continue;
		}
		if (token.startsWith('--output=') || token.startsWith('--timeout=')) {
			continue;
		}
	}
	return undefined;
}

function hasHelpFlag(argv: string[]): boolean {
	return argv.slice(2).some((token) => token === '-h' || token === '--help' || token === 'help');
}

export async function runCli(): Promise<void> {
	const command = detectCommand(process.argv);
	const isGlobalHelp = command === 'help' || !command || hasHelpFlag(process.argv);
	if (!command || command.startsWith('-') || !HANDWRITTEN_COMMANDS.has(command)) {
		try {
			const { runCli: runGeneratedCli } = await import('../generated/cli');
			await runGeneratedCli();
			return;
		} catch (error) {
			if (!isGlobalHelp) {
				throw error;
			}
			const program = createProgram();
			registerOauthCommands(program);
			registerCurrentUserCommands(program);
			registerListEventsCommands(program);
			registerEventTypeCommands(program);
			registerBasicEventCommands(program);
			registerBatchEventInviteesCommands(program);
			registerSearchInviteesCommands(program);
			registerTeamEventsCommands(program);
			registerSearchTeamCommands(program);
			registerSchedulingCommands(program);
			registerOrganizationMembershipCommands(program);
			registerWebhookCommands(program);
			program.outputHelp();
			console.error('\nNote: Full command set is unavailable because generated CLI dependencies are missing.');
			console.error('Install runtime deps (e.g. mcporter) to restore all generated commands.');
		}
		return;
	}

	const program = createProgram();
	registerOauthCommands(program);
	registerCurrentUserCommands(program);
	registerListEventsCommands(program);
	registerEventTypeCommands(program);
	registerBasicEventCommands(program);
	registerBatchEventInviteesCommands(program);
	registerSearchInviteesCommands(program);
	registerTeamEventsCommands(program);
	registerSearchTeamCommands(program);
	registerSchedulingCommands(program);
	registerWebhookCommands(program);
	registerOrganizationMembershipCommands(program);
	await program.parseAsync(process.argv);
}
