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

export function detectCommand(argv: string[]): string | undefined {
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

export function detectHelpTarget(argv: string[]): string | undefined {
	let sawHelpCommand = false;
	for (let index = 2; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (token === '--') {
			return sawHelpCommand ? argv[index + 1] : undefined;
		}
		if (!token.startsWith('-')) {
			if (!sawHelpCommand) {
				sawHelpCommand = token === 'help';
				continue;
			}
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
		}
	}
	return undefined;
}

export function rewriteHelpArgv(argv: string[], helpTarget: string | undefined): string[] {
	if (!helpTarget) {
		return [...argv];
	}

	const rewritten = argv.slice(0, 2);
	let sawHelpCommand = false;

	for (let index = 2; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (!sawHelpCommand) {
			if (!token.startsWith('-')) {
				sawHelpCommand = token === 'help';
				if (sawHelpCommand) {
					continue;
				}
			}
			rewritten.push(token);
			if (
				(token === '-o' || token === '--output' || token === '-t' || token === '--timeout') &&
				argv[index + 1] !== undefined
			) {
				rewritten.push(argv[index + 1]!);
				index += 1;
			}
			continue;
		}

		if (token === helpTarget) {
			rewritten.push(helpTarget, '--help');
			break;
		}
	}

	return rewritten;
}

function hasHelpFlag(argv: string[]): boolean {
	return argv.slice(2).some((token) => token === '-h' || token === '--help' || token === 'help');
}

export function shouldShowGlobalHelp(command: string | undefined, helpTarget?: string | undefined): boolean {
	return !command || (command === 'help' && !helpTarget);
}

class InterceptedExit extends Error {
	constructor(public readonly code: number) {
		super(`Intercepted process.exit(${code})`);
	}
}

function isMissingGeneratedCliDependency(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes('Cannot find module') ||
		message.includes('Cannot find package') ||
		message.includes('ERR_MODULE_NOT_FOUND') ||
		message.includes('generated CLI dependencies are missing')
	);
}

function printHandwrittenHelpAddendum(): void {
	console.log('\nHandwritten extensions:');
	console.log(
		'  update-event-type (--event-type-uri <event-type-uri> | --event-type-uuid <event-type-uuid>) [--name <name>] [--description <description>] [--duration <duration:number>] [--active <active:boolean>] [--secret <secret:boolean>] [--dry-run] [--raw <json>]'
	);
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

async function runGeneratedCliWithInterceptedExit(): Promise<void> {
	const { runCli: runGeneratedCli } = await import('../generated/cli');
	const originalExit = process.exit.bind(process);
	const originalExitCode = process.exitCode;
	const interceptedExit = ((code?: string | number | null | undefined): never => {
		const normalizedCode = typeof code === 'number' ? code : Number.parseInt(String(code ?? 0), 10) || 0;
		throw new InterceptedExit(normalizedCode);
	}) as typeof process.exit;

	process.exit = interceptedExit;
	try {
		await runGeneratedCli();
	} catch (error) {
		if (!(error instanceof InterceptedExit) || error.code !== 0) {
			throw error;
		}
	} finally {
		process.exit = originalExit;
		process.exitCode = originalExitCode;
	}
}

async function withProcessArgv<T>(argv: string[], callback: () => Promise<T>): Promise<T> {
	const originalArgv = [...process.argv];
	process.argv = [...argv];
	try {
		return await callback();
	} finally {
		process.argv = originalArgv;
	}
}

export async function runCli(): Promise<void> {
	const command = detectCommand(process.argv);
	const helpTarget = detectHelpTarget(process.argv);
	const argv = command === 'help' ? rewriteHelpArgv(process.argv, helpTarget) : [...process.argv];
	const routedCommand = command === 'help' ? helpTarget : command;
	const wantsHelp = hasHelpFlag(process.argv);
	const isGlobalHelp = shouldShowGlobalHelp(command, helpTarget);
	if (isGlobalHelp) {
		try {
			await runGeneratedCliWithInterceptedExit();
			printHandwrittenHelpAddendum();
			return;
		} catch (error) {
			if (!isMissingGeneratedCliDependency(error)) {
				throw error;
			}
			const program = createProgram();
			try {
				await registerHandwrittenCommands(program);
				program.outputHelp();
			} catch {
				program.outputHelp();
			}
			console.error('\nNote: Full command set is unavailable because generated CLI dependencies are missing.');
			console.error('Install runtime deps (e.g. mcporter) to restore all generated commands.');
			return;
		}
	}

	if (!routedCommand || !HANDWRITTEN_COMMANDS.has(routedCommand)) {
		try {
			const { runCli: runGeneratedCli } = await import('../generated/cli');
			await withProcessArgv(argv, async () => {
				await runGeneratedCli();
			});
			return;
		} catch (error) {
			throw error;
		}
		return;
	}

	const program = createProgram();
	try {
		await registerHandwrittenCommands(program);
		await program.parseAsync(argv);
	} catch (error) {
		if (!wantsHelp) {
			throw error;
		}
		program.outputHelp();
		console.error('\nNote: Full handwritten command help is unavailable because handwritten command modules could not load.');
		console.error('Install runtime deps (e.g. mcporter) to restore full handwritten help output.');
	}
}
