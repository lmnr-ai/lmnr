"use client";

import "dialkit/styles.css";
import { DialRoot } from "dialkit";

// DialKit hides itself in production builds; the layout also only mounts this in dev.
export default function DevDialRoot() {
  return <DialRoot position="bottom-right" />;
}
