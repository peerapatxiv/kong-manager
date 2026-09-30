import type { IncomingMessage, ServerResponse } from 'node:http';
/** Requests to `${PROXY_PREFIX}/<admin api path>` are forwarded to the Kong named in X-Kong-Target. */
export declare const PROXY_PREFIX = "/__kong";
export declare const TARGET_HEADER = "x-kong-target";
/** Set on responses that come from the proxy itself, so the app can tell them apart from Kong's own. */
export declare const PROXY_ERROR_HEADER = "x-kong-proxy-error";
/**
 * A Connect-style middleware for the Vite dev server. The browser calls this server, which
 * is same-origin, and this server calls Kong, where CORS does not apply. It forwards to
 * whatever http(s) address it is given, so only enable it on your own machine.
 */
export declare function kongProxyMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void;
