"use client";

import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prevValue: T) => T)) => void] {
  // Always start with defaultValue to match SSR
  const [value, setValue] = useState<T>(defaultValue);

  // Read from localStorage only on client after mount
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue !== null) {
        const parsed = JSON.parse(storedValue);
        // Only update state if the stored value is different from default
        if (JSON.stringify(parsed) !== JSON.stringify(defaultValue)) {
          setValue(parsed);
        }
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
  }, [key]); // Intentionally omitting defaultValue to run only once

  // Write to localStorage when value changes
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, value]);

  const setStoredValue = (newValue: T | ((prevValue: T) => T)) => {
    setValue((currentValue) =>
      typeof newValue === "function" ? (newValue as (prevValue: T) => T)(currentValue) : newValue
    );
  };

  return [value, setStoredValue];
}
