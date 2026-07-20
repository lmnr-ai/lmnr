/** Cartesian product of a variants map, capped at `cap` combinations. */
export function cartesian(
  variants: Record<string, string[]>,
  cap: number
): { combos: Record<string, string>[]; capped: boolean; total: number } {
  const keys = Object.keys(variants);
  let combos: Record<string, string>[] = [{}];

  for (const key of keys) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of variants[key]) {
        next.push({ ...combo, [key]: value });
      }
    }
    combos = next;
  }

  const total = combos.length;
  const capped = total > cap;
  return { combos: capped ? combos.slice(0, cap) : combos, capped, total };
}

/** Initial control state: first option for each variant key. */
export function initialSelection(variants: Record<string, string[]>): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const key of Object.keys(variants)) {
    selection[key] = variants[key][0];
  }
  return selection;
}
