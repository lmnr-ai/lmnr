import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLatestRequestGate } from "@/components/ui/infinite-datatable/hooks/request-generation";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

interface Page {
  items: string[];
}

/**
 * This mirrors the hook's result boundary: requests capture the generation at
 * start and only the current generation may mutate the table state.
 */
function createRequestHarness() {
  const gate = createLatestRequestGate();
  let rows: string[] = ["old-query"];
  let error: Error | null = null;

  const start = (request: Promise<Page>, shouldReset: boolean) => {
    const requestToken = gate.beginRequest();
    if (requestToken === null) return null;

    return request.then(
      (result) => {
        if (!gate.isCurrent(requestToken)) return;
        rows = shouldReset ? result.items : [...rows, ...result.items];
        gate.finishRequest(requestToken);
      },
      (requestError: Error) => {
        if (!gate.isCurrent(requestToken)) return;
        error = requestError;
        gate.finishRequest(requestToken);
      }
    );
  };

  const captureFetchNextPage = () => {
    const queryGeneration = gate.getGeneration();
    return (request: Promise<Page>) => {
      if (!gate.isGenerationCurrent(queryGeneration)) return null;
      return start(request, false);
    };
  };

  return {
    captureFetchNextPage,
    gate,
    getRows: () => rows,
    getError: () => error,
    start,
  };
}

describe("infinite-scroll request generations", () => {
  it("ignores stale pagination success after a refetch and accepts the new page", async () => {
    const harness = createRequestHarness();
    const oldPage = deferred<Page>();
    const freshPage = deferred<Page>();

    const oldRequest = harness.start(oldPage.promise, false);
    harness.gate.invalidate();
    const freshRequest = harness.start(freshPage.promise, true);

    assert.notEqual(oldRequest, null);
    assert.notEqual(freshRequest, null);

    oldPage.resolve({ items: ["stale-page"] });
    await oldRequest!;
    assert.deepEqual(harness.getRows(), ["old-query"]);

    freshPage.resolve({ items: ["fresh-page"] });
    await freshRequest!;
    assert.deepEqual(harness.getRows(), ["fresh-page"]);
  });

  it("ignores stale errors so a retired pagination request cannot clobber a successful refetch", async () => {
    const harness = createRequestHarness();
    const oldPage = deferred<Page>();
    const freshPage = deferred<Page>();

    const oldRequest = harness.start(oldPage.promise, false);
    harness.gate.invalidate();
    const freshRequest = harness.start(freshPage.promise, true);

    assert.notEqual(oldRequest, null);
    assert.notEqual(freshRequest, null);

    freshPage.resolve({ items: ["fresh-page"] });
    await freshRequest!;
    oldPage.reject(new Error("stale request failed"));
    await oldRequest!;

    assert.deepEqual(harness.getRows(), ["fresh-page"]);
    assert.equal(harness.getError(), null);
  });

  it("appends a current pagination response while a later page remains in the same generation", async () => {
    const harness = createRequestHarness();
    const page = deferred<Page>();

    const request = harness.start(page.promise, false);
    assert.notEqual(request, null);
    page.resolve({ items: ["next-page"] });
    await request!;

    assert.deepEqual(harness.getRows(), ["old-query", "next-page"]);
  });

  it("retires a request on query reset before the old response settles", async () => {
    const harness = createRequestHarness();
    const oldQuery = deferred<Page>();

    const request = harness.start(oldQuery.promise, true);
    assert.notEqual(request, null);
    harness.gate.invalidate();
    oldQuery.resolve({ items: ["old-query-response"] });
    await request!;

    assert.deepEqual(harness.getRows(), ["old-query"]);
    assert.equal(harness.getError(), null);
  });

  it("rejects a pagination request started by a stale callback after refetch begins", async () => {
    const harness = createRequestHarness();
    const initialPage = deferred<Page>();
    const freshPage = deferred<Page>();
    const stalePaginationPage = deferred<Page>();

    const initialRequest = harness.start(initialPage.promise, true);
    assert.notEqual(initialRequest, null);
    initialPage.resolve({ items: ["initial-page"] });
    await initialRequest!;

    // Refetch synchronously invalidates the old generation and claims the
    // request slot before a React rerender can update fetchNextPage's closure.
    harness.gate.invalidate();
    const freshRequest = harness.start(freshPage.promise, true);
    const stalePaginationRequest = harness.start(stalePaginationPage.promise, false);

    assert.notEqual(freshRequest, null);
    assert.equal(stalePaginationRequest, null);

    stalePaginationPage.resolve({ items: ["must-not-append"] });
    freshPage.resolve({ items: ["fresh-page"] });
    await freshRequest!;

    assert.deepEqual(harness.getRows(), ["fresh-page"]);
  });

  it("rejects an old pagination callback after refetch page zero completes", async () => {
    const harness = createRequestHarness();
    const initialPage = deferred<Page>();
    const freshPage = deferred<Page>();
    const stalePaginationPage = deferred<Page>();

    const initialRequest = harness.start(initialPage.promise, true);
    assert.notEqual(initialRequest, null);
    initialPage.resolve({ items: ["initial-page"] });
    await initialRequest!;

    // This represents the IntersectionObserver callback retained by the
    // render that displayed the old query.
    const staleFetchNextPage = harness.captureFetchNextPage();

    harness.gate.invalidate();
    const freshRequest = harness.start(freshPage.promise, true);
    assert.notEqual(freshRequest, null);
    freshPage.resolve({ items: ["fresh-page"] });
    await freshRequest!;

    // The active slot is free now, but the callback's captured generation is
    // still stale and must not append using its old page/fetch semantics.
    const stalePaginationRequest = staleFetchNextPage(stalePaginationPage.promise);
    assert.equal(stalePaginationRequest, null);
    stalePaginationPage.resolve({ items: ["must-not-append"] });

    assert.deepEqual(harness.getRows(), ["fresh-page"]);
  });
});
