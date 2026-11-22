// Lucide icons (ISC licence), rendered to inline SVG strings.
import {
  Captions,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Crosshair,
  Highlighter,
  Languages,
  LoaderCircle,
  Mic,
  MicOff,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Square,
  TriangleAlert,
  X,
} from "lucide";

type IconNode = [tag: string, attrs: Record<string, string | number | undefined>][];

const ICONS = {
  captions: Captions,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "circle-check": CircleCheck,
  crosshair: Crosshair,
  highlighter: Highlighter,
  languages: Languages,
  loader: LoaderCircle,
  mic: Mic,
  "mic-off": MicOff,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  replay: RotateCcw,
  settings: Settings,
  stop: Square,
  warning: TriangleAlert,
  x: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const attrs = (a: Record<string, string | number | undefined>) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

const cache = new Map<IconName, string>();

export function icon(name: IconName, cls = ""): string {
  let body = cache.get(name);
  if (!body) {
    body = ICONS[name].map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
    cache.set(name, body);
  }
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** The icon as a DOM node (for pages that avoid innerHTML). */
export function iconEl(name: IconName, cls = ""): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  const base: Record<string, string> = {
    class: `ic ${cls}`.trim(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  };
  for (const [k, v] of Object.entries(base)) svg.setAttribute(k, v);
  for (const [tag, a] of ICONS[name]) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) if (v !== undefined) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}
