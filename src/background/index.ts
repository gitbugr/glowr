import browser from "webextension-polyfill";
import type { Reply, Request } from "../shared/messages";
import { loadSettings } from "../shared/settings";

class AnkiError extends Error {}

async function ankiRaw(url: string, key: string, action: string, params: Record<string, unknown> = {}) {
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ action, version: 6, params, ...(key ? { key } : {}) }),
    });
  } catch {
    throw new AnkiError(`Can't reach Anki at ${url}. Is it open, with AnkiConnect installed?`);
  }
  if (r.status === 403) return { error: "forbidden", result: null };
  const j = (await r.json()) as { result: unknown; error: string | null };
  return j;
}

/** AnkiConnect address we've already been granted access to. */
let permittedUrl = "";

/**
 * AnkiConnect only answers origins it trusts. The first time, ask it to
 * trust us (Anki shows a prompt); after that it remembers.
 */
async function anki(action: string, params?: Record<string, unknown>) {
  const { ankiUrl: url, ankiKey: key } = await loadSettings();
  if (permittedUrl !== url) {
    const p = await ankiRaw(url, key, "requestPermission");
    const res = p.result as { permission?: string } | null;
    if (res?.permission === "denied")
      throw new AnkiError(
        "Anki refused the connection. Allow it in Anki's AnkiConnect prompt, then try again.",
      );
    if (res?.permission === "granted") permittedUrl = url;
  }
  const j = await ankiRaw(url, key, action, params);
  if (j.error) throw new AnkiError(j.error === "forbidden" ? "Anki refused the connection." : j.error);
  return j.result;
}

async function translate(q: string, tl = "en", sl = "auto") {
  const base = (await loadSettings()).translateUrl;
  const url =
    base +
    (base.includes("?") ? "&" : "?") +
    "client=gtx" +
    `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(q)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`translation service returned ${r.status}`);
  const j = (await r.json()) as [[string][]];
  return j[0].map((x) => x[0]).join("");
}

async function handle(msg: Request): Promise<unknown> {
  switch (msg.type) {
    case "translate":
      return translate(msg.text, msg.tl);
    case "anki":
      return anki(msg.action, msg.params);
    case "openOptions":
      return browser.runtime.openOptionsPage();
  }
}

browser.runtime.onMessage.addListener(async (msg: unknown): Promise<Reply> => {
  try {
    return { ok: true, result: await handle(msg as Request) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// Toolbar button: toggle the panel on supported pages, else open settings.
browser.action.onClicked.addListener(async (tab) => {
  let shown = false;
  if (tab.id != null)
    shown = await browser.tabs
      .sendMessage(tab.id, { type: "togglePanel" })
      .then((r) => r === true)
      .catch(() => false);
  if (!shown) await browser.runtime.openOptionsPage();
});
