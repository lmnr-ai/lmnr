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
// the section collapses to a lightweight retry control — decorative, so a
// missing section is preferable to breaking neighbouring sections.
export default class TraceViewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[UnderstandWhyTraceView] render failed:", error);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center py-8">
          <button
            type="button"
            onClick={this.reset}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Reload section
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
