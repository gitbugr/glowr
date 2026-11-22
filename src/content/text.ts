const ELLIPSIS_START = /^(\.{2,}|…)\s*/;
const ELLIPSIS_END = /\s*(\.{2,}|…)$/;

/** Plain, single-spaced subtitle text without continuation ellipses. */
export const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ELLIPSIS_START, "")
    .replace(ELLIPSIS_END, "")
    .trim();

/** Comparison key: lowercase letters and digits only. */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export const words = (s: string) => s.split(" ").filter(Boolean);

/** m:ss or h:mm:ss */
export function fmtTime(t: number): string {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = Math.floor(t % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

/** m:ss.cc */
export const fmtPrecise = (t: number) =>
  `${fmtTime(t)}.${String(Math.floor((t % 1) * 100)).padStart(2, "0")}`;

export const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
