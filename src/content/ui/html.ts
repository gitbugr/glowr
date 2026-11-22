import { APP_SLUG } from "../../shared/config";

// YouTube enforces Trusted Types; all our markup goes through this policy.
let policy: { createHTML(s: string): unknown } | null = null;
try {
  policy =
    (window as unknown as {
      trustedTypes?: { createPolicy(n: string, p: { createHTML(s: string): string }): typeof policy };
    }).trustedTypes?.createPolicy(APP_SLUG, { createHTML: (s) => s }) ?? null;
} catch {
  /* policy name already taken or creation blocked */
}

export function setHTML(el: Element | ShadowRoot, html: string) {
  (el as { innerHTML: unknown }).innerHTML = policy ? policy.createHTML(html) : html;
}

export function h<E extends Element = HTMLElement>(html: string): E {
  const t = document.createElement("div");
  setHTML(t, html.trim());
  return t.firstElementChild as E;
}
