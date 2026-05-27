const CubesIllustration = ({ className }: { className?: string }) => (
  <div className={`cubes-illustration ${className ?? ""}`}>
    <style>{`
      /* Lights = orange beam + diamond. Slow glow up. */
      .cubes-illustration .lights {
        opacity: 0;
        animation: cubes-light-on 2.4s ease-out forwards;
      }
      /* Ground grid = column surface + gray lattice + fade overlays. Fades
         in on the same slow curve as the lights so the floor reveals as
         the lamp turns on. */
      .cubes-illustration .grid {
        opacity: 0;
        animation: cubes-light-on 2.4s ease-out forwards;
      }
      /* Colored cubes (yellow/purple/cyan) — fast snap-in, top-first wave. */
      .cubes-illustration .colored-cube {
        opacity: 0;
        transform: translateY(20px);
        animation: colored-cube-rise 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes cubes-light-on {
        to { opacity: 1; }
      }
      @keyframes colored-cube-rise {
        to { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .cubes-illustration .lights,
        .cubes-illustration .grid,
        .cubes-illustration .colored-cube {
          animation: none;
          opacity: 1;
          transform: none;
        }
      }
    `}</style>
    <svg width="281" height="778" viewBox="0 0 281 778" fill="none" aria-hidden="true" className="block w-full h-auto">
      <g clipPath="url(#clip0_4200_55240)">
        <rect width="778" height="281" transform="matrix(0 -1 -1 0 281 778)" fill="#1B1B1C" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 287)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 300)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 313)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 326)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 339)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 352)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 365)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 378)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 300)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 313)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 326)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 339)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 352)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 365)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 378)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 391)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 404)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 313)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 326)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 339)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 352)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.039 365)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 378)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 391)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 404)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 417)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 430)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 326)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 339)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 352)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 365)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.523 378)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.039 391)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 404)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 417)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 430)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 443)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 456)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 339)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 352)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9609 365)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.477 378)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 391)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 404)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 417)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 430)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.062 443)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.578 456)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.094 469)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.609 482)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 352)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 365)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 378)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9609 391)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 404)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 417)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 430)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 443)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 456)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.062 469)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.578 482)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.094 495)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 508)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 365)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 378)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 391)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 404)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 417)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 430)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 443)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 456)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 469)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 482)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.062 495)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.578 508)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 521)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 534)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 378)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 391)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 404)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 417)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 430)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 443)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 456)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 469)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 482)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 495)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 508)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.062 521)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 534)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 547)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 560)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 404)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 417)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 430)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9375 443)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 456)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 469)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 482)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 495)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 508)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 521)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 534)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 547)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 560)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 573)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 586)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 430)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 443)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4219 456)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9375 469)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 482)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 495)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 508)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 521)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 534)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 547)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 560)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 573)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 586)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 599)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 612)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 456)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.90625 469)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4219 482)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9375 495)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 508)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 521)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 534)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 547)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 560)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.039 573)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 586)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 599)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 612)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 625)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 638)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6094 482)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.90625 495)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4219 508)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9375 521)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 534)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 547)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 560)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 573)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.523 586)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.039 599)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 612)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 625)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 638)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 651)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 664)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 508)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 521)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 534)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 547)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 560)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9609 573)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.477 586)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 599)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 612)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 625)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 638)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.062 651)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.578 664)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.094 677)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 690)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 534)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 547)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 560)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 573)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 586)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9609 599)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 612)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 625)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 638)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 651)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 664)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.062 677)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.578 690)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 703)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 716)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 560)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 573)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 586)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 599)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 612)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 625)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 638)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 651)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 664)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 677)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 690)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.062 703)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 716)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 729)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 742)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 586)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 599)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 612)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 625)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 638)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 651)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 664)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 677)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 690)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 703)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.547 716)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 729)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 742)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 275.102 755)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 297.617 768)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 612)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 625)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 638)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9375 651)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 664)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 677)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 690)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 703)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 716)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.031 729)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 742)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 230.07 755)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 252.586 768)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 638)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 651)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4219 664)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9375 677)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 690)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 703)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 716)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 729)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.516 742)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 185.039 755)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 207.555 768)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 664)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.90625 677)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4219 690)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9375 703)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4531 716)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9688 729)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.484 742)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 140 755)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 162.523 768)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 690)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 703)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 716)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 729)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 742)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 94.9609 755)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 117.477 768)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 716)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 729)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 742)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 49.9297 755)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 72.4453 768)"
          fill="#252526"
          className="grid"
        />
        <rect width="24" height="24" transform="matrix(0.866025 0.5 -0.866025 0.5 -17.6172 742)" fill="#252526" />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 4.89844 755)"
          fill="#252526"
          className="grid"
        />
        <rect
          width="24"
          height="24"
          transform="matrix(0.866025 0.5 -0.866025 0.5 27.4141 768)"
          fill="#252526"
          className="grid"
        />
        <rect
          x="281"
          y="805"
          width="281"
          height="527"
          transform="rotate(-180 281 805)"
          fill="url(#paint0_linear_4200_55240)"
        />
        <g className="colored-cube" style={{ animationDelay: "0.04s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 170.039 181.367)"
            fill="#E3A008"
            fillOpacity="0.9"
          />
          <g clipPath="url(#clip1_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M177.713 179.468C177.782 179.319 177.919 179.182 178.108 179.073C178.298 178.963 178.534 178.885 178.794 178.844C178.794 178.844 178.794 178.844 178.795 178.844L182.762 178.219C182.763 178.219 182.763 178.219 182.764 178.219C183.023 178.179 183.296 178.179 183.556 178.219C183.815 178.259 184.052 178.338 184.242 178.447L187.129 180.114C187.319 180.224 187.455 180.361 187.524 180.51C187.594 180.66 187.594 180.818 187.524 180.967C187.524 180.968 187.524 180.968 187.524 180.969L186.442 183.259C186.442 183.259 186.442 183.26 186.441 183.26C186.372 183.409 186.235 183.546 186.046 183.655C185.856 183.765 185.619 183.844 185.36 183.884C185.36 183.884 185.36 183.884 185.359 183.884L181.392 184.509C181.391 184.509 181.391 184.509 181.39 184.509C181.131 184.549 180.858 184.549 180.598 184.509C180.339 184.469 180.102 184.391 179.912 184.281L177.025 182.614C176.835 182.504 176.699 182.368 176.629 182.218C176.56 182.068 176.56 181.911 176.63 181.761C176.63 181.76 176.63 181.76 176.63 181.76L177.713 179.468ZM178.83 179.49C178.767 179.526 178.721 179.572 178.698 179.622C178.698 179.622 178.698 179.623 178.697 179.623L177.615 181.914C177.592 181.964 177.592 182.016 177.615 182.066C177.639 182.116 177.684 182.161 177.747 182.198L180.633 183.864C180.697 183.9 180.776 183.927 180.862 183.94C180.948 183.953 181.039 183.953 181.125 183.94C181.125 183.94 181.125 183.94 181.126 183.94L185.093 183.315C185.094 183.315 185.094 183.315 185.095 183.315C185.182 183.302 185.26 183.275 185.324 183.239C185.387 183.202 185.433 183.157 185.456 183.107C185.456 183.106 185.456 183.106 185.457 183.105L186.538 180.815C186.539 180.815 186.539 180.815 186.539 180.814C186.562 180.765 186.562 180.712 186.539 180.663C186.515 180.613 186.47 180.567 186.407 180.531L183.521 178.864C183.457 178.828 183.379 178.802 183.292 178.788C183.206 178.775 183.115 178.775 183.029 178.788C183.029 178.788 183.028 178.788 183.028 178.788L179.061 179.413C179.06 179.413 179.06 179.413 179.059 179.413C178.972 179.427 178.893 179.453 178.83 179.49Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M180.995 180.742C180.397 181.087 180.397 181.647 180.995 181.992C181.593 182.337 182.562 182.337 183.16 181.992C183.758 181.647 183.758 181.087 183.16 180.742C182.562 180.397 181.593 180.397 180.995 180.742ZM180.273 182.409C179.277 181.834 179.277 180.901 180.273 180.326C181.269 179.75 182.885 179.75 183.881 180.326C184.878 180.901 184.878 181.834 183.881 182.409C182.885 182.984 181.269 182.984 180.273 182.409Z"
              fill="white"
            />
          </g>
          <path d="M170.035 195.261V181.364L182.07 188.312V202.209L170.035 195.261Z" fill="#F4B82B" />
          <path d="M182.074 188.309L194.109 181.361V195.258L182.074 202.206V188.309Z" fill="#E8AB1D" />
          <rect
            x="162.633"
            y="208"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 162.633 208)"
            fill="url(#paint1_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.07s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 92.0391 218.367)"
            fill="#E3A008"
            fillOpacity="0.9"
          />
          <g clipPath="url(#clip2_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M99.7125 216.468C99.7822 216.319 99.9187 216.182 100.108 216.073C100.298 215.963 100.534 215.885 100.794 215.844C100.794 215.844 100.794 215.844 100.795 215.844L104.762 215.219C104.763 215.219 104.763 215.219 104.764 215.219C105.023 215.179 105.296 215.179 105.556 215.219C105.815 215.259 106.052 215.338 106.242 215.447L109.129 217.114C109.319 217.224 109.455 217.361 109.524 217.51C109.594 217.66 109.594 217.818 109.524 217.967C109.524 217.968 109.524 217.968 109.524 217.969L108.442 220.259C108.442 220.259 108.442 220.26 108.441 220.26C108.372 220.409 108.235 220.546 108.046 220.655C107.856 220.765 107.619 220.844 107.36 220.884C107.36 220.884 107.36 220.884 107.359 220.884L103.392 221.509C103.391 221.509 103.391 221.509 103.39 221.509C103.131 221.549 102.858 221.549 102.598 221.509C102.339 221.469 102.102 221.391 101.912 221.281L99.0248 219.614C98.8352 219.504 98.6988 219.368 98.6295 219.218C98.5601 219.068 98.5602 218.911 98.6297 218.761C98.6299 218.76 98.6301 218.76 98.6303 218.76L99.7125 216.468ZM100.83 216.49C100.767 216.526 100.721 216.572 100.698 216.622C100.698 216.622 100.698 216.623 100.697 216.623L99.6153 218.914C99.5924 218.964 99.5924 219.016 99.6154 219.066C99.6385 219.116 99.6839 219.161 99.7471 219.198L102.633 220.864C102.697 220.9 102.776 220.927 102.862 220.94C102.948 220.953 103.039 220.953 103.125 220.94C103.125 220.94 103.125 220.94 103.126 220.94L107.093 220.315C107.094 220.315 107.094 220.315 107.095 220.315C107.182 220.302 107.26 220.275 107.324 220.239C107.387 220.202 107.433 220.157 107.456 220.107C107.456 220.106 107.456 220.106 107.457 220.105L108.538 217.815C108.539 217.815 108.539 217.815 108.539 217.814C108.562 217.765 108.562 217.712 108.539 217.663C108.515 217.613 108.47 217.567 108.407 217.531L105.521 215.864C105.457 215.828 105.379 215.802 105.292 215.788C105.206 215.775 105.115 215.775 105.029 215.788C105.029 215.788 105.028 215.788 105.028 215.788L101.061 216.413C101.06 216.413 101.06 216.413 101.059 216.413C100.972 216.427 100.893 216.453 100.83 216.49Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M102.995 217.742C102.397 218.087 102.397 218.647 102.995 218.992C103.593 219.337 104.562 219.337 105.16 218.992C105.758 218.647 105.758 218.087 105.16 217.742C104.562 217.397 103.593 217.397 102.995 217.742ZM102.273 219.409C101.277 218.834 101.277 217.901 102.273 217.326C103.269 216.75 104.885 216.75 105.881 217.326C106.878 217.901 106.878 218.834 105.881 219.409C104.885 219.984 103.269 219.984 102.273 219.409Z"
              fill="white"
            />
          </g>
          <path d="M92.0351 232.261V218.364L104.07 225.312V239.209L92.0351 232.261Z" fill="#F4B82B" />
          <path d="M104.074 225.309L116.109 218.361V232.258L104.074 239.206V225.309Z" fill="#E8AB1D" />
          <rect
            x="84.6328"
            y="245"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 84.6328 245)"
            fill="url(#paint2_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.26s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 145.039 398.367)"
            fill="#E3A008"
            fillOpacity="0.9"
          />
          <g clipPath="url(#clip3_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M152.713 396.468C152.782 396.319 152.919 396.182 153.108 396.073C153.298 395.963 153.534 395.885 153.794 395.844C153.794 395.844 153.794 395.844 153.795 395.844L157.762 395.219C157.763 395.219 157.763 395.219 157.764 395.219C158.023 395.179 158.296 395.179 158.556 395.219C158.815 395.259 159.052 395.338 159.242 395.447L162.129 397.114C162.319 397.224 162.455 397.361 162.524 397.51C162.594 397.66 162.594 397.818 162.524 397.967C162.524 397.968 162.524 397.968 162.524 397.969L161.442 400.259C161.442 400.259 161.442 400.26 161.441 400.26C161.372 400.409 161.235 400.546 161.046 400.655C160.856 400.765 160.619 400.844 160.36 400.884C160.36 400.884 160.36 400.884 160.359 400.884L156.392 401.509C156.391 401.509 156.391 401.509 156.39 401.509C156.131 401.549 155.858 401.549 155.598 401.509C155.339 401.469 155.102 401.391 154.912 401.281L152.025 399.614C151.835 399.504 151.699 399.368 151.629 399.218C151.56 399.068 151.56 398.911 151.63 398.761C151.63 398.76 151.63 398.76 151.63 398.76L152.713 396.468ZM153.83 396.49C153.767 396.526 153.721 396.572 153.698 396.622C153.698 396.622 153.698 396.623 153.697 396.623L152.615 398.914C152.592 398.964 152.592 399.016 152.615 399.066C152.639 399.116 152.684 399.161 152.747 399.198L155.633 400.864C155.697 400.9 155.776 400.927 155.862 400.94C155.948 400.953 156.039 400.953 156.125 400.94C156.125 400.94 156.125 400.94 156.126 400.94L160.093 400.315C160.094 400.315 160.094 400.315 160.095 400.315C160.182 400.302 160.26 400.275 160.324 400.239C160.387 400.202 160.433 400.157 160.456 400.107C160.456 400.106 160.456 400.106 160.457 400.105L161.538 397.815C161.539 397.815 161.539 397.815 161.539 397.814C161.562 397.765 161.562 397.712 161.539 397.663C161.515 397.613 161.47 397.567 161.407 397.531L158.521 395.864C158.457 395.828 158.379 395.802 158.292 395.788C158.206 395.775 158.115 395.775 158.029 395.788C158.029 395.788 158.028 395.788 158.028 395.788L154.061 396.413C154.06 396.413 154.06 396.413 154.059 396.413C153.972 396.427 153.893 396.453 153.83 396.49Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M155.995 397.742C155.397 398.087 155.397 398.647 155.995 398.992C156.593 399.337 157.562 399.337 158.16 398.992C158.758 398.647 158.758 398.087 158.16 397.742C157.562 397.397 156.593 397.397 155.995 397.742ZM155.273 399.409C154.277 398.834 154.277 397.901 155.273 397.326C156.269 396.75 157.885 396.75 158.881 397.326C159.878 397.901 159.878 398.834 158.881 399.409C157.885 399.984 156.269 399.984 155.273 399.409Z"
              fill="white"
            />
          </g>
          <path d="M145.035 412.261V398.364L157.07 405.312V419.209L145.035 412.261Z" fill="#F4B82B" />
          <path d="M157.074 405.309L169.109 398.361V412.258L157.074 419.206V405.309Z" fill="#E8AB1D" />
          <rect
            x="137.633"
            y="425"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 137.633 425)"
            fill="url(#paint3_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.16s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 161.039 303.367)"
            fill="#621ED8"
          />
          <g clipPath="url(#clip4_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M168.031 302.903C168.22 302.21 168.832 301.578 169.756 301.121C170.68 300.665 171.856 300.414 173.073 300.414C174.289 300.414 175.465 300.665 176.39 301.121C177.314 301.578 177.925 302.21 178.114 302.903C178.303 303.597 178.056 304.307 177.418 304.905C176.819 305.467 175.912 305.895 174.845 306.123L173.53 307.661C173.444 307.761 173.267 307.825 173.073 307.825C172.879 307.825 172.701 307.761 172.615 307.661L171.301 306.123C170.233 305.895 169.326 305.467 168.727 304.905C168.09 304.307 167.843 303.597 168.031 302.903ZM170.419 301.569C169.68 301.934 169.191 302.44 169.04 302.995C168.889 303.55 169.086 304.118 169.596 304.596C170.106 305.074 170.896 305.432 171.822 305.604C171.953 305.628 172.062 305.683 172.123 305.754L173.073 306.865L174.022 305.754C174.084 305.683 174.192 305.628 174.324 305.604C175.25 305.432 176.039 305.074 176.549 304.596C177.059 304.118 177.257 303.55 177.106 302.995C176.955 302.44 176.466 301.934 175.726 301.569C174.987 301.204 174.046 301.003 173.073 301.003C172.1 301.003 171.159 301.204 170.419 301.569Z"
              fill="white"
            />
          </g>
          <path d="M161.035 317.261V303.364L173.07 310.312V324.209L161.035 317.261Z" fill="#7D44E2" />
          <path d="M173.074 310.309L185.109 303.361V317.258L173.074 324.206V310.309Z" fill="#7737E4" />
          <rect
            x="153.633"
            y="330"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 153.633 330)"
            fill="url(#paint4_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.11s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 110.039 249.367)"
            fill="#621ED8"
          />
          <g clipPath="url(#clip5_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M117.031 248.903C117.22 248.21 117.832 247.578 118.756 247.121C119.68 246.665 120.856 246.414 122.073 246.414C123.289 246.414 124.465 246.665 125.39 247.121C126.314 247.578 126.925 248.21 127.114 248.903C127.303 249.597 127.056 250.307 126.418 250.905C125.819 251.467 124.912 251.895 123.845 252.123L122.53 253.661C122.444 253.761 122.267 253.825 122.073 253.825C121.879 253.825 121.701 253.761 121.615 253.661L120.301 252.123C119.233 251.895 118.326 251.467 117.727 250.905C117.09 250.307 116.843 249.597 117.031 248.903ZM119.419 247.569C118.68 247.934 118.191 248.44 118.04 248.995C117.889 249.55 118.086 250.118 118.596 250.596C119.106 251.074 119.896 251.432 120.822 251.604C120.953 251.628 121.062 251.683 121.123 251.754L122.073 252.865L123.022 251.754C123.084 251.683 123.192 251.628 123.324 251.604C124.25 251.432 125.039 251.074 125.549 250.596C126.059 250.118 126.257 249.55 126.106 248.995C125.955 248.44 125.466 247.934 124.726 247.569C123.987 247.204 123.046 247.003 122.073 247.003C121.1 247.003 120.159 247.204 119.419 247.569Z"
              fill="white"
            />
          </g>
          <path d="M110.035 263.261V249.364L122.07 256.312V270.209L110.035 263.261Z" fill="#7D44E2" />
          <path d="M122.074 256.309L134.109 249.361V263.258L122.074 270.206V256.309Z" fill="#7737E4" />
          <rect
            x="102.633"
            y="276"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 102.633 276)"
            fill="url(#paint5_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.00s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 128.031 147.375)"
            fill="#0093A7"
          />
          <g clipPath="url(#clip6_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M135.376 146.747C135.177 146.632 135.177 146.446 135.376 146.331L136.82 145.497C137.019 145.382 137.342 145.382 137.542 145.497L138.985 146.331C139.184 146.446 139.184 146.632 138.985 146.747C138.786 146.862 138.463 146.862 138.263 146.747L137.181 146.122L136.098 146.747C135.899 146.862 135.576 146.862 135.376 146.747Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M136.82 148.003C136.621 148.118 136.621 148.304 136.82 148.419L139.707 150.086C139.906 150.201 140.229 150.201 140.428 150.086L144.758 147.586C144.958 147.471 144.958 147.284 144.758 147.169L141.872 145.503C141.672 145.388 141.349 145.388 141.15 145.503L136.82 148.003ZM136.098 148.836C135.5 148.491 135.5 147.931 136.098 147.586L140.428 145.086C141.026 144.741 141.995 144.741 142.593 145.086L145.48 146.753C146.078 147.098 146.078 147.657 145.48 148.003L141.15 150.503C140.552 150.848 139.583 150.848 138.985 150.503L136.098 148.836Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M136.822 150.083C136.622 149.968 136.622 149.782 136.822 149.667L137.543 149.25C137.743 149.135 138.066 149.135 138.265 149.25C138.464 149.365 138.464 149.552 138.265 149.667L137.543 150.083C137.344 150.198 137.021 150.198 136.822 150.083Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M143.314 146.333C143.115 146.218 143.115 146.032 143.314 145.917L144.036 145.5C144.235 145.385 144.558 145.385 144.757 145.5C144.957 145.615 144.957 145.802 144.757 145.917L144.036 146.333C143.836 146.448 143.513 146.448 143.314 146.333Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M141.15 146.753C141.349 146.638 141.672 146.638 141.872 146.753L142.593 147.169C142.793 147.284 142.793 147.471 142.593 147.586C142.394 147.701 142.071 147.701 141.872 147.586L141.15 147.169C140.951 147.054 140.951 146.868 141.15 146.753Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M138.986 148.003C139.185 147.888 139.508 147.888 139.708 148.003L140.429 148.419C140.629 148.534 140.629 148.721 140.429 148.836C140.23 148.951 139.907 148.951 139.708 148.836L138.986 148.419C138.787 148.304 138.787 148.118 138.986 148.003Z"
              fill="white"
            />
          </g>
          <path d="M128.035 161.269V147.372L140.07 154.32V168.217L128.035 161.269Z" fill="#07BDD5" />
          <path d="M140.066 154.317L152.101 147.369V161.266L140.066 168.214V154.317Z" fill="#05A8BE" />
          <rect
            x="120.633"
            y="174"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 120.633 174)"
            fill="url(#paint6_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.19s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 101.031 330.375)"
            fill="#0093A7"
          />
          <g clipPath="url(#clip7_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M108.376 329.747C108.177 329.632 108.177 329.446 108.376 329.331L109.82 328.497C110.019 328.382 110.342 328.382 110.542 328.497L111.985 329.331C112.184 329.446 112.184 329.632 111.985 329.747C111.786 329.862 111.463 329.862 111.263 329.747L110.181 329.122L109.098 329.747C108.899 329.862 108.576 329.862 108.376 329.747Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M109.82 331.003C109.621 331.118 109.621 331.304 109.82 331.419L112.707 333.086C112.906 333.201 113.229 333.201 113.428 333.086L117.758 330.586C117.958 330.471 117.958 330.284 117.758 330.169L114.872 328.503C114.672 328.388 114.349 328.388 114.15 328.503L109.82 331.003ZM109.098 331.836C108.5 331.491 108.5 330.931 109.098 330.586L113.428 328.086C114.026 327.741 114.995 327.741 115.593 328.086L118.48 329.753C119.078 330.098 119.078 330.657 118.48 331.003L114.15 333.503C113.552 333.848 112.583 333.848 111.985 333.503L109.098 331.836Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M109.822 333.083C109.622 332.968 109.622 332.782 109.822 332.667L110.543 332.25C110.743 332.135 111.066 332.135 111.265 332.25C111.464 332.365 111.464 332.552 111.265 332.667L110.543 333.083C110.344 333.198 110.021 333.198 109.822 333.083Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M116.314 329.333C116.115 329.218 116.115 329.032 116.314 328.917L117.036 328.5C117.235 328.385 117.558 328.385 117.757 328.5C117.957 328.615 117.957 328.802 117.757 328.917L117.036 329.333C116.836 329.448 116.513 329.448 116.314 329.333Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M114.15 329.753C114.349 329.638 114.672 329.638 114.872 329.753L115.593 330.169C115.793 330.284 115.793 330.471 115.593 330.586C115.394 330.701 115.071 330.701 114.872 330.586L114.15 330.169C113.951 330.054 113.951 329.868 114.15 329.753Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M111.986 331.003C112.185 330.888 112.508 330.888 112.708 331.003L113.429 331.419C113.629 331.534 113.629 331.721 113.429 331.836C113.23 331.951 112.907 331.951 112.708 331.836L111.986 331.419C111.787 331.304 111.787 331.118 111.986 331.003Z"
              fill="white"
            />
          </g>
          <path d="M101.035 344.269V330.372L113.07 337.32V351.217L101.035 344.269Z" fill="#07BDD5" />
          <path d="M113.066 337.317L125.101 330.369V344.266L113.066 351.214V337.317Z" fill="#05A8BE" />
          <rect
            x="93.6328"
            y="357"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 93.6328 357)"
            fill="url(#paint7_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.08s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 152.031 225.375)"
            fill="#0093A7"
          />
          <g clipPath="url(#clip8_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M159.376 224.747C159.177 224.632 159.177 224.446 159.376 224.331L160.82 223.497C161.019 223.382 161.342 223.382 161.542 223.497L162.985 224.331C163.184 224.446 163.184 224.632 162.985 224.747C162.786 224.862 162.463 224.862 162.263 224.747L161.181 224.122L160.098 224.747C159.899 224.862 159.576 224.862 159.376 224.747Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M160.82 226.003C160.621 226.118 160.621 226.304 160.82 226.419L163.707 228.086C163.906 228.201 164.229 228.201 164.428 228.086L168.758 225.586C168.958 225.471 168.958 225.284 168.758 225.169L165.872 223.503C165.672 223.388 165.349 223.388 165.15 223.503L160.82 226.003ZM160.098 226.836C159.5 226.491 159.5 225.931 160.098 225.586L164.428 223.086C165.026 222.741 165.995 222.741 166.593 223.086L169.48 224.753C170.078 225.098 170.078 225.657 169.48 226.003L165.15 228.503C164.552 228.848 163.583 228.848 162.985 228.503L160.098 226.836Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M160.822 228.083C160.622 227.968 160.622 227.782 160.822 227.667L161.543 227.25C161.743 227.135 162.066 227.135 162.265 227.25C162.464 227.365 162.464 227.552 162.265 227.667L161.543 228.083C161.344 228.198 161.021 228.198 160.822 228.083Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M167.314 224.333C167.115 224.218 167.115 224.032 167.314 223.917L168.036 223.5C168.235 223.385 168.558 223.385 168.757 223.5C168.957 223.615 168.957 223.802 168.757 223.917L168.036 224.333C167.836 224.448 167.513 224.448 167.314 224.333Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M165.15 224.753C165.349 224.638 165.672 224.638 165.872 224.753L166.593 225.169C166.793 225.284 166.793 225.471 166.593 225.586C166.394 225.701 166.071 225.701 165.872 225.586L165.15 225.169C164.951 225.054 164.951 224.868 165.15 224.753Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M162.986 226.003C163.185 225.888 163.508 225.888 163.708 226.003L164.429 226.419C164.629 226.534 164.629 226.721 164.429 226.836C164.23 226.951 163.907 226.951 163.708 226.836L162.986 226.419C162.787 226.304 162.787 226.118 162.986 226.003Z"
              fill="white"
            />
          </g>
          <path d="M152.035 239.269V225.372L164.07 232.32V246.217L152.035 239.269Z" fill="#07BDD5" />
          <path d="M164.066 232.317L176.101 225.369V239.266L164.066 246.214V232.317Z" fill="#05A8BE" />
          <rect
            x="144.633"
            y="252"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 144.633 252)"
            fill="url(#paint8_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.35s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 119.031 486.375)"
            fill="#0093A7"
          />
          <g clipPath="url(#clip9_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M126.376 485.747C126.177 485.632 126.177 485.446 126.376 485.331L127.82 484.497C128.019 484.382 128.342 484.382 128.542 484.497L129.985 485.331C130.184 485.446 130.184 485.632 129.985 485.747C129.786 485.862 129.463 485.862 129.263 485.747L128.181 485.122L127.098 485.747C126.899 485.862 126.576 485.862 126.376 485.747Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M127.82 487.003C127.621 487.118 127.621 487.304 127.82 487.419L130.707 489.086C130.906 489.201 131.229 489.201 131.428 489.086L135.758 486.586C135.958 486.471 135.958 486.284 135.758 486.169L132.872 484.503C132.672 484.388 132.349 484.388 132.15 484.503L127.82 487.003ZM127.098 487.836C126.5 487.491 126.5 486.931 127.098 486.586L131.428 484.086C132.026 483.741 132.995 483.741 133.593 484.086L136.48 485.753C137.078 486.098 137.078 486.657 136.48 487.003L132.15 489.503C131.552 489.848 130.583 489.848 129.985 489.503L127.098 487.836Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M127.822 489.083C127.622 488.968 127.622 488.782 127.822 488.667L128.543 488.25C128.743 488.135 129.066 488.135 129.265 488.25C129.464 488.365 129.464 488.552 129.265 488.667L128.543 489.083C128.344 489.198 128.021 489.198 127.822 489.083Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M134.314 485.333C134.115 485.218 134.115 485.032 134.314 484.917L135.036 484.5C135.235 484.385 135.558 484.385 135.757 484.5C135.957 484.615 135.957 484.802 135.757 484.917L135.036 485.333C134.836 485.448 134.513 485.448 134.314 485.333Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M132.15 485.753C132.349 485.638 132.672 485.638 132.872 485.753L133.593 486.169C133.793 486.284 133.793 486.471 133.593 486.586C133.394 486.701 133.071 486.701 132.872 486.586L132.15 486.169C131.951 486.054 131.951 485.868 132.15 485.753Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M129.986 487.003C130.185 486.888 130.508 486.888 130.708 487.003L131.429 487.419C131.629 487.534 131.629 487.721 131.429 487.836C131.23 487.951 130.907 487.951 130.708 487.836L129.986 487.419C129.787 487.304 129.787 487.118 129.986 487.003Z"
              fill="white"
            />
          </g>
          <path d="M119.035 500.269V486.372L131.07 493.32V507.217L119.035 500.269Z" fill="#07BDD5" />
          <path d="M131.066 493.317L143.101 486.369V500.266L131.066 507.214V493.317Z" fill="#05A8BE" />
          <rect
            x="111.633"
            y="513"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 111.633 513)"
            fill="url(#paint9_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="colored-cube" style={{ animationDelay: "0.01s" }}>
          <rect
            width="13.8969"
            height="13.8969"
            transform="matrix(0.866025 -0.5 0.866025 0.5 110.039 159.367)"
            fill="#621ED8"
          />
          <g clipPath="url(#clip10_4200_55240)">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M117.031 158.903C117.22 158.21 117.832 157.578 118.756 157.121C119.68 156.665 120.856 156.414 122.073 156.414C123.289 156.414 124.465 156.665 125.39 157.121C126.314 157.578 126.925 158.21 127.114 158.903C127.303 159.597 127.056 160.307 126.418 160.905C125.819 161.467 124.912 161.895 123.845 162.123L122.53 163.661C122.444 163.761 122.267 163.825 122.073 163.825C121.879 163.825 121.701 163.761 121.615 163.661L120.301 162.123C119.233 161.895 118.326 161.467 117.727 160.905C117.09 160.307 116.843 159.597 117.031 158.903ZM119.419 157.569C118.68 157.934 118.191 158.44 118.04 158.995C117.889 159.55 118.086 160.118 118.596 160.596C119.106 161.074 119.896 161.432 120.822 161.604C120.953 161.628 121.062 161.683 121.123 161.754L122.073 162.865L123.022 161.754C123.084 161.683 123.192 161.628 123.324 161.604C124.25 161.432 125.039 161.074 125.549 160.596C126.059 160.118 126.257 159.55 126.106 158.995C125.955 158.44 125.466 157.934 124.726 157.569C123.987 157.204 123.046 157.003 122.073 157.003C121.1 157.003 120.159 157.204 119.419 157.569Z"
              fill="white"
            />
          </g>
          <path d="M110.035 173.261V159.364L122.07 166.312V180.209L110.035 173.261Z" fill="#7D44E2" />
          <path d="M122.074 166.309L134.109 159.361V173.258L122.074 180.206V166.309Z" fill="#7737E4" />
          <rect
            x="102.633"
            y="186"
            width="39.3746"
            height="39.3746"
            transform="rotate(-90 102.633 186)"
            fill="url(#paint10_radial_4200_55240)"
            fillOpacity="0.2"
          />
        </g>
        <g className="lights">
          <path
            d="M139.834 727L74.0156 689V-174L205.651 -174V689L139.834 727Z"
            fill="url(#paint11_linear_4200_55240)"
            fillOpacity="0.3"
          />
          <rect width="76" height="76" transform="matrix(-0.866025 -0.5 0.866025 -0.5 139.82 727)" fill="#D0754E" />
          <rect width="60" height="60" transform="matrix(-0.866025 -0.5 0.866025 -0.5 139.82 727)" fill="#F7A886" />
        </g>
        <rect
          x="281"
          y="597"
          width="281"
          height="622"
          transform="rotate(-180 281 597)"
          fill="url(#paint12_linear_4200_55240)"
        />
      </g>
      <defs>
        <linearGradient
          id="paint0_linear_4200_55240"
          x1="421.5"
          y1="1332"
          x2="421.5"
          y2="805"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1B1B1C" />
          <stop offset="1" stopColor="#1B1B1C" stopOpacity="0" />
        </linearGradient>
        <radialGradient
          id="paint1_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(182.32 227.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#FFE29F" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFE29F" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint2_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(104.32 264.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#FFE29F" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFE29F" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint3_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(157.32 444.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#FFE29F" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFE29F" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint4_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(173.32 349.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#9C64FD" />
          <stop offset="1" stopColor="#9C64FD" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint5_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(122.32 295.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#9C64FD" />
          <stop offset="1" stopColor="#9C64FD" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint6_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(140.32 193.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#72EEFE" />
          <stop offset="1" stopColor="#07BDD5" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint7_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(113.32 376.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#72EEFE" />
          <stop offset="1" stopColor="#07BDD5" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint8_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(164.32 271.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#72EEFE" />
          <stop offset="1" stopColor="#07BDD5" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint9_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(131.32 532.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#72EEFE" />
          <stop offset="1" stopColor="#07BDD5" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="paint10_radial_4200_55240"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(122.32 205.687) rotate(90) scale(19.6873)"
        >
          <stop stopColor="#9C64FD" />
          <stop offset="1" stopColor="#9C64FD" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="paint11_linear_4200_55240"
          x1="140"
          y1="727"
          x2="526.464"
          y2="57.625"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D0754E" />
          <stop offset="0.75" stopColor="#D0754E" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="paint12_linear_4200_55240"
          x1="421.5"
          y1="1219"
          x2="421.5"
          y2="597"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1B1B1C" />
          <stop offset="1" stopColor="#1B1B1C" stopOpacity="0" />
        </linearGradient>
        <clipPath id="clip0_4200_55240">
          <rect width="778" height="281" fill="white" transform="matrix(0 -1 -1 0 281 778)" />
        </clipPath>
        <clipPath id="clip1_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 173.414 181.367)" />
        </clipPath>
        <clipPath id="clip2_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 95.4141 218.367)" />
        </clipPath>
        <clipPath id="clip3_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 148.414 398.367)" />
        </clipPath>
        <clipPath id="clip4_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 164.414 303.367)" />
        </clipPath>
        <clipPath id="clip5_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 113.414 249.367)" />
        </clipPath>
        <clipPath id="clip6_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 131.406 147.375)" />
        </clipPath>
        <clipPath id="clip7_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 104.406 330.375)" />
        </clipPath>
        <clipPath id="clip8_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 155.406 225.375)" />
        </clipPath>
        <clipPath id="clip9_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 122.406 486.375)" />
        </clipPath>
        <clipPath id="clip10_4200_55240">
          <rect width="10" height="10" fill="white" transform="matrix(0.866025 -0.5 0.866025 0.5 113.414 159.367)" />
        </clipPath>
      </defs>
    </svg>
  </div>
);

export default CubesIllustration;
