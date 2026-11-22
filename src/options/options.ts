import browser from "webextension-polyfill";
import {
  ADVANCED_KEYS,
  DEFAULTS,
  LANGUAGES,
  REPO_URL,
  SITE_IDS,
  SITES,
  type SelectorKey,
  type Settings,
} from "../shared/config";
import { iconEl } from "../shared/icons";
import { anki } from "../shared/messages";
import { loadSettings, onSettingsChanged, saveSettings } from "../shared/settings";

const form = document.getElementById("f") as HTMLFormElement;
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const field = <E extends HTMLElement = HTMLSelectElement>(name: string) =>
  form.elements.namedItem(name) as E;
const fieldSelects = () => [...form.querySelectorAll<HTMLSelectElement>("[data-field]")];
let cfg: Settings = { ...DEFAULTS };

/**
 * Fill a <select>. A saved value Anki doesn't know about stays visible
 * (flagged) rather than silently switching to something else.
 */
function fill(select: HTMLSelectElement, values: string[], current: string, optional = false) {
  select.replaceChildren();
  if (optional) select.add(new Option("— none —", ""));
  for (const v of values) select.add(new Option(v, v));
  if (current && !values.includes(current)) select.add(new Option(`${current} (not found)`, current));
  select.value = current ?? "";
}

let savedTimer = 0;
async function save(patch: Partial<Settings>) {
  Object.assign(cfg, patch);
  await saveSettings(patch);
  const s = $("saved");
  s.replaceChildren(iconEl("circle-check"), "Saved");
  s.classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => s.classList.remove("show"), 1400);
  updateSameFieldHint();
}

function updateSameFieldHint() {
  $("sameWarn").classList.toggle("show", !!cfg.fAudio && cfg.fAudio === cfg.fSentence);
}

/** Pick sensible fields for a note type the user just chose. */
function guessFields(fields: string[]) {
  const find = (re: RegExp) => fields.find((x) => re.test(x));
  return {
    fSentence: fields[0] ?? "",
    fTranslation: find(/english|translat|meaning|back/i) ?? fields[1] ?? fields[0] ?? "",
    fAudio: find(/audio|sound/i) ?? fields[0] ?? "",
    fHighlight: find(/word|highlight|target|vocab/i) ?? "",
  };
}

type FieldKey = "fSentence" | "fTranslation" | "fAudio" | "fHighlight";

async function loadFields(modelChanged = false) {
  const r = await anki<string[]>("modelFieldNames", { modelName: cfg.model });
  const fields = r.ok ? r.result : [];
  const patch: Partial<Settings> = {};
  if (modelChanged && r.ok) {
    // Keep choices that still exist; guess the rest.
    const g = guessFields(fields);
    for (const s of fieldSelects()) {
      const k = s.name as FieldKey;
      if (!(cfg[k] && fields.includes(cfg[k]))) patch[k] = g[k];
    }
    Object.assign(cfg, patch);
  }
  for (const s of fieldSelects())
    fill(s, fields, cfg[s.name as FieldKey], "optional" in s.dataset);
  if (Object.keys(patch).length) await save(patch);
}

async function loadAnki() {
  const conn = $("conn"),
    banner = $("banner");
  conn.className = "conn";
  conn.textContent = "Connecting…";
  const [decks, models] = await Promise.all([
    anki<string[]>("deckNames"),
    anki<string[]>("modelNames"),
  ]);
  if (!decks.ok || !models.ok) {
    conn.className = "conn err";
    conn.textContent = "Not connected";
    banner.textContent = `${(!decks.ok && decks.error) || (!models.ok && models.error)} Your saved choices are kept; press refresh once Anki is ready.`;
    banner.classList.add("show");
    fill(field("deck"), [], cfg.deck);
    fill(field("model"), [], cfg.model);
    for (const s of fieldSelects()) fill(s, [], cfg[s.name as FieldKey], "optional" in s.dataset);
    return;
  }
  banner.classList.remove("show");
  conn.className = "conn ok";
  conn.textContent = "Connected";
  fill(field("deck"), decks.result.sort(), cfg.deck);
  fill(field("model"), models.result.sort(), cfg.model);
  await loadFields();
}

/** "Translate into" only matters while automatic translation is on. */
function updateTranslateState() {
  const lang = field("targetLang");
  lang.disabled = !cfg.autoTranslate;
}

type UrlKey = "ankiUrl" | "translateUrl";

/**
 * Check a typed address and make sure the extension may reach it. The default
 * addresses are granted at install; anything else is asked for here, while the
 * user's edit still counts as a user action.
 */
async function checkUrl(key: UrlKey, value: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return "That isn't a complete address. It should start with http:// or https://.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    return "The address should start with http:// or https://.";
  if (u.origin === new URL(DEFAULTS[key]).origin) return null;
  const origins = [`${u.protocol}//${u.hostname}/*`];
  try {
    if (await browser.permissions.contains({ origins })) return null;
    if (await browser.permissions.request({ origins })) return null;
  } catch (e) {
    return `Couldn't ask for access to ${u.hostname}: ${e instanceof Error ? e.message : e}`;
  }
  return `Glöwr needs your permission to connect to ${u.hostname}. Change the address again to be asked.`;
}

function showUrlError(key: UrlKey, msg: string | null) {
  form.querySelector(`[data-err="${key}"]`)!.textContent = msg ?? "";
  field<HTMLInputElement>(key).classList.toggle("bad", !!msg);
}

function fillAdvanced() {
  for (const k of ["ankiUrl", "ankiKey", "translateUrl"] as const)
    field<HTMLInputElement>(k).value = cfg[k];
  field<HTMLInputElement>("pad").value = String(cfg.pad);
  for (const id of SITE_IDS) field<HTMLInputElement>(`sel_${id}`).value = cfg[`sel_${id}`];
}

function buildStatic() {
  $("refresh").replaceChildren(iconEl("refresh"));
  $("advIcon").replaceWith(iconEl("chevron-right"));
  $("reset").replaceChildren(iconEl("replay"), "Reset advanced settings to defaults");
  for (const k of ["ankiUrl", "translateUrl"] as const)
    field<HTMLInputElement>(k).placeholder = DEFAULTS[k];
  $("version").textContent = `v${browser.runtime.getManifest().version}`;
  const repo = $<HTMLAnchorElement>("repo");
  if (REPO_URL) repo.href = REPO_URL;
  else repo.parentElement?.removeChild(repo);

  const lang = field("targetLang");
  for (const [code, name] of LANGUAGES) lang.add(new Option(name, code));
  if (!LANGUAGES.some(([c]) => c === cfg.targetLang))
    lang.add(new Option(cfg.targetLang, cfg.targetLang));
  lang.value = cfg.targetLang;
  field<HTMLInputElement>("autoRecord").checked = cfg.autoRecord;
  field<HTMLInputElement>("autoTranslate").checked = cfg.autoTranslate;
  updateTranslateState();

  const sites = $("sites");
  for (const id of SITE_IDS) {
    const l = document.createElement("label");
    l.className = "full";
    const span = document.createElement("span");
    span.textContent = SITES[id].label;
    const input = document.createElement("input");
    input.className = "mono";
    input.name = `sel_${id}`;
    input.spellcheck = false;
    input.placeholder = SITES[id].selector;
    l.append(span, input);
    sites.appendChild(l);
  }
  fillAdvanced();
}

form.addEventListener("submit", (e) => e.preventDefault());
form.addEventListener("change", async (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (!t.name) return;
  if (t instanceof HTMLInputElement && t.type === "checkbox") {
    if (t.name === "autoTranslate") {
      cfg.autoTranslate = t.checked;
      updateTranslateState();
    }
    return save({ [t.name]: t.checked } as Partial<Settings>);
  }
  if (t.name === "ankiUrl" || t.name === "translateUrl") {
    const key = t.name;
    const value = t.value.trim() || DEFAULTS[key];
    t.value = value;
    const err = await checkUrl(key, value);
    showUrlError(key, err);
    if (err) return;
    await save({ [key]: value });
    if (key === "ankiUrl") void loadAnki();
    return;
  }
  if (t.name === "ankiKey") {
    await save({ ankiKey: t.value.trim() });
    return void loadAnki();
  }
  if (t.name === "pad") return save({ pad: Math.max(0, parseFloat(t.value) || 0) });
  if (t.name.startsWith("sel_")) {
    const id = t.name.slice(4) as keyof typeof SITES;
    return save({ [t.name]: t.value.trim() || SITES[id].selector } as Partial<Settings>);
  }
  await save({ [t.name]: t.value } as Partial<Settings>);
  if (t.name === "model") await loadFields(true);
});
$("refresh").addEventListener("click", () => void loadAnki());
$("reset").addEventListener("click", async () => {
  const patch = Object.fromEntries(ADVANCED_KEYS.map((k) => [k, DEFAULTS[k]])) as Partial<Settings>;
  await save(patch);
  fillAdvanced();
  showUrlError("ankiUrl", null);
  showUrlError("translateUrl", null);
  void loadAnki();
});

void loadSettings().then((c) => {
  cfg = c;
  buildStatic();
  updateSameFieldHint();
  void loadAnki();
});

// Keep in sync if the panel's "Pick subs" changes a selector while this is open.
onSettingsChanged((patch) => {
  Object.assign(cfg, patch);
  for (const id of SITE_IDS) {
    const k: SelectorKey = `sel_${id}`;
    const input = field<HTMLInputElement>(k);
    if (k in patch && input && document.activeElement !== input) input.value = cfg[k];
  }
});
