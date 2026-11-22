// Generates the demo programme used for screenshots: an abstract animated
// background with Welsh sentences spoken by espeak-ng, plus their timings.
// Needs ffmpeg and espeak-ng on PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "demo");
mkdirSync(out, { recursive: true });

export const SENTENCES = [
  "Bore da, a chroeso i'r rhaglen.",
  "Heddiw, rydyn ni'n mynd i'r mynyddoedd.",
  "Mae'r tywydd yn braf iawn y bore 'ma.",
  "Edrychwch ar yr afon yn y dyffryn.",
  "Dw i wrth fy modd yn cerdded yma.",
  "Beth am baned o de cyn mynd ymlaen?",
  "Mae'r llwybr yn serth, ond mae'r olygfa'n werth chweil.",
  "Diolch am wylio, a hwyl fawr!",
];
const SR = 48000;
const GAP = 0.9;
const LEAD = 1.2;

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });
const probeDur = (f) =>
  parseFloat(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])
      .toString()
      .trim(),
  );

const cues = [];
const parts = [];
let t = LEAD;
SENTENCES.forEach((s, i) => {
  const wav = join(out, `s${i}.wav`);
  run("espeak-ng", ["-v", "cy", "-s", "135", "-p", "45", "-w", wav, s]);
  const d = probeDur(wav);
  cues.push({ start: +t.toFixed(3), end: +(t + d).toFixed(3), text: s });
  parts.push({ wav, at: t });
  t += d + GAP;
});
const total = Math.ceil(t + 1);

// A simple dawn landscape (sky, sun, two ridges), slowly zoomed.
const far = "430+60*sin(X/160)+25*sin(X/53+1)";
const near = "540+30*sin(X/70)+45*sin(X/190+2)";
const sun = "lt(hypot(X-880,Y-360),46)";
const layer = (nearC, farC, sunC, sky) =>
  `if(gt(Y,${near}),${nearC},if(gt(Y,${far}),${farC},if(${sun},${sunC},${sky})))`;
const still = join(out, "scene.png");
run("ffmpeg", [
  "-v", "error", "-y", "-f", "lavfi", "-i", "color=s=1280x720:d=1",
  "-vf",
  "format=rgb24,geq=" +
    `r='${layer(16, 46, 255, "246-0.19*Y")}':` +
    `g='${layer(28, 66, 236, "178-0.06*Y")}':` +
    `b='${layer(40, 96, 196, "150+0.1*Y")}'`,
  "-frames:v", "1", still,
]);

// Mix sentences at their offsets into one track.
const inputs = parts.flatMap((p) => ["-i", p.wav]);
const delays = parts
  .map((p, i) => `[${i}:a]aresample=${SR},adelay=${Math.round(p.at * 1000)}:all=1[a${i}]`)
  .join(";");
const mix = `${parts.map((_, i) => `[a${i}]`).join("")}amix=inputs=${parts.length}:normalize=0,apad=whole_dur=${total}[aout]`;
run("ffmpeg", [
  "-v", "error", "-y",
  ...inputs,
  "-loop", "1", "-framerate", "25", "-t", String(total), "-i", still,
  "-filter_complex",
  `${delays};${mix};[${parts.length}:v]scale=2560:-1,zoompan=z='1+0.0004*on':d=1:s=1280x720:fps=25[vout]`,
  "-map", "[vout]", "-map", "[aout]",
  "-pix_fmt", "yuv420p", "-c:v", "libvpx", "-b:v", "900k", "-c:a", "libvorbis", "-q:a", "6",
  "-t", String(total),
  join(out, "demo.webm"),
]);
writeFileSync(join(out, "cues.json"), JSON.stringify(cues, null, 1));
console.log(`demo.webm (${total}s, ${cues.length} lines)`);
if (process.argv.includes("--print")) console.log(readFileSync(join(out, "cues.json"), "utf8"));
