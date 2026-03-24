export function printResult(result: unknown, format: string): void {
	if (format === 'json' || format === 'raw') {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	if (format === 'markdown') {
		if (typeof result === 'string') {
			console.log(result);
			return;
		}
		console.log('```json');
		console.log(JSON.stringify(result, null, 2));
		console.log('```');
		return;
	}

	if (typeof result === 'string') {
		console.log(result);
		return;
	}

	console.log(JSON.stringify(result, null, 2));
}
