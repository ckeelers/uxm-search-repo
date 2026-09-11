import styles from "./loading.module.css";

/**
 * Scoped to the admin route group: the header + tab bar in admin/layout.tsx
 * stay mounted, and only this content area swaps in while the next tab's
 * data loads.
 */
export default function AdminLoading() {
  return (
    <div className={styles.wrap}>
      <span className={styles.spinner} aria-hidden />
      Loading…
    </div>
  );
}
