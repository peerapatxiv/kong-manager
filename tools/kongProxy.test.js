var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { kongProxyMiddleware } from './kongProxy';
var fakeKong;
var proxy;
var seen;
var kongBase;
var proxyBase;
var kongReply;
var listen = function (server) {
    return new Promise(function (resolve) { return server.listen(0, '127.0.0.1', function () { return resolve("http://127.0.0.1:".concat(server.address().port)); }); });
};
var close = function (server) { return new Promise(function (resolve) { return server.close(function () { return resolve(); }); }); };
beforeEach(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                seen = [];
                kongReply = function (_req, res) {
                    res.setHeader('content-type', 'application/json');
                    res.end(JSON.stringify({ ok: true }));
                };
                fakeKong = http.createServer(function (req, res) {
                    var chunks = [];
                    req.on('data', function (chunk) { return chunks.push(chunk); });
                    req.on('end', function () {
                        var _a, _b;
                        var body = Buffer.concat(chunks).toString();
                        seen.push({ method: (_a = req.method) !== null && _a !== void 0 ? _a : '', url: (_b = req.url) !== null && _b !== void 0 ? _b : '', headers: req.headers, body: body });
                        kongReply(req, res, body);
                    });
                });
                proxy = http.createServer(function (req, res) {
                    return kongProxyMiddleware(req, res, function () {
                        res.statusCode = 404;
                        res.end('passed to next middleware');
                    });
                });
                return [4 /*yield*/, listen(fakeKong)];
            case 1:
                kongBase = _a.sent();
                return [4 /*yield*/, listen(proxy)];
            case 2:
                proxyBase = _a.sent();
                return [2 /*return*/];
        }
    });
}); });
afterEach(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, close(fakeKong)];
            case 1:
                _a.sent();
                return [4 /*yield*/, close(proxy)];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
var viaProxy = function (path, init, target) {
    if (init === void 0) { init = {}; }
    if (target === void 0) { target = kongBase; }
    return fetch("".concat(proxyBase, "/__kong").concat(path), __assign(__assign({}, init), { headers: __assign({ 'X-Kong-Target': target }, init.headers) }));
};
describe('kongProxyMiddleware', function () {
    it('forwards a GET with its path and query and returns Kong\'s body and status', function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, viaProxy('/services?size=5&tags=a%2Cb')];
                case 1:
                    response = _b.sent();
                    expect(response.status).toBe(200);
                    _a = expect;
                    return [4 /*yield*/, response.json()];
                case 2:
                    _a.apply(void 0, [_b.sent()]).toEqual({ ok: true });
                    expect(seen[0]).toMatchObject({ method: 'GET', url: '/services?size=5&tags=a%2Cb' });
                    return [2 /*return*/];
            }
        });
    }); });
    it('forwards the request body and the auth headers, but not the proxy\'s own header or the browser origin', function () { return __awaiter(void 0, void 0, void 0, function () {
        var response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    kongReply = function (_req, res) {
                        res.statusCode = 201;
                        res.end('{"id":"new-1"}');
                    };
                    return [4 /*yield*/, viaProxy('/consumers', {
                            method: 'POST',
                            body: JSON.stringify({ username: 'alice' }),
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: 'Basic YWRtaW46cHc=',
                                'Kong-Admin-Token': 'tok',
                                Origin: 'http://localhost:5173',
                            },
                        })];
                case 1:
                    response = _a.sent();
                    expect(response.status).toBe(201);
                    expect(seen[0].method).toBe('POST');
                    expect(JSON.parse(seen[0].body)).toEqual({ username: 'alice' });
                    expect(seen[0].headers['authorization']).toBe('Basic YWRtaW46cHc=');
                    expect(seen[0].headers['kong-admin-token']).toBe('tok');
                    expect(seen[0].headers['content-type']).toBe('application/json');
                    expect(seen[0].headers['x-kong-target']).toBeUndefined();
                    expect(seen[0].headers['origin']).toBeUndefined();
                    return [2 /*return*/];
            }
        });
    }); });
    it('passes a 204 with no body through', function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    kongReply = function (_req, res) {
                        res.statusCode = 204;
                        res.end();
                    };
                    return [4 /*yield*/, viaProxy('/services/s1', { method: 'DELETE' })];
                case 1:
                    response = _b.sent();
                    expect(response.status).toBe(204);
                    _a = expect;
                    return [4 /*yield*/, response.text()];
                case 2:
                    _a.apply(void 0, [_b.sent()]).toBe('');
                    expect(seen[0].method).toBe('DELETE');
                    return [2 /*return*/];
            }
        });
    }); });
    it('passes Kong\'s error status and body through unchanged, without marking it as a proxy error', function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    kongReply = function (_req, res) {
                        res.statusCode = 400;
                        res.setHeader('content-type', 'application/json');
                        res.end(JSON.stringify({ message: 'schema violation', fields: { host: 'required field missing' } }));
                    };
                    return [4 /*yield*/, viaProxy('/services', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })];
                case 1:
                    response = _b.sent();
                    expect(response.status).toBe(400);
                    expect(response.headers.get('x-kong-proxy-error')).toBeNull();
                    _a = expect;
                    return [4 /*yield*/, response.json()];
                case 2:
                    _a.apply(void 0, [_b.sent()]).toEqual({ message: 'schema violation', fields: { host: 'required field missing' } });
                    return [2 /*return*/];
            }
        });
    }); });
    it('keeps a path prefix on the target, and ignores a trailing slash on it', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, viaProxy('/services', {}, "".concat(kongBase, "/kong-admin/"))];
                case 1:
                    _a.sent();
                    expect(seen[0].url).toBe('/kong-admin/services');
                    return [2 /*return*/];
            }
        });
    }); });
    it.each([
        ['a missing target header', undefined],
        ['a target that is not a URL', 'not a url'],
        ['a non-http target', 'ftp://example.com'],
        ['a file target', 'file:///etc/passwd'],
    ])('refuses %s with a 400 marked as a proxy error, and forwards nothing', function (_label, target) { return __awaiter(void 0, void 0, void 0, function () {
        var headers, response, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    headers = target === undefined ? {} : { 'X-Kong-Target': target };
                    return [4 /*yield*/, fetch("".concat(proxyBase, "/__kong/services"), { headers: headers })];
                case 1:
                    response = _b.sent();
                    expect(response.status).toBe(400);
                    expect(response.headers.get('x-kong-proxy-error')).toBe('1');
                    _a = expect;
                    return [4 /*yield*/, response.json()];
                case 2:
                    _a.apply(void 0, [(_b.sent()).message]).toMatch(/X-Kong-Target/);
                    expect(seen).toHaveLength(0);
                    return [2 /*return*/];
            }
        });
    }); });
    it('answers 502 marked as a proxy error when Kong cannot be reached', function () { return __awaiter(void 0, void 0, void 0, function () {
        var deadPort, response, _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    deadPort = (function () {
                        var probe = http.createServer();
                        return new Promise(function (resolve) {
                            return probe.listen(0, '127.0.0.1', function () {
                                var url = "http://127.0.0.1:".concat(probe.address().port);
                                probe.close(function () { return resolve(url); });
                            });
                        });
                    })();
                    _a = viaProxy;
                    _b = ['/', {}];
                    return [4 /*yield*/, deadPort];
                case 1: return [4 /*yield*/, _a.apply(void 0, _b.concat([_d.sent()]))];
                case 2:
                    response = _d.sent();
                    expect(response.status).toBe(502);
                    expect(response.headers.get('x-kong-proxy-error')).toBe('1');
                    _c = expect;
                    return [4 /*yield*/, response.json()];
                case 3:
                    _c.apply(void 0, [(_d.sent()).message]).toContain('Could not reach');
                    return [2 /*return*/];
            }
        });
    }); });
    it('leaves every other URL to the next middleware', function () { return __awaiter(void 0, void 0, void 0, function () {
        var response, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, fetch("".concat(proxyBase, "/kong-manager/"))];
                case 1:
                    response = _b.sent();
                    expect(response.status).toBe(404);
                    _a = expect;
                    return [4 /*yield*/, response.text()];
                case 2:
                    _a.apply(void 0, [_b.sent()]).toBe('passed to next middleware');
                    expect(seen).toHaveLength(0);
                    return [2 /*return*/];
            }
        });
    }); });
});
