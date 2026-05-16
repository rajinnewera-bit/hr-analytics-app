"use client";

import { Component, ErrorInfo, ReactNode } from "react";

type UploadWorkspaceBoundaryProps = {
  children: ReactNode;
};

type UploadWorkspaceBoundaryState = {
  hasError: boolean;
};

export class UploadWorkspaceBoundary extends Component<
  UploadWorkspaceBoundaryProps,
  UploadWorkspaceBoundaryState
> {
  state: UploadWorkspaceBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): UploadWorkspaceBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Upload workspace crashed", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section className="rounded-[2rem] border border-rose-200 bg-white/90 p-6 shadow-soft backdrop-blur sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-700">
            Workspace Error
          </p>
          <h2 className="mt-3 text-2xl font-bold text-ink">
            The upload workspace ran into a temporary problem.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slateText">
            Your page can recover safely. Reload the workspace to clear temporary state
            and continue using the upload flow.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-5 inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800"
          >
            Reload Workspace
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
