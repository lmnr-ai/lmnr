"use client";

import "dialkit/styles.css";
import { DialRoot, useDialKit } from "dialkit";
import { useEffect } from "react";

import { INPUT_BORDER_COLORS, type InputBorderColor, useFirstInputStyle } from "./first-input-style";

/** DialKit panel for prototyping the Input column's left rule. */
export default function FirstInputDial() {
  const setStyle = useFirstInputStyle((s) => s.set);
  const values = useDialKit(
    "Sessions table",
    {
      inputBorder: true,
      inputBorderColor: {
        type: "select",
        options: Object.keys(INPUT_BORDER_COLORS).map((key) => ({ value: key, label: key })),
        default: "blue-400/70",
      },
    },
    { id: "sessions-table" }
  );

  useEffect(
    () =>
      setStyle({ showBorder: Boolean(values.inputBorder), borderColor: values.inputBorderColor as InputBorderColor }),
    [values.inputBorder, values.inputBorderColor, setStyle]
  );

  return <DialRoot position="top-right" />;
}
