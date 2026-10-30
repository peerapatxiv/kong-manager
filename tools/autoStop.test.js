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
import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { createTabTracker, heartbeatMiddleware, HEARTBEAT_PATH } from './autoStop';
function clock(start) {
    if (start === void 0) { start = 0; }
    var time = start;
    return { now: function () { return time; }, advance: function (ms) { return (time += ms); } };
}
var options = { closeGraceMs: 10000, staleMs: 180000, startupMs: 180000 };
describe('createTabTracker', function () {
    it('keeps running while a tab is open', function () {
        var c = clock();
        var tracker = createTabTracker(__assign(__assign({}, options), { now: c.now }));
        tracker.beat('a');
        c.advance(60000);
        expect(tracker.shouldStop()).toBe(false);
    });
    it('stops once the last tab has said goodbye and the grace period passes', function () {
        var c = clock();
        var tracker = createTabTracker(__assign(__assign({}, options), { now: c.now }));
        tracker.beat('a');
        tracker.bye('a');
        c.advance(9000);
        expect(tracker.shouldStop()).toBe(false);
        c.advance(2000);
        expect(tracker.shouldStop()).toBe(true);
    });
    it('keeps running through a reload, which says goodbye then comes back', function () {
        var c = clock();
        var tracker = createTabTracker(__assign(__assign({}, options), { now: c.now }));
        tracker.beat('a');
        tracker.bye('a');
        c.advance(1000);
        tracker.beat('b');
        c.advance(20000);
        expect(tracker.shouldStop()).toBe(false);
    });
    it('keeps running while another tab is still open', function () {
        var c = clock();
        var tracker = createTabTracker(__assign(__assign({}, options), { now: c.now }));
        tracker.beat('a');
        tracker.beat('b');
        tracker.bye('a');
        c.advance(20000);
        expect(tracker.shouldStop()).toBe(false);
    });
    it('drops a tab that stopped checking in without saying goodbye', function () {
        var c = clock();
        var tracker = createTabTracker(__assign(__assign({}, options), { now: c.now }));
        tracker.beat('a');
        c.advance(181000);
        expect(tracker.shouldStop()).toBe(false);
        c.advance(11000);
        expect(tracker.shouldStop()).toBe(true);
    });
    it('stops if no tab ever opens', function () {
        var c = clock();
        var tracker = createTabTracker(__assign(__assign({}, options), { now: c.now }));
        c.advance(179000);
        expect(tracker.shouldStop()).toBe(false);
        c.advance(2000);
        expect(tracker.shouldStop()).toBe(true);
    });
});
describe('heartbeatMiddleware', function () {
    function withServer(run) {
        return __awaiter(this, void 0, void 0, function () {
            var calls, tracker, middleware, server;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        calls = [];
                        tracker = { beat: function (id) { return calls.push("beat ".concat(id)); }, bye: function (id) { return calls.push("bye ".concat(id)); } };
                        middleware = heartbeatMiddleware(tracker);
                        server = http.createServer(function (req, res) {
                            return middleware(req, res, function () {
                                res.statusCode = 418;
                                res.end();
                            });
                        });
                        return [4 /*yield*/, new Promise(function (resolve) { return server.listen(0, '127.0.0.1', function () { return resolve(); }); })];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 6]);
                        return [4 /*yield*/, run("http://127.0.0.1:".concat(server.address().port), calls)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, new Promise(function (resolve) { return server.close(function () { return resolve(); }); })];
                    case 5:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
    it('records a heartbeat and a goodbye', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, withServer(function (base, calls) { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    _a = expect;
                                    return [4 /*yield*/, fetch("".concat(base).concat(HEARTBEAT_PATH, "?tab=t1"), { method: 'POST' })];
                                case 1:
                                    _a.apply(void 0, [(_c.sent()).status]).toBe(204);
                                    _b = expect;
                                    return [4 /*yield*/, fetch("".concat(base).concat(HEARTBEAT_PATH, "?tab=t1&bye=1"), { method: 'POST' })];
                                case 2:
                                    _b.apply(void 0, [(_c.sent()).status]).toBe(204);
                                    expect(calls).toEqual(['beat t1', 'bye t1']);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('ignores a heartbeat without a tab id', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, withServer(function (base, calls) { return __awaiter(void 0, void 0, void 0, function () {
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _a = expect;
                                    return [4 /*yield*/, fetch("".concat(base).concat(HEARTBEAT_PATH), { method: 'POST' })];
                                case 1:
                                    _a.apply(void 0, [(_b.sent()).status]).toBe(204);
                                    expect(calls).toEqual([]);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('passes every other request on', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, withServer(function (base, calls) { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    _a = expect;
                                    return [4 /*yield*/, fetch("".concat(base, "/__kong/services"))];
                                case 1:
                                    _a.apply(void 0, [(_c.sent()).status]).toBe(418);
                                    _b = expect;
                                    return [4 /*yield*/, fetch("".concat(base).concat(HEARTBEAT_PATH, "-other?tab=x"), { method: 'POST' })];
                                case 2:
                                    _b.apply(void 0, [(_c.sent()).status]).toBe(418);
                                    expect(calls).toEqual([]);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
