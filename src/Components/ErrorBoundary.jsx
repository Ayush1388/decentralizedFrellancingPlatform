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
        <p className="eyebrow text-gold">Technical difficulties</p>
        <h1 className="poster-title text-6xl">Something went wrong</h1>
        <p className="max-w-md text-ink-soft">The page hit an unexpected problem. Your data is safe. Try again, or go back to the start.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={() => window.location.reload()} className="eyebrow inline-flex min-h-11 items-center bg-gold px-5 text-poster hover:brightness-110">
            Reload the page
          </button>
          <a href="/" className="eyebrow inline-flex min-h-11 items-center border border-[#3a3733] px-5 hover:border-gold hover:text-gold">
            Back to the start
          </a>
        </div>
      </div>
    );
  }
}
