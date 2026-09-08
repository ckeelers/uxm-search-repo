import Link from "next/link";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin/review", label: "Review queue" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/crawls", label: "Crawls" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between border-b border-neutral-200 pb-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">admin</span>
          <nav className="flex gap-3 text-sm">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className="text-neutral-600 hover:underline">
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← site
        </Link>
      </header>
      {children}
    </div>
  );
}
