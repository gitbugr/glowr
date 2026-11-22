/** An element's shadow root, including closed ones where the browser lets extensions see them. */
export function shadowOf(el: Element): ShadowRoot | null {
  try {
    return (
      el.openOrClosedShadowRoot ??
      (typeof chrome !== "undefined" ? chrome?.dom?.openOrClosedShadowRoot?.(el) : null) ??
      el.shadowRoot ??
      null
    );
  } catch {
    return el.shadowRoot ?? null;
  }
}

/**
 * querySelectorAll that also looks inside shadow roots (iPlayer's player is
 * built from custom elements). Shadow roots are only searched when the
 * light DOM has no match, so sites that don't need it never pay for it.
 */
export class DeepQuery {
  private cache = { at: -Infinity, roots: [] as ShadowRoot[] };

  constructor(private exclude: () => Element | null) {}

  shadowRoots(): ShadowRoot[] {
    const now = performance.now();
    if (now - this.cache.at < 5000) return this.cache.roots;
    const out: ShadowRoot[] = [];
    const skip = this.exclude();
    const scan = (root: ParentNode) => {
      for (const el of root.querySelectorAll("*")) {
        if (el === skip) continue;
        const sr = shadowOf(el);
        if (sr) {
          out.push(sr);
          scan(sr);
        }
      }
    };
    scan(document);
    this.cache = { at: now, roots: out };
    return out;
  }

  all<E extends Element = Element>(sel: string): E[] {
    const found = [...document.querySelectorAll<E>(sel)];
    if (found.length) return found;
    for (const r of this.shadowRoots())
      try {
        found.push(...r.querySelectorAll<E>(sel));
      } catch {
        /* invalid selector inside this root */
      }
    return found;
  }
}

/**
 * Text of an element, descending into shadow roots, with line breaks turned
 * into spaces (IMSC subtitles use <br> and `breakafter` spans).
 */
export function textOf(el: Element): string {
  const sr = shadowOf(el);
  if (!sr && !el.getClientRects().length) return ""; // hidden
  let out = "";
  const walk = (n: Node) => {
    for (const c of n.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += c.nodeValue;
      else if (c instanceof Element) {
        const tag = c.tagName;
        if (tag === "STYLE" || tag === "SCRIPT") continue;
        if (tag === "BR") {
          out += " ";
          continue;
        }
        walk(shadowOf(c) ?? c);
        if (c.hasAttribute("breakafter") || /^(DIV|P|LI)$/.test(tag)) out += " ";
      }
    }
  };
  walk(sr ?? el);
  return out;
}

/** A selector for a subtitle element the user clicked on. */
export function selectorFor(el: Element): string {
  const chain: Element[] = [];
  for (let n: Node | null = el; n && chain.length < 10; ) {
    if (n instanceof Element) chain.push(n);
    n = n.parentNode ?? (n as unknown as ShadowRoot).host ?? null;
    if (n === document) break;
  }
  // Prefer a stable, meaningful ancestor: a subtitle-ish class, else a
  // custom element (e.g. <smp-subtitles>), else the element itself.
  for (const n of chain) {
    const cls = [...n.classList].find((c) => /sub|cue|caption/i.test(c));
    if (cls) return "." + CSS.escape(cls);
  }
  const custom = chain.find((n) => n.tagName.includes("-"));
  if (custom) return custom.tagName.toLowerCase();
  const cls = el.classList[0];
  return el.tagName.toLowerCase() + (cls ? "." + CSS.escape(cls) : "");
}
