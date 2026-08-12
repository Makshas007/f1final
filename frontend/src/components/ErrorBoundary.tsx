import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Uncaught error in Crowd Flow Optimiser:", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary"
          className="grid h-screen w-screen place-items-center bg-[#040914] p-8 text-center"
        >
          <div className="max-w-md">
            <h1 className="font-[Exo_2] text-2xl font-bold text-red-400">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              {this.state.message ||
                "An unexpected error occurred while rendering the console."}
            </p>
            <button
              data-testid="error-reload-btn"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-md border border-sky-400/50 bg-sky-400/15 px-5 py-2.5 text-sm font-semibold text-sky-200 duration-150 hover:bg-sky-400/25"
            >
              Reload console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
