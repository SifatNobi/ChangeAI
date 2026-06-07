import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COMPANY_LOGO, COMPANY_NAME } from "../../constants/branding";

export default function LoginScreen({ mode = "login", loading = false, error = "", onSubmit }) {
  const navigate = useNavigate();
  const isSignup = useMemo(() => mode === "register", [mode]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user"
  });
  const isLogin = !isSignup;
  const videoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit) {
      return;
    }

    const payload = isSignup
      ? {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role
        }
      : {
          email: form.email.trim().toLowerCase(),
          password: form.password
        };

    await onSubmit(payload);
  };

  const toggleMuted = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-panel">

        {/* LEFT SIDE */}
        <div className="hero-copy">
          <div className="auth-logo">
            <img src={COMPANY_LOGO} alt={COMPANY_NAME} className="auth-brand-logo" />
          </div>
          <h1>
            Instant <span className="hero-highlight">Payments</span>
          </h1>
          <p>No fees. No delays. Just speed.</p>
          <p className="animated-promo">Instant payments • Zero transaction fee for lifetime!</p>
          
          {/* Demo Video */}
          <div className="demo-video-container">
            <div className="demo-video-wrapper">
              <video
                ref={videoRef}
                src="/assets/demo.mp4"
                autoPlay
                muted={isMuted}
                loop
                playsInline
                className="demo-video"
              />
              <button
                type="button"
                className="sound-toggle"
                onClick={toggleMuted}
                aria-label={isMuted ? "Unmute video" : "Mute video"}
              >
                {isMuted ? "🔇" : "🔊"}
              </button>
            </div>
            <p className="video-caption">See ChangeAIPay in action</p>
          </div>
        </div>

        {/* RIGHT SIDE FORM */}
        <div className="card auth-card glass-card login-surface">
          <h2>{isSignup ? "Create Account" : "Welcome Back"}</h2>

          {isSignup && (
            <div className="role-selector">
              <label className="role-label">I am signing in as:</label>
              <div className="role-options">
                <label className={`role-option ${form.role === "user" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="role"
                    value="user"
                    checked={form.role === "user"}
                    onChange={handleChange}
                  />
                  <span className="role-icon">👤</span>
                  <span className="role-text">
                    <strong>User</strong>
                    <small>Send & receive payments</small>
                  </span>
                </label>
                <label className={`role-option ${form.role === "merchant" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="role"
                    value="merchant"
                    checked={form.role === "merchant"}
                    onChange={handleChange}
                  />
                  <span className="role-icon">🏪</span>
                  <span className="role-text">
                    <strong>Merchant</strong>
                    <small>Accept payments</small>
                  </span>
                </label>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>

            {/* NAME (ONLY FOR SIGNUP) */}
            {isSignup && (
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                value={form.name}
                onChange={handleChange}
                required
              />
            )}

            {/* EMAIL */}
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />

            {/* PASSWORD */}
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />

            {/* ERROR */}
            {error && <p className="error">{error}</p>}

            {/* BUTTON */}
            <button
              type="submit"
              className="primary-button auth-cta"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : isSignup
                ? `Sign Up as ${form.role === "merchant" ? "Merchant" : "User"}`
                : "Login"}
            </button>
          </form>

          <div className="auth-quick-links">
            <button type="button" className="ghost-button" onClick={() => navigate("/waitlist")}>Join Waitlist</button>
            <button type="button" className="ghost-button" onClick={() => navigate("/pricing")}>View Pricing</button>
          </div>

          {/* SWITCH */}
          <p className="switch-copy">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <span
              style={{ color: "#54c3ff", cursor: "pointer" }}
              onClick={() => {
                navigate(isSignup ? "/login" : "/register");
              }}
            >
              {isSignup ? "Login" : "Sign up"}
            </span>
          </p>
        </div>

      </div>
    </div>
  );
}
