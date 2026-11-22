// Zips dist/<target> into web-ext-artifacts/ for store upload.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
for (const t of ["firefox", "chrome"]) {
  execFileSync(
    "npx",
    [
      "web-ext", "build",
      "--source-dir", `dist/${t}`,
      "--artifacts-dir", "web-ext-artifacts",
      "--filename", `glowr-${version}-${t}.zip`,
      "--overwrite-dest",
    ],
    { stdio: "inherit" },
  );
}

// AMO asks for the source of bundled add-ons; ship it alongside.
try {
  execFileSync("git", [
    "archive", "--format", "zip",
    "-o", `web-ext-artifacts/glowr-${version}-source.zip`, "HEAD",
  ]);
  console.log(`Source archive: web-ext-artifacts/glowr-${version}-source.zip (from HEAD)`);
} catch {
  console.warn("Skipped the source archive (needs a git commit).");
}
