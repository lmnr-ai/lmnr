export interface SearchableSource {
  readonly id: string;
  readonly messageIndex: number;
  readonly contentPartIndex: number;
  /** Where the source renders, for ordering sources within one message. */
  readonly element?: Element;
  /** Highlights `term`'s matches; returns how many there are. */
  apply(term: string): number;
  /** Makes match `localIndex` of the applied term the current one and, unless `scroll` is false, scrolls to it. */
  goTo(localIndex: number, scroll?: boolean): void;
  clearActive(): void;
  destroy(): void;
}
