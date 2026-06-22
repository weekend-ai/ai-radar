import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ai_radar:ai_radar@localhost:5433/ai_radar",
  },
  verbose: true,
  strict: true,
} satisfies Config;
