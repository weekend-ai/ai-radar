import type { Metadata } from "next";
import Link from "next/link";
import { LangToggle } from "@/components/lang-toggle";
import { t } from "@/lib/i18n";
import { resolveLangFromCookie } from "@/lib/i18n.server";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Radar",
  description: "AI intelligence radar & newsletter generator",
};

// Layout reads lang from cookie only (no searchParams here; that's per-page).
// On the very first navigation after a cookie write, the URL ?lang= and the
// cookie agree because the toggle writes both.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = await resolveLangFromCookie();
  const nav = [
    { href: "/", label: t("nav.dashboard", lang) },
    { href: "/inbox", label: t("nav.inbox", lang) },
    { href: "/topics", label: t("nav.topics", lang) },
    { href: "/drafts", label: t("nav.drafts", lang) },
    { href: "/sources", label: t("nav.sources", lang) },
    { href: "/jobs", label: t("nav.jobs", lang) },
  ];

  return (
    <html lang={lang === "zh" ? "zh-CN" : "en"}>
      <body>
        <div className="min-h-screen">
          <header className="border-b border-border bg-surface">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                AI Radar <span className="text-muted">/ MVP</span>
              </Link>
              <nav className="flex items-center gap-6 text-sm text-muted">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href as never} className="hover:text-text">
                    {n.label}
                  </Link>
                ))}
                <LangToggle current={lang} />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
