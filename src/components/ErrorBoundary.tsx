import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface State { error: Error | null }

/** Contains a crash to the module that caused it instead of blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('Module crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-lg rounded-xl border border-accent-red/30 bg-accent-red/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-accent-red" />
        <p className="mt-3 font-semibold text-ink-primary">This screen hit an unexpected error</p>
        <p className="mt-1 break-words text-sm text-ink-muted">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-4 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white">Try again</button>
      </div>
    );
  }
}
