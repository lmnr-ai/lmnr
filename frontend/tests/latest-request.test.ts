import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLatestRequest } from "@/lib/api/latest-request";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("createLatestRequest", () => {
  it("returns the data of an uncontested request", async () => {
    const request = createLatestRequest();
    assert.deepEqual(await request.run(async () => 1), { superseded: false, data: 1 });
  });

  it("marks an older request superseded even when it resolves last, and aborts it", async () => {
    const request = createLatestRequest();
    const slow = deferred<string>();
    let slowSignal: AbortSignal | undefined;

    const first = request.run((signal) => {
      slowSignal = signal;
      return slow.promise;
    });
    const second = request.run(async () => "new");

    assert.deepEqual(await second, { superseded: false, data: "new" });
    assert.equal(slowSignal?.aborted, true);
    slow.resolve("old");
    assert.deepEqual(await first, { superseded: true });
  });

  it("swallows the error of a cancelled request but rethrows a current one", async () => {
    const request = createLatestRequest();
    const pending = deferred<never>();
    const cancelled = request.run(() => pending.promise);
    request.cancel();
    pending.reject(new DOMException("aborted", "AbortError"));
    assert.deepEqual(await cancelled, { superseded: true });

    await assert.rejects(
      request.run(async () => {
        throw new Error("boom");
      }),
      /boom/
    );
  });

  it("keeps separate instances independent", async () => {
    const a = createLatestRequest();
    const b = createLatestRequest();
    const pending = deferred<number>();
    const fromA = a.run(() => pending.promise);
    await b.run(async () => 2);
    pending.resolve(1);
    assert.deepEqual(await fromA, { superseded: false, data: 1 });
  });
});
