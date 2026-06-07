import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";

import {
  clearToken,
  getToken,
  getTransactionHistory,
  getUserProfile,
  login,
  register,
  sendTransaction,
  setToken
} from "./api";

import AppLayout from "./stitch/components/AppLayout";
import ProtectedRoute from "./stitch/components/ProtectedRoute";
import LoginScreen from "./stitch/screens/LoginScreen";
import WaitlistScreen from "./stitch/screens/WaitlistScreen";
import { QRPaymentScanner } from "./components/QRSystem";
import AIAssistant from "./components/AIAssistant";
import { UserOnboarding, MerchantOnboarding } from "./components/OnboardingFlow";
import ErrorBoundary from "./utils/errorBoundary";
import { safeGetFromStorage, safeSetStorage, safeClearStorage } from "./utils/storage";

const UserDashboard = React.lazy(() => import("./components/UserDashboard"));
const MerchantDashboard = React.lazy(() => import("./components/MerchantDashboard"));
const AdminDashboard = React.lazy(() => import("./components/AdminDashboard"));
const PricingScreen = React.lazy(() => import("./stitch/screens/PricingScreen"));
const MerchantPricingScreen = React.lazy(() => import("./stitch/screens/MerchantPricingScreen"));
const SendScreen = React.lazy(() => import("./stitch/screens/SendScreen"));
const PricingCheckout = React.lazy(() => import("./components/PricingCheckout"));
const HistoryScreen = React.lazy(() => import("./stitch/screens/HistoryScreen"));
const ReceiveScreen = React.lazy(() => import("./stitch/screens/ReceiveScreen"));

const LoadingFallback = React.memo(() => (
  <div className="loading-spinner" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
    <div className="spinner" />
  </div>
));

const LazyWrapper = React.memo(({ children }) => (
  <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
));

function LoginGate({ mode, authStatus, onSubmit }) {
  const location = useLocation();
  const from = location.state?.from || "/dashboard";
  const redirectTo = useMemo(() => (typeof from === "string" ? from : "/dashboard"), [from]);

  return (
    <LoginScreen
      mode={mode}
      loading={authStatus.loading}
      error={authStatus.error}
      onSubmit={(payload) => onSubmit(payload, redirectTo)}
    />
  );
}

function WelcomeMessage({ profile }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (profile?.user?.name) {
      setMessage(`Welcome to ChangeAIPay, ${profile.user.name.split(" ")[0]}!`);
      setVisible(true);

      const welcomeTimer = setTimeout(() => {
        setMessage("Thanks for using ChangeAIPay!");
      }, 2000);

      const closeTimer = setTimeout(() => {
        setVisible(false);
      }, 4000);

      return () => {
        clearTimeout(welcomeTimer);
        clearTimeout(closeTimer);
      };
    }
  }, [profile?.user?.name]);

  if (!visible) return null;

  return (
    <div className={`welcome-overlay ${visible ? "visible" : ""}`}>
      <div className="welcome-card">
        <p className="welcome-text">{message}</p>
      </div>
    </div>
  );
}

function CheckoutRouteWrapper({ profile, loadProfile, onNavigate }) {
  const { plan } = useParams();
  const handleComplete = useCallback((result) => {
    loadProfile();
    onNavigate("/dashboard");
  }, [loadProfile, onNavigate]);

  const handleCancel = useCallback(() => onNavigate("/pricing"), [onNavigate]);

  return (
    <PricingCheckout
      selectedPlan={plan}
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  );
}

const MemoizedLoginGate = React.memo(LoginGate);
const MemoizedWaitlistScreen = React.memo(WaitlistScreen);
const MemoizedQRPaymentScanner = React.memo(QRPaymentScanner);
const MemoizedCheckoutRouteWrapper = React.memo(CheckoutRouteWrapper);

function App() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const stableNavigate = useCallback((...args) => navigateRef.current(...args), []);

  // Initialize state safely from storage with proper defaults
  const [token, setTokenState] = useState(() => {
    const cached = safeGetFromStorage("changeaipay_session", null, true);
    if (cached?.token && cached?.expires && Date.now() < cached.expires) {
      return cached.token;
    }
    safeClearStorage("changeaipay_session", true);
    return getToken() || "";
  });

  const [profile, setProfile] = useState(() => {
    const cached = safeGetFromStorage("changeaipay_profile", null, true);
    return cached || null;
  });

  const [bootStatus, setBootStatus] = useState(token ? "loading" : "idle");
  const [authStatus, setAuthStatus] = useState({ loading: false, error: "" });
  const [onboardingComplete, setOnboardingComplete] = useState(
    safeGetFromStorage("changeaipay_onboarding", false) === true
  );
  const [paymentContext, setPaymentContext] = useState(() => {
    return safeGetFromStorage("changeaipay_payment_context", null, false);
  });

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const bootTimeoutRef = useRef(null);
  const justLoggedInRef = useRef(false);

  const cacheProfile = useCallback((data) => {
    const normalized = data || {};
    // Ensure role is accessible at top level (not just nested in user)
    if (normalized.user && !normalized.role) {
      normalized.role = normalized.user.role;
    }
    setProfile(normalized);
    safeSetStorage("changeaipay_profile", normalized, true);
  }, []);

  const cacheSession = useCallback((t) => {
    const session = { token: t, expires: Date.now() + 24 * 60 * 60 * 1000 };
    safeSetStorage("changeaipay_session", session, true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState("");
    setProfile(null);
    safeClearStorage("changeaipay_session", true);
    safeClearStorage("changeaipay_profile", true);
    navigate("/login");
  }, [navigate]);

  const fetchProfile = useCallback(async (authToken) => {
    if (!authToken) return null;
    try {
      const data = await getUserProfile(authToken);
      cacheProfile(data);
      return data;
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        clearToken();
        setTokenState("");
        setProfile(null);
        safeClearStorage("changeaipay_session", true);
        safeClearStorage("changeaipay_profile", true);
      }
      throw err;
    }
  }, [cacheProfile]);

  const loadProfile = useCallback(async (forceRefresh = false) => {
    if (!token) return null;
    if (!forceRefresh && profileRef.current) return profileRef.current;
    return fetchProfile(token);
  }, [token, fetchProfile]);

  const loadHistory = useCallback(
    async ({ limit } = {}) => {
      if (!token) throw new Error("Missing token");
      return getTransactionHistory(token, { limit });
    },
    [token]
  );

  // Boot auth on mount and token change - with timeout protection
  useEffect(() => {
    if (!token) {
      setBootStatus("idle");
      return;
    }

    // If we just completed login, skip loading and go straight to ready
    if (justLoggedInRef.current) {
      justLoggedInRef.current = false;
      setBootStatus("ready");
      return;
    }

    // If profile already cached, skip loading
    if (profileRef.current) {
      setBootStatus("ready");
      return;
    }

    setBootStatus("loading");

    bootTimeoutRef.current = setTimeout(() => {
      setBootStatus("ready");
    }, 10000);

    fetchProfile(token)
      .then(() => {
        if (bootTimeoutRef.current) {
          clearTimeout(bootTimeoutRef.current);
          bootTimeoutRef.current = null;
        }
        setBootStatus("ready");
      })
      .catch(() => {
        if (bootTimeoutRef.current) {
          clearTimeout(bootTimeoutRef.current);
          bootTimeoutRef.current = null;
        }
        setProfile(null);
        setBootStatus("idle");
        clearToken();
        setTokenState("");
        safeClearStorage("changeaipay_session", true);
        safeClearStorage("changeaipay_profile", true);
      });

    return () => {
      if (bootTimeoutRef.current) {
        clearTimeout(bootTimeoutRef.current);
        bootTimeoutRef.current = null;
      }
    };
  }, [token, fetchProfile]);

  const storePaymentContext = useCallback((context) => {
    safeSetStorage("changeaipay_payment_context", { ...context, savedAt: new Date().toISOString() }, false);
    setPaymentContext(context);
  }, []);

  const clearPaymentContext = useCallback(() => {
    safeClearStorage("changeaipay_payment_context", false);
    setPaymentContext(null);
  }, []);

  const handleAuthSubmit = useCallback(
    async (mode, payload, redirectTo) => {
      setAuthStatus({ loading: true, error: "" });
      try {
        const data = mode === "register" ? await register(payload) : await login(payload);
        const nextToken = data?.token || "";
        if (!nextToken) throw new Error("Missing token from server");

        setToken(nextToken);
        cacheSession(nextToken);

        const profileData = await fetchProfile(nextToken);
        if (!profileData) {
          throw new Error("Failed to load profile");
        }

        // Mark that we just logged in so boot effect skips loading
        justLoggedInRef.current = true;
        setAuthStatus({ loading: false, error: "" });
        setTokenState(nextToken);
        navigate(redirectTo || "/dashboard", { replace: true });
      } catch (err) {
        setAuthStatus({ loading: false, error: err?.message || "Authentication failed" });
      }
    },
    [navigate, cacheSession, cacheProfile]
  );

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem("changeaipay_onboarding", "true");
    setOnboardingComplete(true);
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  const handleSelectPlan = useCallback((planId) => navigate(`/checkout/${planId}`), [navigate]);
  const handleCheckoutCancel = useCallback(() => navigate("/pricing"), [navigate]);
  const handleQRPaymentReady = useCallback((payment) => {
    storePaymentContext(payment);
    navigate("/send", { state: payment });
  }, [navigate, storePaymentContext]);
  const handleQRCancel = useCallback(() => navigate("/dashboard"), [navigate]);
  const handleSendTransaction = useCallback((payload) => {
    if (!token) throw new Error("Missing token");
    return sendTransaction(token, payload);
  }, [token]);
  const handleCheckoutComplete = useCallback((result) => {
    loadProfile(true);
    navigate("/dashboard");
  }, [loadProfile, navigate]);

  const memoizedCheckoutWrapper = useMemo(() => (
    <MemoizedCheckoutRouteWrapper
      profile={profile}
      loadProfile={() => loadProfile(true)}
      onNavigate={navigate}
    />
  ), [profile, loadProfile, navigate]);

  const memoizedSendTransaction = useMemo(() => (
    <SendScreen
      paymentContext={paymentContext}
      onClearContext={clearPaymentContext}
      sendTransaction={handleSendTransaction}
    />
  ), [paymentContext, clearPaymentContext, handleSendTransaction]);

  const handleLoginSubmit = useCallback((payload, redirectTo) =>
    handleAuthSubmit("login", payload, redirectTo), [handleAuthSubmit]);
  const handleRegisterSubmit = useCallback((payload, redirectTo) =>
    handleAuthSubmit("register", payload, redirectTo), [handleAuthSubmit]);

  const memoizedLoginRoute = useMemo(() => (
    <MemoizedLoginGate
      mode="login"
      authStatus={authStatus}
      onSubmit={handleLoginSubmit}
    />
  ), [authStatus, handleLoginSubmit]);

  const memoizedRegisterRoute = useMemo(() => (
    <MemoizedLoginGate
      mode="register"
      authStatus={authStatus}
      onSubmit={handleRegisterSubmit}
    />
  ), [authStatus, handleRegisterSubmit]);

  const dashboardContent = useMemo(() => {
    if (profile?.role === "admin") {
      return <AdminDashboard token={token} onNavigate={stableNavigate} />;
    }
    if (profile?.role === "merchant") {
      return (
        <MerchantDashboard
          profile={profile}
          token={token}
          loadHistory={loadHistory}
          onNavigate={stableNavigate}
        />
      );
    }
    return (
      <UserDashboard
        profile={profile}
        token={token}
        loadHistory={loadHistory}
        onNavigate={stableNavigate}
      />
    );
  }, [profile, token, loadHistory, stableNavigate]);

  return (
    <ErrorBoundary>
      <AIAssistant userId={profile?.id} subscription={profile?.subscription} paymentContext={paymentContext} onNavigate={navigate} />
      <WelcomeMessage profile={profile} />
      <Routes>
        <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} />} />

        <Route
          path="/login"
          element={
            token ? (
              <Navigate to="/dashboard" />
            ) : (
              memoizedLoginRoute
            )
          }
        />

        <Route
          path="/register"
          element={
            token ? (
              <Navigate to="/dashboard" />
            ) : (
              memoizedRegisterRoute
            )
          }
        />

        <Route path="/waitlist" element={<MemoizedWaitlistScreen />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                <LazyWrapper>{dashboardContent}</LazyWrapper>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/pricing"
          element={
            token ? (
              <ProtectedRoute bootStatus={bootStatus} token={token}>
                <AppLayout profile={profile} onLogout={logout}>
                  <LazyWrapper>
                    <PricingScreen
                      currentPlan={profile?.subscription?.plan}
                      onSelectPlan={handleSelectPlan}
                      onNavigate={navigate}
                      userRole={profile?.role}
                    />
                  </LazyWrapper>
                </AppLayout>
              </ProtectedRoute>
            ) : (
              <PricingScreen
                currentPlan="free_trial"
                onSelectPlan={() => navigate("/login")}
                onNavigate={navigate}
                userRole="user"
              />
            )
          }
        />

        <Route
          path="/checkout/:plan"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                <LazyWrapper>
                  {memoizedCheckoutWrapper}
                </LazyWrapper>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/merchant-pricing"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                <LazyWrapper>
                  <MerchantPricingScreen onNavigate={navigate} />
                </LazyWrapper>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/qr"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                <MemoizedQRPaymentScanner
                  onPaymentReady={handleQRPaymentReady}
                  onCancel={handleQRCancel}
                  walletAddress={profile?.walletAddress || profile?.user?.walletAddress || profile?.balance?.walletAddress || ""}
                />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                {profile?.role === "admin" ? (
                  <LazyWrapper>
                    <AdminDashboard token={token} onNavigate={stableNavigate} />
                  </LazyWrapper>
                ) : (
                  <div className="access-denied card glass-card">
                    <h1>Access Denied</h1>
                    <p>This area is reserved for admin users.</p>
                  </div>
                )}
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/onboarding"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                {profile?.role === "merchant" ? (
                  <MerchantOnboarding
                    onComplete={handleOnboardingComplete}
                    businessInfo={profile?.user}
                  />
                ) : (
                  <UserOnboarding onComplete={handleOnboardingComplete} />
                )}
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/send"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                <LazyWrapper>
                  {memoizedSendTransaction}
                </LazyWrapper>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                <LazyWrapper>
                  <HistoryScreen token={token} loadHistory={loadHistory} />
                </LazyWrapper>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/receive"
          element={
            <ProtectedRoute bootStatus={bootStatus} token={token}>
              <AppLayout profile={profile} onLogout={logout}>
                <LazyWrapper>
                  <ReceiveScreen profile={profile} onNavigate={navigate} />
                </LazyWrapper>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
