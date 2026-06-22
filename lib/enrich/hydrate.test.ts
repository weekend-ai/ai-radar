import { describe, expect, it } from "vitest";
import { extractFromHtml, looksLikeSlugTitle } from "@/lib/enrich/hydrate";

describe("extractFromHtml", () => {
  it("prefers og:title over <title>", () => {
    const html = `<html><head>
      <title>The Page \\ Anthropic</title>
      <meta property="og:title" content="3.5 models and computer use">
    </head><body><p>Some really long paragraph that has at least forty characters in it for sure.</p></body></html>`;
    const { title } = extractFromHtml(html);
    expect(title).toBe("3.5 models and computer use");
  });

  it("strips site-suffix from <title> fallback", () => {
    const html = `<html><head><title>Activating ASL3 Protections \\ Anthropic</title></head><body></body></html>`;
    const { title } = extractFromHtml(html);
    expect(title).toBe("Activating ASL3 Protections");
  });

  it("decodes HTML entities in titles", () => {
    const html = `<html><head><meta property="og:title" content="GPT-4 &amp; friends"></head><body></body></html>`;
    expect(extractFromHtml(html).title).toBe("GPT-4 & friends");
  });

  it("extracts content from og:description + <p> tags", () => {
    const html = `<html><head>
      <meta property="og:description" content="A short summary of the news.">
    </head><body>
      <p>This is a long paragraph with more than forty characters of actual content here.</p>
      <p>nav</p>
      <p>Another paragraph also with more than forty characters of real interesting content.</p>
    </body></html>`;
    const { content } = extractFromHtml(html);
    expect(content).toContain("A short summary of the news.");
    expect(content).toContain("long paragraph with more than forty");
    expect(content).toContain("Another paragraph also with");
    expect(content).not.toContain("nav"); // too short, filtered
  });

  it("returns null content when there's no usable body", () => {
    const html = `<html><head><title>Hi</title></head><body></body></html>`;
    expect(extractFromHtml(html).content).toBeNull();
  });

  it("caps content at ~4000 chars", () => {
    const para = "<p>" + "x".repeat(500) + "</p>";
    const html = `<html><body>${para.repeat(20)}</body></html>`;
    const { content } = extractFromHtml(html);
    expect(content!.length).toBeLessThanOrEqual(4000);
  });
});

describe("looksLikeSlugTitle", () => {
  it("recognises slug-derived titles", () => {
    expect(looksLikeSlugTitle("3 5 Models And Computer Use")).toBe(true);
    expect(looksLikeSlugTitle("Seoul Office Partnerships Korean Ai Ecosystem")).toBe(true);
    expect(looksLikeSlugTitle("Activating Asl3 Protections")).toBe(true);
  });

  it("rejects real titles", () => {
    expect(looksLikeSlugTitle("Claude 3.5 Sonnet: Frontier intelligence")).toBe(false);
    expect(looksLikeSlugTitle("Why we built Claude Code")).toBe(false);
    expect(looksLikeSlugTitle("What is RAG?")).toBe(false);
    expect(looksLikeSlugTitle("OpenAI's new model")).toBe(false);
  });

  it("rejects too-short or too-long titles", () => {
    expect(looksLikeSlugTitle("Hi")).toBe(false);
    expect(looksLikeSlugTitle("X".repeat(200))).toBe(false);
  });
});
