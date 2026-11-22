import browser from "webextension-polyfill";

/** Messages handled by the background script. */
export type Request =
  | { type: "translate"; text: string; tl: string }
  | { type: "anki"; action: string; params?: Record<string, unknown> }
  | { type: "openOptions" };

/** Messages sent from the background to a tab's content script. */
export type TabRequest = { type: "togglePanel" };

export type Reply<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: string };

export function send<T = unknown>(msg: Request): Promise<Reply<T>> {
  return browser.runtime.sendMessage(msg) as Promise<Reply<T>>;
}

export const anki = <T = unknown>(action: string, params?: Record<string, unknown>) =>
  send<T>({ type: "anki", action, params });
