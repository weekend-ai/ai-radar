import type { NewSource } from "@/lib/db/schema";

/**
 * Seed sources — Tier 1-4 from the MVP plan §6.
 * IDs are human-readable slugs (TEXT primary key by design).
 * Weights inform article scoring (see §7.6).
 */
export const seedSources: NewSource[] = [
  // ─── Tier 1: official high-signal sources ─────────────────
  {
    id: "openai-blog",
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss.xml",
    type: "rss",
    category: "models",
    tier: 1,
    priority: "high",
    weight: 30,
    refreshIntervalMinutes: 60,
    description: "Official OpenAI announcements, research, and product updates.",
    tags: ["official", "model-provider"],
  },
  {
    id: "anthropic-news",
    name: "Anthropic News",
    // NOTE: as of 2026-06 Anthropic does not publish a public RSS feed.
    // Tracked as TODO — likely needs an HTML scraper adapter (Day 1.5+).
    // Disabled by default so we don't spam fetch errors.
    url: "https://www.anthropic.com/news",
    type: "html",
    category: "models",
    tier: 1,
    enabled: false,
    priority: "high",
    weight: 30,
    refreshIntervalMinutes: 60,
    description: "Official Anthropic announcements, Claude updates, research. RSS unavailable — needs scraper.",
    tags: ["official", "model-provider", "needs-scraper"],
  },
  {
    id: "google-ai-blog",
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    type: "rss",
    category: "models",
    tier: 1,
    priority: "high",
    weight: 25,
    refreshIntervalMinutes: 60,
    description: "Google's AI research and product blog.",
    tags: ["official", "model-provider"],
  },
  {
    id: "huggingface-blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    type: "rss",
    category: "infra",
    tier: 1,
    priority: "high",
    weight: 20,
    refreshIntervalMinutes: 90,
    description: "Open-source models, datasets, and ML engineering posts.",
    tags: ["official", "open-source"],
  },

  // ─── Tier 2: industry analysis & media ────────────────────
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    type: "rss",
    category: "media",
    tier: 2,
    priority: "medium",
    weight: 15,
    refreshIntervalMinutes: 120,
    description: "AI startup and industry coverage.",
    tags: ["media"],
  },
  {
    id: "the-verge-ai",
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    type: "rss",
    category: "media",
    tier: 2,
    priority: "medium",
    weight: 15,
    refreshIntervalMinutes: 120,
    description: "Consumer-facing AI product and policy coverage.",
    tags: ["media"],
  },
  {
    id: "mit-tech-review-ai",
    name: "MIT Technology Review — AI",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    type: "rss",
    category: "media",
    tier: 2,
    priority: "medium",
    weight: 15,
    refreshIntervalMinutes: 180,
    description: "In-depth AI analysis and longform reporting.",
    tags: ["media", "analysis"],
  },

  // ─── Tier 3: community & trend signals ────────────────────
  {
    id: "reddit-claudecode",
    name: "Reddit r/ClaudeCode",
    url: "https://www.reddit.com/r/ClaudeCode/.rss",
    type: "rss",
    category: "community",
    tier: 3,
    priority: "medium",
    weight: 12,
    refreshIntervalMinutes: 90,
    description: "Real-world Claude Code usage, gripes, tips.",
    tags: ["community", "coding-agent"],
  },
  {
    id: "steve-yegge-blog",
    name: "Steve Yegge — Stevey's Blog Rants",
    url: "https://steve-yegge.blogspot.com/feeds/posts/default",
    type: "rss",
    category: "community",
    tier: 3,
    priority: "low",
    weight: 10,
    refreshIntervalMinutes: 360,
    description: "Long-form essays on coding agents and dev tools.",
    tags: ["community", "essay"],
  },

  // ─── Tier 4: research (arXiv) — kept separate ─────────────
  // arXiv RSS endpoints sometimes return Atom 2.0 with no items via rss-parser
  // when subjectAlternateName etc. are missing. The MVP currently disables them;
  // we'll add a dedicated arXiv adapter in Day 4+.
  {
    id: "arxiv-cs-ai",
    name: "arXiv cs.AI",
    url: "http://export.arxiv.org/rss/cs.AI",
    type: "rss",
    category: "research",
    tier: 4,
    enabled: false,
    priority: "low",
    weight: 5,
    refreshIntervalMinutes: 720,
    description: "arXiv Computer Science — Artificial Intelligence. Needs custom adapter.",
    tags: ["research", "arxiv", "needs-adapter"],
  },
  {
    id: "arxiv-cs-lg",
    name: "arXiv cs.LG",
    url: "http://export.arxiv.org/rss/cs.LG",
    type: "rss",
    category: "research",
    tier: 4,
    enabled: false,
    priority: "low",
    weight: 5,
    refreshIntervalMinutes: 720,
    description: "arXiv Computer Science — Machine Learning. Needs custom adapter.",
    tags: ["research", "arxiv", "needs-adapter"],
  },
];
