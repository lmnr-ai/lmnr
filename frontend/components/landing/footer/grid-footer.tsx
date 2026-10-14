"use client";

import Footer from ".";
import PatternGrid from "./pattern-grid";

const GridFooter = () => (
  <footer className="relative w-full overflow-hidden" aria-label="Laminar footer">
    <div className="overflow-hidden bg-surface-150">
      <Footer contentPaddingBottom={80} />
    </div>
    <div className="relative w-full overflow-hidden">
      <PatternGrid backgroundColor="var(--color-surface-150)" revealDuration={1.5} rowBias={1} rowCount={15} />
    </div>
  </footer>
);

export default GridFooter;
