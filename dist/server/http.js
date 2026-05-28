export class SeawompHttpSignal extends Error {
    status;
    location;
    constructor(status, message, location) {
        super(message);
        this.name = 'SeawompHttpSignal';
        this.status = status;
        this.location = location;
    }
}
export function notFound(message = 'Not Found') {
    return new SeawompHttpSignal(404, message);
}
export function redirect(destination, status = 307) {
    return new SeawompHttpSignal(status, `Redirect to ${destination}`, destination);
}
export function isHttpSignal(value) {
    if (value instanceof SeawompHttpSignal)
        return true;
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return candidate.name === 'SeawompHttpSignal' && typeof candidate.status === 'number';
}
export function isRedirectSignal(value) {
    return isHttpSignal(value) && value.status >= 300 && value.status < 400 && !!value.location;
}
export function isNotFoundSignal(value) {
    return isHttpSignal(value) && value.status === 404;
}
export function redirectResponse(signal) {
    return new Response(null, {
        status: signal.status,
        headers: { location: signal.location ?? '/' },
    });
}
