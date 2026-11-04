import { Component } from "react";

// A crash in one page shows this screen instead of a blank page, and a way back.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // Navigating to another page clears the error.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container-page flex min-h-[50vh] flex-col items-center justify-center gap-4 py-20 text-center">
        <h1 className="poster-title text-6xl">Something went wrong</h1>
        <p className="max-w-md text-ink-soft">The page hit an unexpected problem. Your data is safe. Try again, or go back to the start.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-lg bg-gold px-5 font-semibold text-poster hover:brightness-110">
            Reload the page
          </button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-lg border border-[#3d3332] px-5 font-medium hover:border-[#6a5a55] hover:text-ink">
            Back to the start
          </a>
        </div>
      </div>
    );
  }
}
