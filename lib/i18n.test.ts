import { describe, expect, it } from "vitest";
import { isLang, pickBilingual, STRINGS, t } from "./i18n";

describe("isLang", () => {
  it("accepts 'en' and 'zh' only", () => {
    expect(isLang("en")).toBe(true);
    expect(isLang("zh")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(isLang(null)).toBe(false);
    expect(isLang(123)).toBe(false);
  });
});

describe("pickBilingual", () => {
  const row = {
    summaryEn: "english summary",
    summaryZh: "中文摘要",
    summary: "raw fallback",
    titleEn: null as string | null,
    titleZh: "只有中文标题",
    title: null as string | null,
    onlyRawEn: null as string | null,
    onlyRawZh: null as string | null,
    onlyRaw: "raw only",
  };

  it("returns Chinese when lang=zh and zh is present", () => {
    expect(pickBilingual(row, "zh", "summary")).toBe("中文摘要");
  });

  it("falls back to English when lang=zh and zh is missing", () => {
    expect(pickBilingual({ ...row, summaryZh: null }, "zh", "summary")).toBe(
      "english summary"
    );
  });

  it("uses titleZh when lang=zh and titleEn is null", () => {
    expect(pickBilingual(row, "zh", "title")).toBe("只有中文标题");
  });

  it("falls back English → Chinese → raw → null", () => {
    expect(pickBilingual(row, "en", "title")).toBe("只有中文标题");
    expect(pickBilingual(row, "en", "onlyRaw")).toBe("raw only");
    expect(
      pickBilingual({ noEn: null, noZh: null, no: null }, "en", "no")
    ).toBe(null);
  });
});

describe("t / STRINGS", () => {
  it("returns English and Chinese for every defined string id", () => {
    for (const id of Object.keys(STRINGS) as Array<keyof typeof STRINGS>) {
      expect(typeof t(id, "en")).toBe("string");
      expect(typeof t(id, "zh")).toBe("string");
      expect(t(id, "en").length).toBeGreaterThan(0);
      expect(t(id, "zh").length).toBeGreaterThan(0);
    }
  });
});
