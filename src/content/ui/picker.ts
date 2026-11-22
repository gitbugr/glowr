import { icon } from "../../shared/icons";
import type { App } from "../app";
import { selectorFor } from "../dom";
import { setHTML } from "./html";

/** Let the user click the on-screen subtitles to learn their selector. */
export function startPicker(app: App) {
  const { panel } = app;
  if (panel.picking) return;
  panel.picking = true;
  const box = document.createElement("div");
  box.className = "pick-box";
  box.hidden = true;
  const tip = document.createElement("div");
  tip.className = "pick-tip";
  setHTML(tip, `${icon("crosshair")}<span>Click the subtitle text on the video · <kbd>Esc</kbd> to cancel</span>`);
  panel.root.append(box, tip);
  let raf = 0;

  // Geometry-based, so it works even when subtitle layers have
  // pointer-events: none or live in shadow roots.
  const textElAt = (x: number, y: number): Element | null => {
    let best: Element | null = null,
      bestArea = Infinity;
    for (const r of [document, ...app.query.shadowRoots()])
      for (const el of r.querySelectorAll("*")) {
        if (el === panel.host || /^(SCRIPT|STYLE|VIDEO)$/.test(el.tagName)) continue;
        if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.nodeValue?.trim()))
          continue;
        const b = el.getBoundingClientRect();
        const area = b.width * b.height;
        if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom && area < bestArea) {
          best = el;
          bestArea = area;
        }
      }
    return best;
  };

  const ours = (e: Event) => panel.host != null && e.composedPath().includes(panel.host);
  const move = (e: PointerEvent) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const el = textElAt(e.clientX, e.clientY);
      box.hidden = !el;
      if (!el) return;
      const b = el.getBoundingClientRect();
      Object.assign(box.style, {
        left: b.left - 3 + "px",
        top: b.top - 3 + "px",
        width: b.width + 6 + "px",
        height: b.height + 6 + "px",
      });
    });
  };
  const block = (e: Event) => {
    if (ours(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const click = (e: MouseEvent) => {
    if (ours(e)) return;
    block(e);
    const el = textElAt(e.clientX, e.clientY);
    done();
    if (!el)
      return panel.toast("No text there. Try again while a subtitle is showing.", "err", 4000);
    if (!app.site) return panel.toast("This site isn't supported.", "err");
    const sel = selectorFor(el);
    app.setSelector(sel);
    panel.toast(`Subtitles found: ${sel}`);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    block(e);
    done();
  };
  const blocked = ["pointerdown", "mousedown", "pointerup", "mouseup"] as const;
  const done = () => {
    panel.picking = false;
    cancelAnimationFrame(raf);
    box.remove();
    tip.remove();
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("click", click, true);
    window.removeEventListener("keydown", key, true);
    for (const ev of blocked) window.removeEventListener(ev, block, true);
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("click", click, true);
  window.addEventListener("keydown", key, true);
  for (const ev of blocked) window.addEventListener(ev, block, true);
}
