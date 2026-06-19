"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Scoped boundary so that any render-time / lifecycle error inside the
// scroll-locked trace view can't crash the rest of the landing page. On error
// the entire section is hidden — it's decorative; missing it is preferable to
// breaking neighbouring sections.
export default class TraceViewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[UnderstandWhyTraceView] render failed, hiding section:", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
