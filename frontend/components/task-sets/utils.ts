/** A version's label: its number once pushed, "snapshot" for one only a run used. */
export const versionLabel = (number: number | null | undefined): string =>
  number === null || number === undefined ? "snapshot" : `v${number}`;

export const shortHash = (hash: string): string => hash.slice(0, 8);
