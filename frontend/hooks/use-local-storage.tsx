"use client";

import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prevValue: T) => T)) => void] {
  // Always start with defaultValue to match SSR
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue !== null) {
        const parsed = JSON.parse(storedValue);
        // Only update state if the stored value is different from default
        if (JSON.stringify(parsed) !== JSON.stringify(defaultValue)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

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
