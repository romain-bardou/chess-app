/** Taux de réussite, ou `null` si la carte/le thème n'a jamais été tenté. */
export function accuracy(correct: number, incorrect: number): number | null {
  const attempts = correct + incorrect;
  return attempts === 0 ? null : correct / attempts;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}
