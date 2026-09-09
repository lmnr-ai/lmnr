"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

/** Enter commits and stays open for the next one; blur commits; Escape or an empty blur closes. */
export function AddModelInput({ onAdd, onClose }: { onAdd: (model: string) => void; onClose: () => void }) {
  const [value, setValue] = useState("");

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  };

  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onBlur={() => {
        commit();
        onClose();
      }}
      placeholder="Model id, e.g. gpt-5-mini"
      className="h-8"
      autoComplete="off"
    />
  );
}
