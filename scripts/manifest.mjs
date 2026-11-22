// Builds manifest.json for each browser from one description.

/**
 * @param {"firefox" | "chrome"} target
 * @param {{ version: string, description: string, appName: string, matches: string[] }} info
 */
export function manifest(target, { version, description, appName, matches }) {
  const icons = Object.fromEntries([16, 32, 48, 96, 128].map((s) => [s, `icons/icon-${s}.png`]));
  const m = {
    manifest_version: 3,
    name: appName,
    version,
    description,
    icons,
    action: {
      default_title: appName,
      default_icon: { 16: icons[16], 32: icons[32] },
    },
    background:
      target === "chrome" ? { service_worker: "background.js" } : { scripts: ["background.js"] },
    permissions: ["storage"],
    host_permissions: ["http://127.0.0.1:8765/*", "https://translate.googleapis.com/*"],
    // Asked for only when someone sets a different AnkiConnect or translation address.
    optional_host_permissions: ["http://*/*", "https://*/*"],
    content_scripts: [
      {
        matches,
        // lamejs stays a separate, unmodified file (LGPL).
        js: ["vendor/lame.min.js", "content.js"],
        all_frames: true,
      },
    ],
    // These match patterns may only name origins (path must be "/*").
    web_accessible_resources: [
      {
        resources: ["icons/icon-48.png"],
        matches: [...new Set(matches.map((p) => p.replace(/^(\w+:\/\/[^/]+)\/.*$/, "$1/*")))],
      },
    ],
    options_ui: { page: "options.html", open_in_tab: true },
  };
  if (target === "firefox")
    m.browser_specific_settings = {
      gecko: {
        id: "glowr@gitbugr.github.io",
        // Unprefixed HTMLMediaElement.captureStream()
        strict_min_version: "149.0",
        data_collection_permissions: {
          // Subtitle text is sent to Google Translate for the card's translation.
          required: ["websiteContent"],
        },
      },
    };
  else m.minimum_chrome_version = "120";
  return m;
}
