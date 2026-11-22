// Usage: node scripts/build.mjs --target firefox|chrome|all [--watch]
import * as esbuild from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifest } from "./manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const watch = args.includes("--watch");
const which = arg("--target", "all");
const targets = which === "all" ? ["firefox", "chrome"] : [which];
if (!targets.every((t) => t === "firefox" || t === "chrome")) {
  console.error(`Unknown target "${which}". Use firefox, chrome or all.`);
  process.exit(1);
}

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const repoUrl = (pkg.repository?.url ?? "").replace(/^git\+/, "").replace(/\.git$/, "");

// The manifest needs a few constants from the TypeScript config.
const cfgSrc = await esbuild.build({
  entryPoints: [join(root, "src/shared/config.ts")],
  bundle: true,
  format: "esm",
  write: false,
  define: { __REPO_URL__: JSON.stringify(repoUrl) },
});
const cfg = await import(
  "data:text/javascript;base64," + Buffer.from(cfgSrc.outputFiles[0].text).toString("base64")
);

async function copyStatic(out) {
  await cp(join(root, "public"), out, { recursive: true });
  await cp(join(root, "src/options/options.html"), join(out, "options.html"));
  await mkdir(join(out, "vendor"), { recursive: true });
  await cp(join(root, "node_modules/lamejs/lame.min.js"), join(out, "vendor/lame.min.js"));
  await cp(join(root, "node_modules/lamejs/LICENSE"), join(out, "vendor/lamejs-LICENSE.txt"));
  await cp(join(root, "LICENSE"), join(out, "LICENSE.txt"));
  await cp(join(root, "THIRD_PARTY_NOTICES.md"), join(out, "THIRD_PARTY_NOTICES.md"));
  const m = manifest(target(out), {
    version: pkg.version,
    description: pkg.description,
    appName: cfg.APP_NAME,
    matches: cfg.MATCHES,
  });
  await writeFile(join(out, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
}
const target = (out) => (out.endsWith("firefox") ? "firefox" : "chrome");

for (const t of targets) {
  const out = join(root, "dist", t);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await copyStatic(out);
  const opts = {
    entryPoints: {
      background: join(root, "src/background/index.ts"),
      content: join(root, "src/content/index.ts"),
      options: join(root, "src/options/options.ts"),
    },
    outdir: out,
    bundle: true,
    format: "iife",
    target: t === "firefox" ? "firefox149" : "chrome120",
    sourcemap: watch ? "inline" : false,
    minify: false, // readable code makes store review (and debugging) easier
    legalComments: "inline",
    define: { __REPO_URL__: JSON.stringify(repoUrl) },
    logLevel: "info",
  };
  if (watch) {
    const ctx = await esbuild.context({
      ...opts,
      plugins: [
        {
          name: "static",
          setup(b) {
            b.onEnd(() => copyStatic(out).catch((e) => console.error(e)));
          },
        },
      ],
    });
    await ctx.watch();
    console.log(`Watching ${t} → dist/${t}`);
  } else {
    await esbuild.build(opts);
    console.log(`Built dist/${t}`);
  }
}
