// Open a signal with wide columns and at least three pages of matching events, then:
// agent-browser reload && agent-browser eval --stdin < frontend/tests/browser/signal-events-scroll.js
(async () => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
  const waitFor = async (predicate, message) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (predicate()) return;
      await pause();
    }
    throw new Error(message);
  };
  const pages = () =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /\/signals\/[^/]+\/events\?/.test(entry.name))
      .map((entry) => Number(new URL(entry.name).searchParams.get("pageNumber")));

  await waitFor(
    () => pages().includes(0) && document.querySelector("table tbody tr[data-index]"),
    "Initial events not loaded"
  );
  const table = document.querySelector("table");
  const header = table.querySelector("thead");
  let scroller = table.parentElement;
  while (scroller && getComputedStyle(scroller).overflowY !== "auto") scroller = scroller.parentElement;
  assert(scroller, "Missing shared scrollport");
  const controls = scroller.firstElementChild.firstElementChild;
  assert(scroller.scrollWidth > scroller.clientWidth, "Fixture needs wide columns");

  const checkLayout = () => {
    const outer = scroller.parentElement.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    assert(Math.abs(viewport.left - outer.left - 16) < 1, "Left gutter moved");
    assert(Math.abs(outer.right - viewport.right - 16) < 1, "Right gutter moved");
    assert(Math.abs(controls.getBoundingClientRect().left - viewport.left) < 1, "Controls moved horizontally");
    assert(Math.abs(controls.getBoundingClientRect().width - scroller.clientWidth) < 1, "Controls exceed viewport");
    assert(document.documentElement.scrollWidth === innerWidth, "Page overflows horizontally");
    assert(header.style.transform === "", "Header relies on JavaScript translation");
    assert(getComputedStyle(header).position === "sticky", "Header is not natively sticky");
  };

  // Check before any scroll listener could reposition the header.
  for (const left of [0, scroller.scrollWidth]) {
    scroller.scrollLeft = left;
    for (const top of [650, 900, 700]) {
      scroller.scrollTop = top;
      checkLayout();
      assert(
        Math.abs(header.getBoundingClientRect().top - scroller.getBoundingClientRect().top) <= 1,
        "Header detached"
      );
      assert(
        controls.getBoundingClientRect().bottom < scroller.getBoundingClientRect().top,
        "Controls did not scroll away"
      );
    }
  }

  // Page 1 must load with the leftmost columns offscreen, then page 2 at the left edge.
  for (const [page, left] of [
    [1, scroller.scrollWidth],
    [2, 0],
  ]) {
    scroller.scrollLeft = left;
    await waitFor(() => {
      scroller.scrollTop = scroller.scrollHeight;
      return pages().includes(page);
    }, `Automatic pagination stalled before page ${page}`);
    checkLayout();
  }
  return { result: "PASS", pages: pages(), gutters: "16px both sides", header: "native sticky" };
})();
