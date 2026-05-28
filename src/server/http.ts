export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

export class SeawompHttpSignal extends Error {
	status: number;
	location?: string;

	constructor(status: number, message: string, location?: string) {
		super(message);
		this.name = 'SeawompHttpSignal';
		this.status = status;
		this.location = location;
	}
}

export function notFound(message = 'Not Found'): SeawompHttpSignal {
	return new SeawompHttpSignal(404, message);
}

export function redirect(
	destination: string,
	status: RedirectStatus = 307,
): SeawompHttpSignal {
	return new SeawompHttpSignal(status, `Redirect to ${destination}`, destination);
}

export function isHttpSignal(value: unknown): value is SeawompHttpSignal {
	if (value instanceof SeawompHttpSignal) return true;
	if (!value || typeof value !== 'object') return false;
	const candidate = value as { name?: unknown; status?: unknown };
	return candidate.name === 'SeawompHttpSignal' && typeof candidate.status === 'number';
}

export function isRedirectSignal(value: unknown): value is SeawompHttpSignal {
	return isHttpSignal(value) && value.status >= 300 && value.status < 400 && !!value.location;
}

export function isNotFoundSignal(value: unknown): value is SeawompHttpSignal {
	return isHttpSignal(value) && value.status === 404;
}

export function redirectResponse(signal: SeawompHttpSignal): Response {
	return new Response(null, {
		status: signal.status,
		headers: { location: signal.location ?? '/' },
	});
}
