export interface SearchableSource {
  readonly id: string;
  /** Where the source renders; sources are ordered by it. */
  readonly element?: Element;
  /** Highlights `term`'s matches; returns how many there are. */
  apply(term: string): number;
  /** Makes match `localIndex` of the applied term the current one and, unless `scroll` is false, scrolls to it. */
  goTo(localIndex: number, scroll?: boolean): void;
  clearActive(): void;
  destroy(): void;
}
