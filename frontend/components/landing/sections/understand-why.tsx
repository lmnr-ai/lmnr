import UnderstandWhyTraceView from "./understand-why-trace-view";
import UnderstandWhyTraceViewMobile from "./understand-why-trace-view/mobile";

// Mobile and desktop are completely separate trees: the desktop variant runs
// a scroll-locked narrative that doesn't make sense on touch, so on mobile we
// render three plain stacked blocks (alerts / signal card / trace cards).
const UnderstandWhy = () => (
  <>
    <div className="hidden md:block">
      <UnderstandWhyTraceView />
    </div>
    <div className="md:hidden">
      <UnderstandWhyTraceViewMobile />
    </div>
  </>
);

export default UnderstandWhy;
