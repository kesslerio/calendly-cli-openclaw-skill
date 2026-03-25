import { createProgram } from './program';

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
	'list_events_with_invitees',
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
	'update-event-type',
	'update_event_type',
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

async function registerHandwrittenCommands(program: ReturnType<typeof createProgram>): Promise<void> {
	const [
		oauth,
		currentUser,
		listEvents,
		eventTypes,
		basicEvents,
		batchInvitees,
		searchInvitees,
		teamEvents,
		searchTeam,
		scheduling,
		webhooks,
		organizationMemberships,
	] = await Promise.all([
		import('./register-oauth'),
		import('./register-current-user'),
		import('./register-list-events'),
		import('./register-event-types'),
		import('./register-events-basic'),
		import('./register-batch-event-invitees'),
		import('./register-search-invitees'),
		import('./register-team-events'),
		import('./register-search-team'),
		import('./register-scheduling'),
		import('./register-webhooks'),
		import('./register-organization-memberships'),
	]);

	oauth.registerOauthCommands(program);
	currentUser.registerCurrentUserCommands(program);
	listEvents.registerListEventsCommands(program);
	eventTypes.registerEventTypeCommands(program);
	basicEvents.registerBasicEventCommands(program);
	batchInvitees.registerBatchEventInviteesCommands(program);
	searchInvitees.registerSearchInviteesCommands(program);
	teamEvents.registerTeamEventsCommands(program);
	searchTeam.registerSearchTeamCommands(program);
	scheduling.registerSchedulingCommands(program);
	webhooks.registerWebhookCommands(program);
	organizationMemberships.registerOrganizationMembershipCommands(program);
}

export async function runCli(): Promise<void> {
	const command = detectCommand(process.argv);
	const wantsHelp = hasHelpFlag(process.argv);
	const isGlobalHelp =
		command === 'help' || !command || (wantsHelp && (command.startsWith('-') || !HANDWRITTEN_COMMANDS.has(command)));
	if (isGlobalHelp) {
		const program = createProgram();
		try {
			await registerHandwrittenCommands(program);
			program.outputHelp();
			return;
		} catch {
			try {
				const { runCli: runGeneratedCli } = await import('../generated/cli');
				await runGeneratedCli();
				return;
			} catch {
				program.outputHelp();
				console.error('\nNote: Full command set is unavailable because generated CLI dependencies are missing.');
				console.error('Install runtime deps (e.g. mcporter) to restore all generated commands.');
				return;
			}
		}
	}

	if (!command || command.startsWith('-') || !HANDWRITTEN_COMMANDS.has(command)) {
		try {
			const { runCli: runGeneratedCli } = await import('../generated/cli');
			await runGeneratedCli();
			return;
		} catch (error) {
			throw error;
		}
		return;
	}

	const program = createProgram();
	await registerHandwrittenCommands(program);
	await program.parseAsync(process.argv);
}
