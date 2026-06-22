import { describe, expect, it } from "vitest";
import { canonicalizeUrl, normalizeTitle, titleHash, urlHash } from "@/lib/fetcher/dedup";

describe("canonicalizeUrl", () => {
  it("strips utm tracking params", () => {
    expect(canonicalizeUrl("https://Example.com/a?utm_source=x&id=1")).toBe(
      "https://example.com/a?id=1"
    );
  });

  it("lowercases scheme and host", () => {
    expect(canonicalizeUrl("HTTPS://Example.COM/Path")).toBe("https://example.com/Path");
  });

  it("strips trailing slash but keeps root", () => {
    expect(canonicalizeUrl("https://example.com/foo/")).toBe("https://example.com/foo");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("strips fragment", () => {
    expect(canonicalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("returns input on bad URL", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation/whitespace", () => {
    expect(normalizeTitle("  Hello,   World!! ")).toBe("hello world");
  });

  it("normalizes smart quotes", () => {
    expect(normalizeTitle("\u201CHi\u201D")).toBe("hi");
  });
});

describe("hashes are stable", () => {
  it("urlHash same after canonicalization", () => {
    expect(urlHash("https://Example.com/a?utm_source=x")).toBe(urlHash("https://example.com/a"));
  });

  it("titleHash ignores case and trailing punctuation", () => {
    expect(titleHash("Foo Bar!")).toBe(titleHash("foo  bar"));
  });
});
