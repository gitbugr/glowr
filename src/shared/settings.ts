import browser from "webextension-polyfill";
import { DEFAULTS, type Settings } from "./config";

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(DEFAULTS as unknown as Record<string, unknown>);
  return { ...DEFAULTS, ...stored } as Settings;
}

export function saveSettings(patch: Partial<Settings>): Promise<void> {
  return browser.storage.sync.set(patch);
}

/** Calls `fn` with each changed setting. */
export function onSettingsChanged(fn: (patch: Partial<Settings>) => void) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes)) patch[k] = v.newValue;
    fn(patch as Partial<Settings>);
  });
}
