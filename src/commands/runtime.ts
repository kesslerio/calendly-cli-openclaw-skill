import { createCallResult, createRuntime, createServerProxy } from 'mcporter';

export const SERVER_NAME = 'calendly';

export async function ensureRuntime(): Promise<Awaited<ReturnType<typeof createRuntime>>> {
	return await createRuntime({
		servers: [
			{
				name: SERVER_NAME,
				command: {
					kind: 'stdio',
					command: 'npx',
					args: ['-y', 'calendly-mcp-server'],
					cwd: process.cwd(),
				},
				env: {
					CALENDLY_API_KEY: process.env.CALENDLY_API_KEY ?? '',
				},
			},
		],
	});
}

export function getServerProxy(runtime: Awaited<ReturnType<typeof createRuntime>>) {
	return createServerProxy(runtime, SERVER_NAME);
}

export async function invokeWithTimeout<T>(call: Promise<T>, timeout: number): Promise<T> {
	if (!Number.isFinite(timeout) || timeout <= 0) {
		return await call;
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			call,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					reject(new Error('Call timed out after ' + timeout + 'ms.'));
				}, timeout);
			}),
		]);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
}

export function printMcpResult(result: unknown, format: string): void {
	const wrapped = createCallResult(result);
	switch (format) {
		case 'json': {
			const json = wrapped.json();
			if (json) {
				console.log(JSON.stringify(json, null, 2));
				return;
			}
			break;
		}
		case 'markdown': {
			const markdown = wrapped.markdown();
			if (markdown) {
				console.log(markdown);
				return;
			}
			break;
		}
		case 'raw': {
			console.log(JSON.stringify(wrapped.raw, null, 2));
			return;
		}
	}
	const text = wrapped.text();
	if (text) {
		console.log(text);
	} else {
		console.log(JSON.stringify(wrapped.raw, null, 2));
	}
}
