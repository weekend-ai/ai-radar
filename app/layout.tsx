import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Radar",
  description: "AI intelligence radar & newsletter generator",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/topics", label: "Topics" },
  { href: "/drafts", label: "Drafts" },
  { href: "/sources", label: "Sources" },
  { href: "/jobs", label: "Jobs" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-border bg-surface">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                AI Radar <span className="text-muted">/ MVP</span>
              </Link>
              <nav className="flex gap-6 text-sm text-muted">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href as never} className="hover:text-text">
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
