/**
 * Lets the local server stop itself once every app tab is closed. Used by the macOS app
 * (KONG_MANAGER_AUTO_STOP=1); a plain `npm start` or `dev:proxy` keeps running.
 *
 * Each tab POSTs `${HEARTBEAT_PATH}?tab=<id>` every few seconds, and `&bye=1` when it closes.
 */
export var HEARTBEAT_PATH = '/__kong-heartbeat';
export function createTabTracker(options) {
    if (options === void 0) { options = {}; }
    var _a = options.now, now = _a === void 0 ? Date.now : _a, _b = options.closeGraceMs, closeGraceMs = _b === void 0 ? 10000 : _b, _c = options.staleMs, staleMs = _c === void 0 ? 180000 : _c, _d = options.startupMs, startupMs = _d === void 0 ? 180000 : _d;
    var lastSeen = new Map();
    var startedAt = now();
    var emptySince = null;
    return {
        beat: function (id) {
            lastSeen.set(id, now());
            emptySince = null;
        },
        bye: function (id) {
            if (!lastSeen.delete(id))
                return;
            if (lastSeen.size === 0)
                emptySince = now();
        },
        shouldStop: function () {
            var time = now();
            // forEach, not for...of: tsconfig.node.json compiles tools/ to a target without Map iteration.
            lastSeen.forEach(function (seen, id) {
                if (time - seen > staleMs) {
                    lastSeen.delete(id);
                    if (lastSeen.size === 0)
                        emptySince = seen + staleMs;
                }
            });
            if (lastSeen.size > 0)
                return false;
            if (emptySince === null)
                return time - startedAt > startupMs;
            return time - emptySince > closeGraceMs;
        },
    };
}
export function heartbeatMiddleware(tracker) {
    return function (req, res, next) {
        var _a;
        var url = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '', 'http://localhost');
        if (url.pathname !== HEARTBEAT_PATH) {
            next();
            return;
        }
        var tab = url.searchParams.get('tab');
        if (tab) {
            if (url.searchParams.has('bye'))
                tracker.bye(tab);
            else
                tracker.beat(tab);
        }
        res.statusCode = 204;
        res.end();
    };
}
/** Checks every couple of seconds and exits the process once every tab has gone. */
export function watchTabs(tracker, onStop, intervalMs) {
    if (intervalMs === void 0) { intervalMs = 2000; }
    var timer = setInterval(function () {
        if (!tracker.shouldStop())
            return;
        clearInterval(timer);
        onStop();
    }, intervalMs);
    timer.unref();
    return timer;
}
