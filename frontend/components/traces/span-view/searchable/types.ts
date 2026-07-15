export interface SearchableSource {
  readonly id: string;
  readonly messageIndex: number;
  readonly contentPartIndex: number;
  apply(term: string): number;
  goTo(localIndex: number): void;
  clearActive(): void;
  destroy(): void;
}
