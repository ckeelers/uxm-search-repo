/** Two-letter monogram for a company avatar. Deterministic, decorative. */
export function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  const s =
    words.length >= 2
      ? words[0]![0]! + words[1]![0]!
      : (words[0] ?? name).slice(0, 2);
  return s.toUpperCase();
}
