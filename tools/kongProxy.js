import http from 'node:http';
import https from 'node:https';
/** Requests to `${PROXY_PREFIX}/<admin api path>` are forwarded to the Kong named in X-Kong-Target. */
export var PROXY_PREFIX = '/__kong';
export var TARGET_HEADER = 'x-kong-target';
/** Set on responses that come from the proxy itself, so the app can tell them apart from Kong's own. */
export var PROXY_ERROR_HEADER = 'x-kong-proxy-error';
var TIMEOUT_MS = 30000;
// Hop-by-hop headers must not be forwarded, and the browser's Origin/Referer describe the
// dev page, not this server-to-server call.
var DROPPED_REQUEST_HEADERS = new Set([
    'host',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'origin',
    'referer',
    TARGET_HEADER,
]);
function fail(res, status, message) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.setHeader(PROXY_ERROR_HEADER, '1');
    res.end(JSON.stringify({ message: message }));
}
function parseTarget(header) {
    var value = Array.isArray(header) ? header[0] : header;
    if (!value)
        return null;
    try {
        var url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    }
    catch (_a) {
        return null;
    }
}
/**
 * A Connect-style middleware for the Vite dev server. The browser calls this server, which
 * is same-origin, and this server calls Kong, where CORS does not apply. It forwards to
 * whatever http(s) address it is given, so only enable it on your own machine.
 */
export function kongProxyMiddleware(req, res, next) {
    var _a;
    var url = (_a = req.url) !== null && _a !== void 0 ? _a : '';
    if (url !== PROXY_PREFIX && !url.startsWith("".concat(PROXY_PREFIX, "/")) && !url.startsWith("".concat(PROXY_PREFIX, "?"))) {
        next();
        return;
    }
    var target = parseTarget(req.headers[TARGET_HEADER]);
    if (!target) {
        fail(res, 400, 'Missing or invalid X-Kong-Target header: it must be an http:// or https:// address.');
        return;
    }
    var headers = {};
    for (var _i = 0, _b = Object.entries(req.headers); _i < _b.length; _i++) {
        var _c = _b[_i], name_1 = _c[0], value = _c[1];
        if (value !== undefined && !DROPPED_REQUEST_HEADERS.has(name_1))
            headers[name_1] = value;
    }
    var client = target.protocol === 'https:' ? https : http;
    var upstream = client.request({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method: req.method,
        path: "".concat(target.pathname.replace(/\/+$/, '')).concat(url.slice(PROXY_PREFIX.length)),
        headers: headers,
    }, function (upstreamRes) {
        var _a;
        res.writeHead((_a = upstreamRes.statusCode) !== null && _a !== void 0 ? _a : 502, upstreamRes.headers);
        upstreamRes.pipe(res);
    });
    upstream.setTimeout(TIMEOUT_MS, function () { return upstream.destroy(new Error("timed out after ".concat(TIMEOUT_MS / 1000, "s"))); });
    upstream.on('error', function (err) {
        if (res.headersSent)
            res.destroy();
        else
            fail(res, 502, "Could not reach Kong at ".concat(target.origin, ": ").concat(err.message));
    });
    req.pipe(upstream);
}
