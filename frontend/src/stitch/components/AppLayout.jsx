import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import BrandMark from "./BrandMark";
import { FINA_AI_IMAGE } from "../../constants/branding";

export default function AppLayout({ profile, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && menuOpen) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const handleGoals = () => {
    closeMenu();
    window.dispatchEvent(new CustomEvent("open-goals"));
  };

  const handleAIInsights = () => {
    closeMenu();
    window.dispatchEvent(new CustomEvent("open-ai-assistant"));
  };

  return (
    <div className="app-shell stitch-bg">
      <header className="topbar glass-card">
        <div className="brand-lockup">
          <BrandMark size={40} />
          <strong className="brand-title">ChangeAIPay</strong>
        </div>

        <button
          className={`hamburger-button ${menuOpen ? "active" : ""}`}
          onClick={openMenu}
          type="button"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          <span className="hamburger-inner">
            <span />
            <span />
            <span />
          </span>
        </button>
      </header>

      {menuOpen && (
        <div
          className="mobile-overlay"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {menuOpen && (
        <nav
          id="mobile-nav"
          className="topnav topnav-mobile open"
          role="navigation"
          aria-label="Mobile navigation"
          aria-hidden="false"
        >
          <div className="drawer-header">
            <span className="drawer-title">Menu</span>
            <button
              type="button"
              className="drawer-close"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMenu();
              }}
              aria-label="Close menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <NavLink className="nav-link" to="/dashboard" onClick={closeMenu}>
            <span className="nav-icon">🏠</span> Home
          </NavLink>
          <NavLink className="nav-link" to="/send" onClick={closeMenu}>
            <span className="nav-icon">📤</span> Send
          </NavLink>
          <NavLink className="nav-link" to="/receive" onClick={closeMenu}>
            <span className="nav-icon">📥</span> Receive
          </NavLink>
          <NavLink className="nav-link" to="/history" onClick={closeMenu}>
            <span className="nav-icon">📋</span> History
          </NavLink>
          <NavLink className="nav-link" to="/pricing" onClick={closeMenu}>
            <span className="nav-icon">💎</span> Pricing
          </NavLink>
          <NavLink className="nav-link" to="/feature-requests" onClick={closeMenu}>
            <span className="nav-icon">💡</span> Feature Requests
          </NavLink>
          <button
            className="nav-link nav-link-action"
            onClick={(e) => {
              e.preventDefault();
              handleAIInsights();
            }}
            type="button"
          >
            <img src={FINA_AI_IMAGE} alt="Fina AI" className="nav-icon-fina" /> AI Insights
          </button>
          <button
            className="nav-link nav-link-action"
            onClick={(e) => {
              e.preventDefault();
              handleGoals();
            }}
            type="button"
          >
            <span className="nav-icon">🎯</span> Goals
          </button>
          <div className="drawer-divider" />
          <button
            className="nav-link logout-link"
            onClick={() => {
              closeMenu();
              onLogout();
            }}
            type="button"
          >
            <span className="nav-icon">🚪</span> Logout
          </button>
        </nav>
      )}

      <main className="page-shell">{children}</main>
    </div>
  );
}
