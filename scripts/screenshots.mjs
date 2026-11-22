// End-to-end run of the built Chrome extension, saving README screenshots.
//
//   npm run build:chrome && npm run screenshots
//
// Serves a demo programme (see screenshots/make-demo.mjs) over HTTPS under
// a supported site's hostname, so the unmodified build activates as it would
// on the real site, and fakes AnkiConnect and the translation service.
// Needs: ffmpeg + espeak-ng (first run, to make the demo), openssl,
// and Playwright's Chromium (`npx playwright install chromium`).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, createReadStream } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = join(root, "scripts/screenshots/demo");
const outDir = join(root, "docs/screenshots");
const ext = join(root, "dist/chrome");
const HOST = "www.s4c.cymru";
const PAGE = `https://${HOST}/clic/demo`;
// 1280×800 is the Chrome Web Store / AMO screenshot size; store/ gets them at 1×.
const W = 1280,
  H = 800;

if (!existsSync(join(ext, "manifest.json"))) throw new Error("Run `npm run build:chrome` first.");
if (!existsSync(join(demoDir, "demo.webm")))
  execFileSync("node", [join(root, "scripts/screenshots/make-demo.mjs")], { stdio: "inherit" });
const storeDir = join(outDir, "store");
mkdirSync(storeDir, { recursive: true });
const cues = JSON.parse(readFileSync(join(demoDir, "cues.json"), "utf8"));

const ENGLISH = {
  "Bore da, a chroeso i'r rhaglen.": "Good morning, and welcome to the programme.",
  "Heddiw, rydyn ni'n mynd i'r mynyddoedd.": "Today, we're going to the mountains.",
  "Mae'r tywydd yn braf iawn y bore 'ma.": "The weather is lovely this morning.",
  "Edrychwch ar yr afon yn y dyffryn.": "Look at the river in the valley.",
  "Dw i wrth fy modd yn cerdded yma.": "I love walking here.",
  "Beth am baned o de cyn mynd ymlaen?": "How about a cup of tea before we carry on?",
  "Mae'r llwybr yn serth, ond mae'r olygfa'n werth chweil.":
    "The path is steep, but the view is worth it.",
  "Diolch am wylio, a hwyl fawr!": "Thanks for watching, and goodbye!",
};

// ---------- local HTTPS: demo page + fake translation ----------
const tmp = mkdtempSync(join(tmpdir(), "glowr-shots-"));
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${HOST}`,
  "-keyout", join(tmp, "key.pem"), "-out", join(tmp, "cert.pem"),
], { stdio: "ignore" });

function serveFile(req, res, file, type) {
  const size = statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (!m) {
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    return createReadStream(file).pipe(res);
  }
  const a = m[1] ? +m[1] : 0,
    b = m[2] ? +m[2] : size - 1;
  res.writeHead(206, {
    "Content-Type": type,
    "Content-Range": `bytes ${a}-${b}/${size}`,
    "Content-Length": b - a + 1,
    "Accept-Ranges": "bytes",
  });
  createReadStream(file, { start: a, end: b }).pipe(res);
}

let translations = 0;
const web = https.createServer(
  { key: readFileSync(join(tmp, "key.pem")), cert: readFileSync(join(tmp, "cert.pem")) },
  (req, res) => {
    const url = new URL(req.url, `https://${req.headers.host}`);
    if (url.pathname === "/translate_a/single") {
      translations++;
      const q = url.searchParams.get("q") ?? "";
      const en = q
        .split(/(?<=[.?!])\s+/)
        .map((s) => ENGLISH[s] ?? s)
        .join(" ");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify([[[en, q]]]));
    }
    if (url.pathname === "/demo.webm") return serveFile(req, res, join(demoDir, "demo.webm"), "video/webm");
    if (url.pathname === "/cues.json") return serveFile(req, res, join(demoDir, "cues.json"), "application/json");
    if (url.pathname === "/clic/demo")
      return serveFile(req, res, join(root, "scripts/screenshots/demo-page.html"), "text/html; charset=utf-8");
    res.writeHead(404).end();
  },
);
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const webPort = web.address().port;

// ---------- fake AnkiConnect ----------
const notes = [];
const FIELDS = { "Welsh sentences": ["Cymraeg", "English", "Word", "Notes"], Basic: ["Front", "Back"] };
let lastAnkiKey;
const ankiServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { action, params, key } = JSON.parse(body || "{}");
    lastAnkiKey = key;
    const handlers = {
      requestPermission: () => ({ permission: "granted", requireApikey: false, version: 6 }),
      deckNames: () => ["Default", "Cymraeg", "Cymraeg::Ar y Mynydd", "Cymraeg::Geirfa"],
      modelNames: () => Object.keys(FIELDS),
      modelFieldNames: () => FIELDS[params?.modelName] ?? [],
      addNote: () => (notes.push(params.note), 1700000000000 + notes.length),
    };
    const result = handlers[action]?.();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result === undefined ? { result: null, error: "unsupported action" } : { result, error: null }));
  });
});
await new Promise((r, j) => ankiServer.once("error", j).listen(8765, "127.0.0.1", r)).catch(() => {
  throw new Error("Port 8765 is busy. Close Anki (or anything else on it) while taking screenshots.");
});

// ---------- browser ----------
const profile = mkdtempSync(join(tmpdir(), "glowr-profile-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    // Chromium no longer honours --load-extension; load over CDP instead.
    "--enable-unsafe-extension-debugging",
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${webPort}, MAP translate.googleapis.com 127.0.0.1:${webPort}`,
    "--ignore-certificate-errors",
    "--no-proxy-server", // a system proxy would bypass the host mapping
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const browserCdp = await ctx.browser().newBrowserCDPSession();
const { id: extId } = await browserCdp.send("Extensions.loadUnpacked", { path: ext });
const errors = [];
const findWorker = () => ctx.serviceWorkers().find((w) => w.url().includes(extId));
let worker = findWorker() ?? (await ctx.waitForEvent("serviceworker", { predicate: (w) => w.url().includes(extId) }));

// Settings as a typical user would have them.
await worker.evaluate(() =>
  chrome.storage.sync.set({
    deck: "Cymraeg::Ar y Mynydd",
    model: "Welsh sentences",
    fSentence: "Cymraeg",
    fTranslation: "English",
    fAudio: "Cymraeg",
    fHighlight: "Word",
  }),
);

const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);

/** Boxes of elements inside the panel's closed shadow root. */
async function panelBoxes(selector) {
  const { root: doc } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const find = (n) => {
    if (n.attributes?.includes("glowr-host")) return n;
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) {
      const f = find(c);
      if (f) return f;
    }
  };
  const host = find(doc);
  if (!host?.shadowRoots?.[0]) return [];
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
    nodeId: host.shadowRoots[0].nodeId,
    selector,
  });
  const out = [];
  for (const nodeId of nodeIds) {
    const { model } = await cdp.send("DOM.getBoxModel", { nodeId }).catch(() => ({}));
    if (!model) continue;
    const q = model.border;
    const { outerHTML } = await cdp.send("DOM.getOuterHTML", { nodeId });
    out.push({ x: (q[0] + q[2]) / 2, y: (q[1] + q[5]) / 2, html: outerHTML });
  }
  return out;
}
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const shot = async (name, store) => {
  await page.screenshot({ path: join(outDir, name) });
  if (store) await page.screenshot({ path: join(storeDir, store), scale: "css" });
};
/** The settings page at store size, zoomed so the column fills more of the frame. */
const storeShotOptions = async (opts, name, scrollTo) => {
  const size = opts.viewportSize();
  await opts.setViewportSize({ width: W, height: H });
  await opts.evaluate((sel) => {
    document.body.style.zoom = "1.3";
    document.getElementById("saved").style.visibility = "hidden";
    window.scrollTo(0, sel ? document.querySelector(sel).getBoundingClientRect().top + scrollY - 28 : 0);
  }, scrollTo);
  await opts.waitForTimeout(200);
  await opts.screenshot({ path: join(storeDir, name), scale: "css" });
  await opts.evaluate(() => {
    document.body.style.zoom = "";
    document.getElementById("saved").style.visibility = "";
  });
  await opts.setViewportSize(size);
};
const check = (ok, msg) => {
  if (!ok) throw new Error(`Check failed: ${msg}`);
  console.log(`  ✓ ${msg}`);
};
const video = (js) => page.evaluate(`(() => { const v = document.getElementById("v"); ${js} })()`);

try {
  await page.goto(PAGE);
  await page.mouse.click(W / 2, H / 2); // the gesture audio needs
  await video("v.play()");
  // Play through the fourth line.
  await page.waitForFunction((end) => document.getElementById("v").currentTime > end, cues[3].end + 0.3, {
    timeout: 30000,
  });
  const rows = await panelBoxes(".cue");
  check(rows.length >= 4, `captured ${rows.length} subtitle lines`);
  check(text(rows[1].html).includes(cues[1].text), "line text and order match the programme");
  const pill = text((await panelBoxes(".pill"))[0].html);
  check(pill === "Recording", `panel says "${pill}"`);

  // Panel with a selected line, mid-programme.
  await video(`v.pause(); v.currentTime = ${cues[3].start + 1}`);
  await page.waitForTimeout(600);
  const r2 = await panelBoxes(".cue");
  await page.mouse.click(r2[2].x + 40, r2[2].y);
  await page.waitForTimeout(500);
  await shot("panel.png", "1-panel.png");

  // Card editor for two lines: shift-click to extend the selection.
  await page.keyboard.down("Shift");
  await page.mouse.click(r2[3].x + 40, r2[3].y);
  await page.keyboard.up("Shift");
  await page.keyboard.press("Alt+KeyA");
  await page.waitForTimeout(1500);
  const sentence = await panelBoxes("textarea");
  check(sentence.length === 2, "card editor opened");
  // Highlight a word the way a user would: select it in the sentence.
  await page.mouse.dblclick(sentence[0].x - 250, sentence[0].y - 8);
  await page.waitForTimeout(300);
  await shot("editor.png", "2-editor.png");

  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(2000);
  check(notes.length === 1, "note sent to AnkiConnect");
  const n = notes[0];
  check(n.deckName === "Cymraeg::Ar y Mynydd" && n.modelName === "Welsh sentences", "deck and note type from settings");
  check(text(n.fields.Cymraeg) === `${cues[2].text} ${cues[3].text}`, "both selected lines in the sentence");
  check(n.fields.Cymraeg.includes("<b>braf</b>") && n.fields.Word === "braf", "highlighted word bolded and in its field");
  check(n.fields.English.includes("weather"), "translation filled in");
  const mp3 = Buffer.from(n.audio?.[0]?.data ?? "", "base64");
  check(mp3.length > 20000, `audio clip attached (${(mp3.length / 1024).toFixed(0)} KB MP3)`);
  await shot("added.png", "3-added.png");

  // Close button: hides the panel and stops recording.
  const [closeBtn] = await panelBoxes('[data-act="close"]');
  await page.mouse.click(closeBtn.x, closeBtn.y);
  await page.waitForTimeout(400);
  check((await panelBoxes(".panel"))[0] === undefined || !(await panelBoxes(".panel:not([hidden])")).length, "close hides the panel");
  await shot("closed.png");
  // Toolbar button (as the background script does it) brings it back.
  worker = findWorker() ?? worker;
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true });
    return chrome.tabs.sendMessage(tab.id, { type: "togglePanel" });
  });
  await page.waitForTimeout(500);
  check((await panelBoxes(".panel:not([hidden])")).length === 1, "toolbar button reopens it");

  // Options page.
  const opts = await ctx.newPage();
  await opts.setViewportSize({ width: 900, height: 1240 });
  await opts.goto(`chrome-extension://${extId}/options.html`);
  await opts.waitForSelector(".conn.ok");
  await opts.waitForTimeout(400); // let the switch finish animating
  check(await opts.inputValue("select[name=deck]") === "Cymraeg::Ar y Mynydd", "options page loads decks from Anki");
  await opts.screenshot({ path: join(outDir, "options.png"), fullPage: true });
  await storeShotOptions(opts, "4-settings.png");

  // Turning off automatic translation: the editor sends nothing to the translator.
  await opts.click("label:has(input[name=autoTranslate])");
  await opts.waitForTimeout(400);
  check(await opts.isDisabled("select[name=targetLang]"), "translate switch disables the language");
  const before = translations;
  await page.bringToFront();
  await page.keyboard.press("Alt+KeyA");
  await page.waitForTimeout(1500);
  const boxes = await panelBoxes("textarea");
  check(boxes.length === 2 && translations === before, "no translation request when it's off");
  await page.keyboard.press("Escape");

  // Advanced settings.
  await opts.bringToFront();
  await opts.click("label:has(input[name=autoTranslate])"); // back on, as most people have it
  await opts.click("summary");
  await opts.waitForTimeout(300);
  check(await opts.inputValue("input[name=ankiUrl]") === "http://127.0.0.1:8765", "advanced settings show the AnkiConnect address");
  await opts.screenshot({ path: join(outDir, "options-advanced.png"), fullPage: true });
  await storeShotOptions(opts, "5-advanced.png", "#advanced");
  await opts.fill("input[name=ankiUrl]", "not a url");
  await opts.press("input[name=ankiUrl]", "Tab");
  await opts.waitForTimeout(300);
  check((await opts.textContent('[data-err="ankiUrl"]')).includes("http://"), "a bad address is rejected with a message");
  await opts.fill("input[name=ankiUrl]", "http://127.0.0.1:8765/");
  await opts.fill("input[name=ankiKey]", "s3cret");
  await opts.press("input[name=ankiKey]", "Tab");
  await opts.waitForSelector(".conn.ok");
  await opts.waitForTimeout(300);
  const saved = await worker.evaluate(() => chrome.storage.sync.get(["ankiUrl", "ankiKey"]));
  check(saved.ankiUrl === "http://127.0.0.1:8765/" && lastAnkiKey === "s3cret", "custom address and API key are saved and used");
  await opts.click("#reset");
  await opts.waitForTimeout(500);
  const after = await worker.evaluate(() => chrome.storage.sync.get(["ankiUrl", "ankiKey"]));
  check(
    after.ankiUrl === "http://127.0.0.1:8765" && after.ankiKey === "" &&
      (await opts.inputValue("input[name=ankiUrl]")) === "http://127.0.0.1:8765",
    "reset restores the defaults",
  );

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
  console.log(`Screenshots saved to ${outDir}`);
} finally {
  await ctx.close();
  web.close();
  ankiServer.close();
}
