"use client";

import Footer from ".";
import PatternGrid from "./pattern-grid";

const GridFooter = () => (
  <footer className="relative w-full overflow-hidden" aria-label="Laminar footer">
    <div className="overflow-hidden bg-surface-350">
      <Footer contentPaddingBottom={80} />
    </div>
    <div className="relative w-full overflow-hidden">
      <PatternGrid backgroundColor="var(--color-surface-350)" revealDuration={1.5} rowBias={0.6} rowCount={15} />
    </div>
  </footer>
);

export default GridFooter;
