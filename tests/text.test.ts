import { describe, expect, it } from "vitest";
import { clean, escapeHTML, fmtPrecise, fmtTime, norm } from "../src/content/text";

describe("clean", () => {
  it("strips tags, collapses whitespace and continuation ellipses", () => {
    expect(clean("  <i>…Dw i'n</i>\n  mynd ...  ")).toBe("Dw i'n mynd");
  });
});

describe("norm", () => {
  it("keeps letters (including Welsh accents) and digits only", () => {
    expect(norm("Ŵyt ti'n siŵr? 100%")).toBe("ŵytti'nsiŵr100".replace("'", ""));
  });
});

describe("time formatting", () => {
  it("formats minutes and hours", () => {
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(3725)).toBe("1:02:05");
    expect(fmtPrecise(3.456)).toBe("0:03.45");
  });
});

it("escapes HTML", () => {
  expect(escapeHTML(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});
