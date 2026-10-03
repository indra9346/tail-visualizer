import { Component, type ReactNode } from "react";

interface State {
  failed: boolean;
}

/** Catches a crashing page so the user sees a recovery screen instead of a blank white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Page crashed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl text-stone-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-stone-600">This page hit a problem. Your saved work is safe. Reload to try again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          Reload page
        </button>
      </div>
    );
  }
}
