import type { IncomingMessage, ServerResponse } from 'node:http';
/**
 * Lets the local server stop itself once every app tab is closed. Used by the macOS app
 * (KONG_MANAGER_AUTO_STOP=1); a plain `npm start` or `dev:proxy` keeps running.
 *
 * Each tab POSTs `${HEARTBEAT_PATH}?tab=<id>` every few seconds, and `&bye=1` when it closes.
 */
export declare const HEARTBEAT_PATH = "/__kong-heartbeat";
export type TabTrackerOptions = {
    now?: () => number;
    /** How long to wait after the last tab closes, so a reload doesn't stop the server. */
    closeGraceMs?: number;
    /** A tab that hasn't checked in for this long is treated as closed. Kept long because
     * browsers slow timers in background tabs to about once a minute. */
    staleMs?: number;
    /** Stop if no tab has opened this long after start. */
    startupMs?: number;
};
export declare function createTabTracker(options?: TabTrackerOptions): {
    beat(id: string): void;
    bye(id: string): void;
    shouldStop(): boolean;
};
type Tracker = {
    beat(id: string): void;
    bye(id: string): void;
};
export declare function heartbeatMiddleware(tracker: Tracker): (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
/** Checks every couple of seconds and exits the process once every tab has gone. */
export declare function watchTabs(tracker: ReturnType<typeof createTabTracker>, onStop: () => void, intervalMs?: number): NodeJS.Timeout;
export {};
