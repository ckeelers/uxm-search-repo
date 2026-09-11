import Link from "next/link";
import styles from "./site-header.module.css";

function Bookmark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={styles.icon} aria-hidden>
      <path
        d="M4 2.5h8v11l-4-2.5-4 2.5v-11z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Thin white top bar: serif wordmark left, Saved + Admin right. */
export function SiteHeader({ savedCount }: { savedCount?: number }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.wordmark}>
          Search Experience
        </Link>
        <nav className={styles.nav}>
          <Link href="/saved" className={styles.pill}>
            <Bookmark />
            Saved{savedCount ? ` (${savedCount})` : ""}
          </Link>
          {/* prefetch=false: /admin is Basic-Auth protected — prefetching it
              would fire the browser's login prompt just from this link being
              on the page, before the user has clicked it. */}
          <Link href="/admin" prefetch={false} className={styles.pill}>
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
