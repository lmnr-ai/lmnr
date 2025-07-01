"use client";

import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prevValue: T) => T)) => void] {
  const getStoredValue = (): T => {
    if (typeof window === "undefined") {
      return defaultValue;
    }

    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue === null) {
        return defaultValue;
      }
      return JSON.parse(storedValue);
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  };

  const [value, setValue] = useState<T>(getStoredValue);

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
