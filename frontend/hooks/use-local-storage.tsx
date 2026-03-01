"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const subscribeNone = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

/**
 * A hook that syncs state with localStorage using useSyncExternalStore.
 *
 * Features:
 * - SSR safe: returns defaultValue during hydration.
 * - Cross-tab sync: updates when other tabs change the same key.
 * - Same-tab sync: updates when other components in the same tab change the same key.
 * - No manual useEffect: uses React 18's built-in external store synchronization.
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prevValue: T) => T)) => void] {
  // 1. Detect if we are mounted on the client.
  // This ensures the first client render matches the server render (returning false).
  // Then React will immediately re-render on the client with true.
  const isMounted = useSyncExternalStore(subscribeNone, getTrue, getFalse);

  // 2. Subscribe to storage changes (both from other tabs and this tab).
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === key || e.key === null) {
          onStoreChange();
        }
      };
      const handleCustomChange = (e: Event) => {
        if ((e as CustomEvent).detail?.key === key) {
          onStoreChange();
        }
      };

      window.addEventListener("storage", handleStorageChange);
      window.addEventListener("laminar-local-storage-update", handleCustomChange);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("laminar-local-storage-update", handleCustomChange);
      };
    },
    [key]
  );

  // 3. Snapshots for useSyncExternalStore
  const getSnapshot = useCallback(() => (typeof window === "undefined" ? null : localStorage.getItem(key)), [key]);
  const getServerSnapshot = useCallback(() => null, []);

  // 4. Get the raw value from the store
  const rawValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 5. Derive the final value.
  // We use defaultValue until isMounted is true to guarantee hydration match.
  const value = useMemo(() => {
    if (!isMounted || rawValue === null) {
      return defaultValue;
    }
    try {
      return JSON.parse(rawValue) as T;
    } catch (error) {
      console.warn(`Error parsing localStorage key "${key}":`, error);
      return defaultValue;
    }
  }, [isMounted, rawValue, defaultValue, key]);

  // 6. Persistence function
  const setStoredValue = useCallback(
    (newValue: T | ((prevValue: T) => T)) => {
      if (typeof window === "undefined") return;
      try {
        const currentRawValue = localStorage.getItem(key);
        const currentValue = currentRawValue !== null ? JSON.parse(currentRawValue) : defaultValue;
        const nextValue = typeof newValue === "function" ? (newValue as (prevValue: T) => T)(currentValue) : newValue;

        localStorage.setItem(key, JSON.stringify(nextValue));

        // Notify other instances in the same tab
        window.dispatchEvent(new CustomEvent("laminar-local-storage-update", { detail: { key } }));
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, defaultValue]
  );

  return [value, setStoredValue];
}
