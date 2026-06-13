import React from "react";

function logError(error, info) {
  try {
    const payload = {
      error: error?.message || String(error),
      stack: error?.stack,
      componentStack: info?.componentStack,
      url: window.location?.href,
      userAgent: navigator?.userAgent,
      timestamp: new Date().toISOString()
    };
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch {}
}

function sendAnalytics(event, data) {
  try {
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", event, data);
    }
  } catch {}
}

export { sendAnalytics };

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ errorInfo: info });
    logError(error, info);
    sendAnalytics("error", {
      error: error?.message,
      fatal: true
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" role="alert" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "20px",
          background: "#000",
          color: "#fff",
          textAlign: "center",
          fontFamily: "'Inter', sans-serif"
        }}>
          <div style={{
            maxWidth: "420px",
            padding: "32px",
            background: "rgba(18,18,18,0.95)",
            border: "1px solid rgba(255,107,107,0.3)",
            borderRadius: "20px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 700 }}>Something went wrong</h2>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: "10px 20px",
                  borderRadius: "999px",
                  border: "1px solid rgba(84,195,255,0.3)",
                  background: "transparent",
                  color: "#54c3ff",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600
                }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: "10px 20px",
                  borderRadius: "999px",
                  border: "none",
                  background: "linear-gradient(135deg, #0f2760, #1e6be0)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600
                }}
              >
                Reload Page
              </button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details style={{ marginTop: "16px", textAlign: "left" }}>
                <summary style={{ color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "12px" }}>Error details</summary>
                <pre style={{ fontSize: "11px", color: "#ff908b", marginTop: "8px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
