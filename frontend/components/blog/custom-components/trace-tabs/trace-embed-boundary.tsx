"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

// Keeps a render-time / lifecycle failure inside the embedded TraceView from
// crashing the whole blog post. The surrounding tabs still render; this slot
// shows a fallback that links out to the full shared trace. The parent keys
// this boundary by trace id so switching tabs resets `hasError`.
export default class TraceEmbedBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[TraceTabs] embedded trace view failed to render:", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
