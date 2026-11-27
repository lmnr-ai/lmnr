"use client";

import { useSyncExternalStore } from "react";

const subscribeNone = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

/** `false` on the server and during hydration, `true` after. Gate browser-only reads (localStorage, window) on it. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribeNone, getTrue, getFalse);
}
