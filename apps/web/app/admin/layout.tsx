import Link from "next/link";
import styles from "./layout.module.css";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin/review", label: "Review queue" },
  { href: "/admin/rejected", label: "Rejected" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/crawls", label: "Crawls" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <Link href="/" className={styles.wordmark}>
              Search Experience
            </Link>
            <span className={styles.badge}>admin</span>
          </div>
          <Link href="/" className={styles.exit}>
            ← site
          </Link>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.tabs}>
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={styles.tab}>
              {t.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
