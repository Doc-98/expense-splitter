import { Component } from 'react'

// The app's last safety net. Without it, any error thrown while rendering —
// a bug, an unexpected data shape, or a lazily loaded page whose file is gone
// after a new version shipped — unmounts the whole app and leaves a blank
// screen until a manual reload. This catches it, keeps the header and
// navigation working, and offers a way out.
//
// `resetKey` (the current path) clears the error on navigation, so going
// back or to another page recovers without a reload.
export default class ErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    // A page file that failed to load is almost always a new version
    // having replaced the old one: a reload fetches the new files.
    const staleFiles = /dynamically imported module|Failed to fetch|Loading chunk|Importing a module script failed/i.test(
      String(this.state.error?.message)
    )
    return (
      <div className="page" role="alert">
        <h1>Something went wrong</h1>
        <p className="status-error">
          {staleFiles
            ? 'This page couldn’t be loaded — the app was probably just updated.'
            : 'This page hit an unexpected error. Your data is safe.'}
        </p>
        <div className="error-boundary-actions">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a href="/" className="btn-secondary">
            Go to my groups
          </a>
        </div>
      </div>
    )
  }
}
