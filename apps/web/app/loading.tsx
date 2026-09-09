import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <div className={styles.barInner}>
          <div className={styles.wordmarkSkel} />
          <div className={styles.navSkel} />
        </div>
      </div>
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.eyebrowSkel} />
          <div className={styles.titleSkel} />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.columns}>
          <div className={styles.sidebarSkel} />
          <div className={styles.resultsSkel}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.cardSkel} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
