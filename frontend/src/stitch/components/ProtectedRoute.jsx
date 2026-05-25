import React, { Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";

// Loading fallback component
const LoadingFallback = () => (
  <div className="screen-center stitch-bg" style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    fontSize: "16px",
    color: "#666"
  }}>
    <div className="loading-spinner">
      <div style={{
        width: "40px",
        height: "40px",
        border: "4px solid #f0f0f0",
        borderTop: "4px solid #333",
        borderRadius: "50%",
        animation: "spin 1s linear infinite"
      }} />
      <p style={{ marginTop: "20px" }}>Loading...</p>
    </div>
  </div>
);

export default function ProtectedRoute({ bootStatus, token, children }) {
  const location = useLocation();

  // Still loading auth
  if (bootStatus === "loading") {
    return <LoadingFallback />;
  }

  // Not authenticated - redirect to login
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Authenticated - render children with Suspense boundary
  return (
    <Suspense fallback={<LoadingFallback />}>
      {children}
    </Suspense>
  );
}

