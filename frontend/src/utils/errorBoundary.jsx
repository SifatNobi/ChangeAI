import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Error boundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" style={{
          padding: "20px",
          margin: "20px",
          backgroundColor: "#fee",
          border: "1px solid #fcc",
          borderRadius: "4px",
          color: "#c33"
        }}>
          <h2>Something went wrong</h2>
          <p>Please try refreshing the page.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: "8px 16px",
              backgroundColor: "#c33",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
