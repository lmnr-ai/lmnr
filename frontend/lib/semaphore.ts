/**
 * This is a simple implementation of a semaphore to replicate
 * the behavior of the `asyncio.Semaphore` in Python.
 */
export class Semaphore {
  /**
   * Number of permits available.
   */
  private _value: number;
  /**
   * List of promises that will be resolved when a permit becomes available.
   */
  private _waiters: ((...args: any[]) => any)[] = [];

  constructor(value = 1) {
    if (value < 0) {
      throw new Error("Semaphore value must be >= 0");
    }
    this._value = value;
    this._waiters = [];
  }

  async acquire() {
    if (this._value > 0) {
      this._value--;
      return;
    }

    // Create a promise that will be resolved when a permit becomes available
    return new Promise(resolve => {
      this._waiters.push(resolve);
    });
  }

  release() {
    if (this._waiters.length > 0) {
      // If there are waiters, wake up the first one
      const resolve = this._waiters.shift();
      resolve?.();
    } else {
      this._value++;
    }
  }

  // Python-like context manager functionality
  async using<T>(fn: (...args: any[]) => Promise<T>) {
    try {
      await this.acquire();
      return await fn();
    } finally {
      this.release();
    }
  }
}
