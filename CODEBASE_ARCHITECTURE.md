# ChangeAI Codebase Architecture Overview

## 1. QR SCANNER & CAMERA COMPONENTS

### Frontend QR Scanner Components

#### [frontend/src/components/QRSystem.jsx](frontend/src/components/QRSystem.jsx)
- **Purpose**: Main QR scanner hook and QR code generation system using Html5Qrcode library
- **Key Exports**:
  - `useQRScanner()` - Hook for managing QR scanner lifecycle (camera permissions, scan validation, error handling)
  - `QRPaymentScanner` - Component for scanning payment QR codes
  - Nano address validation with URI and nano: protocol support
- **Key Functions**:
  - `validateNanoAddress()` - Validates Nano address format with regex and URI parsing
  - `stopAllMediaTracks()` - Safely stops all camera streams
  - Scan cooldown (2s) and duplicate scan window (10s) handling
  - Camera permission timeout (15s) and restart delay (3s) management
- **Dependencies**:
  - `html5-qrcode` - QR code scanning library
  - `qrcode` - QR code generation library
  - React hooks (useState, useEffect, useRef, useCallback, useMemo)
- **Features**:
  - Nano address regex validation: `nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}`
  - Nano URI format support: `nano:address?param=value`
  - Handles "Account not found" as valid state
  - Permission denial handling with user prompts

#### [frontend/src/stitch/components/QRScanner.jsx](frontend/src/stitch/components/QRScanner.jsx)
- **Purpose**: Simplified QR scanner component using Html5QrcodeScanner
- **Key Exports**:
  - `QRScanner` - Component for basic QR scanning
- **Key Functions**:
  - `onScanSuccess` callback - Triggers when QR code is successfully scanned
- **Dependencies**:
  - `html5-qrcode/Html5QrcodeScanner`
- **Configuration**: 10 fps, 250x250 qrbox

---

## 2. SUBSCRIPTION & BILLING COMPONENTS

### Database Models

#### [backend/models/SubscriptionPlan.js](backend/models/SubscriptionPlan.js)
- **Purpose**: Defines subscription tier plans available for users
- **Schema Fields**:
  - `name`: free_trial, edge, prime, apex (enum)
  - `displayName`, `description`, `price` (USD), `currency`
  - `billingCycle`: monthly, yearly, one_time
  - `features`: 18+ feature flags (aiAssistant, fraudProtection, smartRouting, etc.)
  - `limits`: fxFreeAmount, fxFeeAfterLimit, monthlyCap, aiChatLimit, transactionLimit
  - `isActive`: Boolean
- **Key Features**:
  - Free Trial: $0, 50 AI chats/month, $400 cap
  - Edge: $19.99, 500 AI chats, $800 FX free, 0.95% fee
  - Prime: $29.99, AI Financial Autopilot, smart undo payments
  - Apex: $49.99, advanced features

#### [backend/models/UserSubscription.js](backend/models/UserSubscription.js)
- **Purpose**: Tracks individual user subscription status and usage
- **Schema Fields**:
  - `userId`: Reference to User (unique, indexed)
  - `plan`: free_trial, edge, prime, apex (enum)
  - `status`: active, cancelled, expired, paused, past_due
  - `startedAt`, `currentPeriodStart`, `currentPeriodEnd`, `cancelledAt`, `willCancelAt`
  - `usage`: fxUsedThisMonth, aiChatsThisMonth, transactionsThisMonth, amountSentThisMonth
  - `features`: 14 feature flags matching subscription level
  - `settings`: autoRenew, notifications, budgetAlerts
  - `freeTrial`: activated, activatedAt, clickedActivation, firstTransactionCompleted, expiresAt
  - `paymentSession`: sessionId, status (none|pending|verified|failed|cancelled), planId, createdAt, verifiedAt
- **Indexes**: userId (unique)

#### [backend/models/MerchantSubscription.js](backend/models/MerchantSubscription.js)
- **Purpose**: Tracks merchant-specific subscription and features
- **Schema Fields**:
  - `merchantId`: Reference to User (unique)
  - `tier`: startup, growth, scale, premium, retention, enterprise
  - `status`: active, cancelled, downgraded, upgraded, suspended
  - `revenueTier`: Maps to pricing tier
  - `annualRevenue`: Tracks merchant revenue
  - `features`: 20+ merchant-specific features (aiRevenueBooster, cashFlowPredictor, smartTranscripts, etc.)
  - `startedAt`, `currentPeriodStart`, `currentPeriodEnd`
- **Key Merchant Features**:
  - AI revenue boosting, cash flow prediction
  - Smart transcripts, money monitoring, analytics dashboard
  - Personalized marketing, upsell assistant
  - Customer lifetime value tracking, churn prevention

### API Endpoints

#### [frontend/src/api.js](frontend/src/api.js) - Subscription/Billing APIs
- **Purpose**: Frontend API client for billing and subscription operations
- **Key Exports**:
  - `getCurrentSubscription(token)` - Get current subscription with caching
  - `getSubscriptionUsage(token)` - Get usage metrics (FX used, AI chats, transactions)
  - `getMerchantSubscription(token)` - Get merchant subscription details
  - `getMerchantAnalytics(token)` - Get merchant analytics
  - `getCashFlowPrediction(token)` - Get cash flow data
  - `getLifetimeValueData(token)` - Get LTV data
  - `verifyPayment(token, {paymentSessionId, transactionHash})` - Verify payment
  - `cancelPaymentSession(token)` - Cancel payment session
  - `activateFreeTrial(token)` - Activate free trial
  - `completeFirstTransaction(token)` - Mark first transaction completion
- **Cache Implementation**: Uses `apiCache.js` utility with GET request caching

#### [backend/routes/subscription.js](backend/routes/subscription.js)
- **Purpose**: Express routes for subscription management
- **Endpoints**:
  - `GET /subscription/current` - Get current subscription
  - `GET /subscription/usage` - Get usage statistics
  - Additional endpoints for plan management

#### [backend/routes/billing.js](backend/routes/billing.js)
- **Purpose**: Express routes for billing operations
- **Endpoints**:
  - Payment verification and cancellation
  - Free trial activation
  - Payment session management

### Controllers

#### [backend/controllers/subscriptionController.js](backend/controllers/subscriptionController.js)
- **Purpose**: Handles subscription business logic
- **Key Functions**:
  - Plan configuration (free_trial, edge, prime, apex)
  - Usage tracking and limits enforcement
  - Feature availability based on subscription tier
- **PLANS_CONFIG Structure**:
  - Each plan defines 18+ feature flags
  - FX limits (free amount, fee after limit, monthly cap)
  - AI chat limits
  - Transaction limits

#### [backend/controllers/billingController.js](backend/controllers/billingController.js)
- **Purpose**: Handles billing operations and payment verification
- **Key Exports**:
  - `getPricingPlans()` - Returns available pricing plans with conversion rates
  - `verifyPayment()` - Verify Stripe/payment sessions
  - `activateFreeTrial()` - Activate free trial period
  - `completeFirstTransaction()` - Unlock free trial after first transaction
- **Payment Processing**:
  - Stripe integration with API version 2025-04-30.basil
  - Currency conversion (EUR, USD, etc.)
  - Nano price calculation

### Services

#### [backend/services/subscriptionAutomation.js](backend/services/subscriptionAutomation.js)
- **Purpose**: Automated subscription renewal and lifecycle management
- **Key Class**: `SubscriptionAutomationService`
- **Key Methods**:
  - `start()` - Starts hourly automation check loop
  - `processScheduledRenewals()` - Process subscriptions at renewal time
  - `processRenewal()` - Handle individual subscription renewal
  - `processNanoRenewal()` - Renew via Nano cryptocurrency
  - `processFiatRenewal()` - Renew via fiat currency
  - `checkGracePeriods()` - Monitor grace period expirations
  - `retryFailedRenewals()` - Retry failed renewals with exponential backoff
- **Configuration**:
  - Grace period: 5 days
  - Max retry attempts: 3
  - Retry delays: 1, 2, 3 days
  - Plans: Edge ($19.99), Prime ($29.99), Apex ($49.99)
  - Auto-check interval: 1 hour
- **Dependencies**:
  - Uses `conversionService.js` for Nano/fiat conversion
  - Uses `emailService.js` for notifications
  - Uses UserSubscription, User, Transaction models

#### [backend/services/recommendationEngine.js](backend/services/recommendationEngine.js)
- **Purpose**: Provides plan recommendations and analytics
- **Key Functions**:
  - `getRecommendations()` - Get personalized plan recommendations
  - `getPlanComparison()` - Compare subscription plans
  - `getRenewalReminder()` - Generate renewal notifications
  - `generateFinaMessage()` - AI-generated messages for recommendations

#### [backend/services/conversionService.js](backend/services/conversionService.js)
- **Purpose**: Handles Nano/fiat currency conversion for billing
- **Key Functions**:
  - `convertFiatToNano()` - Convert USD/EUR to Nano
  - `getCurrentRates()` - Get current exchange rates
  - `calculateFee()` - Calculate FX fees based on plan
  - `calculateSavings()` - Calculate user savings

### Frontend Components

#### [frontend/src/components/PricingCheckout.jsx](frontend/src/components/PricingCheckout.jsx)
- **Purpose**: Checkout component for subscription upgrades
- **Props**:
  - `plan`: Selected subscription plan
  - `onSuccess`: Callback after successful purchase
  - `currency`: Payment currency
- **Features**:
  - Plan comparison
  - Payment method selection
  - Price calculation with fees

#### [frontend/src/stitch/screens/PricingScreen.jsx](frontend/src/stitch/screens/PricingScreen.jsx)
- **Purpose**: Main pricing/subscription management screen for users
- **Key State**:
  - `loading`, `currentSubscription`, `clickedPlan`, `activeTab`
  - `goals` - User spending goals
  - `showGoalModal`, `editingGoal`, `goalForm`
- **Features**:
  - Display all subscription tiers
  - Tab switching between consumer/merchant pricing
  - Goal setting and tracking
  - Current subscription display with upgrade/downgrade options

#### [frontend/src/stitch/screens/MerchantPricingScreen.jsx](frontend/src/stitch/screens/MerchantPricingScreen.jsx)
- **Purpose**: Merchant-specific subscription management
- **Key Features**:
  - Merchant tier pricing (startup to enterprise)
  - Revenue tracking
  - Feature display for each tier

---

## 3. STATE MANAGEMENT & CONTEXT

### Frontend State Management (Hook-based)

#### React Hooks Usage Pattern
- **Location**: Frontend uses local component state with React hooks
- **Pattern**: `useState` for local component state, `useRef` for persistent values
- **Examples**:
  - [frontend/src/components/PricingCheckout.jsx](frontend/src/components/PricingCheckout.jsx) - Uses useState for cart/payment state
  - [frontend/src/stitch/screens/PricingScreen.jsx](frontend/src/stitch/screens/PricingScreen.jsx) - Manages subscription, goals, UI state
  - [frontend/src/components/AIAssistant.jsx](frontend/src/components/AIAssistant.jsx) - AI chat state management

#### [frontend/src/utils/storage.js](frontend/src/utils/storage.js)
- **Purpose**: Safe localStorage wrapper with error handling
- **Key Functions**:
  - `safeGetFromStorage()` - Safely retrieve data from localStorage
  - `safeSetStorage()` - Safely store data to localStorage
  - `safeClearStorage()` - Safely clear localStorage
- **Use Cases**: Token persistence, subscription state, user preferences

#### [frontend/src/utils/apiCache.js](frontend/src/utils/apiCache.js)
- **Purpose**: Client-side API response caching
- **Key Functions**:
  - `getCachedData(key)` - Retrieve cached API responses
  - `setCachedData(key, data)` - Cache API responses
  - `withRetry()` - Retry logic wrapper
  - `updateAuthToken()` - Update cached auth token
- **Cache Strategy**: GET request responses cached with invalidation

### Payment Context (Prop Drilling)
- **Pattern**: Context passed as props through component tree
- **Examples**:
  - `paymentContext` prop in [frontend/src/components/AIAssistant.jsx](frontend/src/components/AIAssistant.jsx)
  - `paymentContext: appPaymentContext` in [frontend/src/stitch/screens/SendScreen.jsx](frontend/src/stitch/screens/SendScreen.jsx)
- **Data Passed**: Payment status, current subscription, billing info

### App Root State Management

#### [frontend/src/App.jsx](frontend/src/App.jsx)
- **Purpose**: Root component managing global app state
- **Key State**:
  - Authentication state (token, user profile)
  - Loading and error states
  - Current route and navigation
- **State Hooks**:
  - `useState` for auth, profile, loading
  - `useCallback` for auth handlers
  - `useMemo` for computed values
  - `useRef` for tracking previous values

---

## 4. API INTEGRATION POINTS

### Frontend API Client

#### [frontend/src/api.js](frontend/src/api.js) - Complete API Integration
- **Base URL**: `https://changeaipay.onrender.com` (or VITE_API_BASE_URL)
- **Request Timeout**: 15 seconds
- **Token Management**:
  - `getToken()` - Retrieve stored JWT
  - `setToken(token)` - Store JWT to localStorage
  - `clearToken()` - Remove JWT from storage
  - Token key: `changeaipay_token`

**API Sections**:

1. **Auth APIs**:
   - `POST /auth/login` - Login with email/password
   - `POST /auth/register` - Register new user
   
2. **User APIs**:
   - `GET /user/profile` - Get user profile (no cache)
   
3. **Transaction APIs**:
   - `POST /transaction/send` - Send transaction
   - `GET /transaction/history` - Get transaction history (cached, limit param)
   - Alias: `getPaymentHistory()` for backward compatibility
   
4. **Subscription APIs** (with caching):
   - `GET /subscription/current` - Current subscription
   - `GET /subscription/usage` - Usage metrics
   - `GET /merchant-subscription/current` - Merchant subscription
   - `GET /merchant-subscription/analytics` - Merchant analytics
   - `GET /merchant-subscription/cashflow` - Cash flow prediction
   - `GET /merchant-subscription/ltv` - Lifetime value data
   
5. **AI APIs**:
   - `POST /ai/chat` - Send AI message with context
   - `GET /ai/history` - Get conversation history
   
6. **Billing APIs**:
   - `POST /billing/verify-payment` - Verify payment with sessionId and transactionHash
   - `POST /billing/cancel-payment` - Cancel payment session
   - `POST /billing/activate-free-trial` - Activate free trial
   - `POST /billing/complete-first-transaction` - Mark first transaction
   
7. **Waitlist APIs**:
   - `POST /waitlist` - Join waitlist with email/phone

**Error Handling**:
- Timeout errors: "Request timeout. Please check your connection and try again."
- HTTP errors: Custom error objects with status, details
- Network errors: AbortError caught and converted to timeout message

### Backend Routes & Controllers

#### [backend/routes/auth.routes.js](backend/routes/auth.routes.js) -> [backend/controllers/authController.js](backend/controllers/authController.js)
- **Endpoints**:
  - `POST /auth/register` - User registration with email/password validation
  - `POST /auth/login` - User login returns JWT token
  - `POST /auth/logout` - Session termination
- **Exports**:
  - `register()` - Registration handler
  - `login()` - Login handler
  - `logout()` - Logout handler
- **Features**:
  - Nano wallet auto-creation on registration
  - JWT signing with expiration
  - User role support: user, merchant, admin
  - Password validation (min 8 chars)
  - Email format validation

#### [backend/routes/transaction.js](backend/routes/transaction.js)
- **Endpoints**:
  - `POST /transaction/send` - Send transaction (auth required)
  - `GET /transaction/history` - Get transaction history (auth required, limit param)
  - `GET /transaction/:id/status` - Get transaction status
- **Middleware**: 
  - `auth` - JWT authentication
  - `safeRoute` - Error wrapping
- **Controller**: [backend/controllers/transactionController.js](backend/controllers/transactionController.js)
  - `send()` - Process transaction
  - `history()` - Fetch user transaction history
  - `status()` - Check transaction status

#### [backend/routes/payments.js](backend/routes/payments.js)
- **Endpoints**:
  - `POST /payment/send` - Send payment
  - `POST /payment/request` - Request payment
  - `GET /payment/history` - Payment history
  - `GET /payment/:id` - Transaction details
  - `POST /payment/verify-recipient` - Verify recipient
  - `POST /payment/convert` - Calculate FX
  - `POST /payment/route` - Get smart routing
  - `POST /payment/:id/undo` - Undo payment
  - `GET /payment/:id/transcript` - Get payment transcript
- **Middleware**: `authMiddleware`
- **Controller**: [backend/controllers/paymentController.js](backend/controllers/paymentController.js)

#### [backend/routes/wallet.js](backend/routes/wallet.js)
- **Endpoints**:
  - `POST /wallet/retry/:userId` - Retry wallet provisioning
- **Queue Integration**: Uses `walletQueue` service for async wallet creation

#### [backend/routes/subscription.js](backend/routes/subscription.js)
- **Routes**: Subscription management endpoints

#### [backend/routes/billing.js](backend/routes/billing.js)
- **Routes**: Payment verification and billing operations

#### [backend/routes/ai.js](backend/routes/ai.js)
- **Routes**: AI chat and recommendations endpoints

#### [backend/routes/waitlist.js](backend/routes/waitlist.js)
- **Routes**: Waitlist management endpoints

#### [backend/routes/webhook.js](backend/routes/webhook.js)
- **Routes**: External webhook handlers (Stripe, blockchain events)

---

## 5. AUTHENTICATION FLOW COMPONENTS

### Frontend Authentication

#### [frontend/src/stitch/screens/LoginScreen.jsx](frontend/src/stitch/screens/LoginScreen.jsx)
- **Purpose**: Login/registration UI component
- **Props**:
  - `mode`: 'login' | 'register'
  - `loading`: Boolean loading state
  - `error`: Error message display
  - `onSubmit`: Form submission handler
- **Features**:
  - Email/password validation
  - Mode switching between login and register
  - Error display
  - Loading spinner

#### [frontend/src/stitch/components/ProtectedRoute.jsx](frontend/src/stitch/components/ProtectedRoute.jsx)
- **Purpose**: Route guard component requiring authentication
- **Logic**:
  - Checks for valid JWT token
  - Redirects to login if not authenticated
  - Renders protected component if authenticated

#### [frontend/src/App.jsx](frontend/src/App.jsx) - Authentication Flow
- **Key Functions**:
  - Manages login/register submission
  - Token storage and retrieval
  - User profile fetching after authentication
  - Route protection and redirects
- **Authentication State**:
  - `token` - JWT token from login
  - `profile` - User profile data
  - `authStatus` - Loading, error states
- **Flow**:
  1. User submits login/register
  2. API call returns JWT
  3. Token stored in localStorage
  4. User profile fetched
  5. Redirect to dashboard

### Backend Authentication

#### [backend/middleware/auth.js](backend/middleware/auth.js)
- **Purpose**: JWT verification middleware
- **Key Function**: `auth(req, res, next)`
- **Process**:
  1. Extract Bearer token from Authorization header
  2. Verify token using JWT secret
  3. Extract userId from token payload (`sub`, `userId`, or `id`)
  4. Attach user object to `req.user`
  5. Call next() or return 401 error
- **Error Cases**:
  - Missing token: 401 "No authentication token"
  - Invalid/expired token: 401 "Token is not valid"

#### [backend/middleware/security.js](backend/middleware/security.js)
- **Purpose**: Enhanced security middleware
- **Exports**:
  - `authMiddleware` - Enhanced auth with user lookup
  - `roleMiddleware(...roles)` - Role-based access control
  - `securityHeaders` - Security headers middleware
  - `inputSanitization` - Input validation middleware
- **Features**:
  - User status checking (active vs suspended)
  - Role-based authorization
  - Request logging and error handling

#### [backend/controllers/authController.js](backend/controllers/authController.js)
- **Purpose**: Authentication controller logic
- **Key Functions**:
  - `register()` - Handle user registration
  - `login()` - Handle user login
  - `logout()` - Handle logout
- **Token Generation**:
  - `signToken(userId)` - Create JWT with expiration
  - JWT payload: `{ sub: userId }` (subject claim)
  - Expiration: 7 days (or config.jwt.expiry)
- **User Serialization**:
  - `serializeUser()` - Return public user fields
  - `serializeAuthUser()` - Return minimal auth fields

#### [backend/models/User.js](backend/models/User.js) - User Schema
- **Core Fields**:
  - `email`: String (required, unique, lowercase, indexed)
  - `password`: String (required, min 8 chars, select=false)
  - `name`: String (required)
  - `role`: enum [user, merchant, admin] (default: user)
  - `walletAddress`: String (sparse, unique)
  - `walletPrivateKey`: String (select=false)
  - `walletId`: String
  - `walletStatus`: pending, active, failed
  - `walletCreatedAt`: Date
  - `status`: active, suspended, banned
- **Profile Fields**:
  - `profile.avatar`, `profile.phone`, `profile.country`, `profile.timezone`
- **Preferences**:
  - `preferences.notifications` - email, push, SMS
  - `preferences.currency` - default "XNO"
  - `preferences.language` - default "en"
  - `preferences.theme` - light, dark, system
- **Verification**:
  - `verification.emailVerified`, `verification.identityVerified`
  - `verification.kycLevel` - 0-3
- **Security**: Indexes on email, walletAddress, createdAt

---

## 6. DATABASE MODELS & SERVICES

### Database Models

#### [backend/models/User.js](backend/models/User.js)
- **Collections**: Users
- **Key Indexes**: email (unique), walletAddress (sparse unique), createdAt
- **Relations**:
  - Has many Transactions (userId)
  - Has one UserSubscription (userId)
  - Has one MerchantSubscription (merchantId for merchants)

#### [backend/models/Transaction.js](backend/models/Transaction.js)
- **Purpose**: Track all user transactions (send, receive, change blocks)
- **Schema**:
  - `userId`: Reference to User (indexed)
  - `type`: send, receive, receive_pending, change, receive_invalid
  - `direction`: incoming, outgoing
  - `amount`, `amountRaw`: Transaction amounts (raw Nano format)
  - `currency`: default "XNO"
  - `fromAddress`, `toAddress`: Nano addresses
  - `hash`: Transaction hash (unique, sparse, indexed)
  - `status`: pending, confirmed, failed, expired (indexed)
  - `confirmations`: Number of block confirmations
  - `block`, `representative`, `signature`: Nano block data
  - `metadata.description`: User-added description
  - `createdAt`, `updatedAt`
- **Indexes**: userId, hash, status, createdAt

#### [backend/models/SubscriptionPlan.js](backend/models/SubscriptionPlan.js)
- **Purpose**: Subscription tier definitions
- **Plans**: free_trial, edge, prime, apex (unique enum)
- **Features**: 18 feature flags per plan
- **Limits**: FX amounts, fees, caps, AI chat limits
- **Pricing**: USD amounts, billing cycles

#### [backend/models/UserSubscription.js](backend/models/UserSubscription.js)
- **Purpose**: User subscription tracking and usage
- **Relations**: One to one with User (unique userId)
- **Usage Tracking**: Monthly FX, AI chats, transactions, amount sent
- **Features**: Feature flags matching subscription tier
- **Free Trial**: Activation tracking, expiration dates
- **Payment Session**: Stripe session tracking for payments

#### [backend/models/MerchantSubscription.js](backend/models/MerchantSubscription.js)
- **Purpose**: Merchant-tier specific subscription
- **Tiers**: startup, growth, scale, premium, retention, enterprise
- **Features**: 20 merchant-specific features (revenue boosting, analytics, pricing engines, etc.)
- **Revenue Tracking**: annualRevenue field for tier matching

#### [backend/models/WaitlistEntry.js](backend/models/WaitlistEntry.js)
- **Purpose**: Track waitlist signups
- **Fields**: email, phone, createdAt
- **Relations**: References to Waitlist

#### [backend/models/Waitlist.js](backend/models/Waitlist.js)
- **Purpose**: Waitlist campaign/batch tracking
- **Fields**: Campaign metadata, entries count, dates

#### [backend/models/WalletJob.js](backend/models/WalletJob.js)
- **Purpose**: Queue for async wallet creation
- **Fields**: userId, status (pending, completed, failed), attempt count, error logs

### Core Blockchain Services

#### [backend/services/rpcClient.js](backend/services/rpcClient.js)
- **Purpose**: Nano RPC client with failover and node health tracking
- **RPC Nodes**: Multiple hardened nodes with fallback
  - Default: rpc.nano.to, proxy.nanos.cc, node.somenano.com
  - Configurable via RPC_NODES env var
- **Key Features**:
  - Node health tracking (failures, successes, recovery timing)
  - Automatic node failover on failure threshold (3 failures)
  - 30s recovery time before retrying failed nodes
  - Request timeout: 10s (configurable, minimum 1s)
  - JSON parsing safety (uses text() not json())
  - No private key exposure
- **Key Functions**:
  - `callRpc(action, params)` - Call RPC with failover
  - `isNodeHealthy(url)` - Check node health status
  - `getNodeHealth()` - Return health stats for all nodes
  - `testRpcNodes()` - Test node connectivity
- **RPC Actions Supported**: account_balance, block_info, process, etc.

#### [backend/services/nano.js](backend/services/nano.js)
- **Purpose**: Low-level Nano wallet operations
- **Safety Rules Enforced**:
  - Never expose private keys in logs
  - Never return raw seed phrases to frontends
  - Always handle "Account not found" as valid state
  - Always fail gracefully on RPC errors
  - Always validate inputs (address format, keys, amounts)
  - Always verify balance BEFORE attempting send
  - Always reject sends from uninitialized accounts
- **Key Functions**:
  - `nanoToRaw(amount)` - Convert Nano to raw (1 Nano = 10^30 raw)
  - `rawToNano(raw)` - Convert raw to Nano
  - `createWalletAndAccount()` - Generate new wallet
  - `sendFromWallet(fromPrivate, fromAddress, toAddress, amountRaw)` - Send transaction
  - `getAccountBalance(address)` - Get account balance
  - `waitForConfirmation(hash, maxAttempts)` - Monitor transaction confirmation
  - `generateReceiveBlock(address)` - Create receive block for pending transactions
  - `getBlockInfo(hash)` - Get block details
- **Error Types**:
  - INSUFFICIENT_BALANCE
  - ACCOUNT_NOT_OPENED
  - RPC_FAILED
  - INVALID_INPUT
  - BLOCK_FAILURE

#### [backend/services/nanoWallet.js](backend/services/nanoWallet.js)
- **Purpose**: High-level wallet wrapper with structured responses
- **Key Functions**:
  - `getBalance(account)` - Get balance with state classification
  - `confirmTransaction(hash)` - Confirm transaction status
- **Wallet States**:
  - not_activated - Account created but empty
  - needs_funding - Account needs initial funding
  - ready - Account has balance
  - failed - RPC/network error
- **Error Handling**: Structured error responses with classification

#### [backend/services/walletQueue.js](backend/services/walletQueue.js)
- **Purpose**: Queue system for async wallet provisioning
- **Features**:
  - `retryWalletForUser(userId)` - Retry wallet creation for user
  - Handles failed wallet creation attempts
  - Uses WalletJob model to track state

### Advanced Services

#### [backend/services/aiService.js](backend/services/aiService.js)
- **Purpose**: AI financial assistant for chat and recommendations
- **Intent Detection**:
  - send, receive, balance, history, split, convert, insight, help, recommendation, general
  - Pattern-based intent matching
- **Key Functions**:
  - `detectIntent(message)` - Classify message intent
  - `extractAmount(message)` - Parse amounts from text (supports $, USD, EUR, XNO)
  - `extractRecipient(message)` - Parse recipient names
  - `processMessage(userId, message, context)` - Process AI request
  - `getOrCreateConversation(userId)` - Manage conversation history
  - `getOrCreateUserContext(userId)` - Track user context
- **Conversations**: In-memory storage with timestamp tracking
- **Amount Extraction Patterns**:
  - Currency prefix: $100, USD 100, EUR 50
  - Amount range: 1000, 1,000.50, 100.99
  - Nano amounts: "100 XNO", "50 nano"

#### [backend/services/fraudDetection.js](backend/services/fraudDetection.js)
- **Purpose**: Transaction fraud analysis and risk scoring
- **Risk Factors** (weighted):
  - Velocity (30%) - Transaction frequency
  - Amount Anomaly (25%) - Unusual amounts
  - Geo Anomaly (20%) - Location changes
  - New Account (15%) - Account age
  - Micro Transactions (10%) - Suspicious patterns
  - Time Pattern (10%) - Unusual timing
  - Device Fingerprint (15%) - Device changes
  - Recipient Risk (20%) - Recipient profile
- **Risk Thresholds**:
  - Max daily transactions: 50
  - Max hourly transactions: 15
  - Max daily amount: $10,000
  - High risk score: 70+
  - Medium risk score: 40+
- **Key Functions**:
  - `analyzeTransaction(userId, transactionData)` - Score transaction
  - `checkVelocity(userId)` - Check transaction frequency
  - Various risk factor checkers
- **Output**: Risk score, factors list, recommendations, auto-block flag

#### [backend/services/conversionService.js](backend/services/conversionService.js)
- **Purpose**: Fiat/Nano currency conversion
- **Key Functions**:
  - `convertFiatToNano(fiatAmount, currency)` - Convert fiat to Nano
  - `getCurrentRates()` - Get current exchange rates
  - `calculateFee(amount, planType)` - Calculate FX fee based on subscription
  - `calculateSavings(usage, plan)` - Calculate user savings
  - `lockConversion()` - Lock rate for transaction

#### [backend/services/subscriptionAutomation.js](backend/services/subscriptionAutomation.js)
- **Automated Tasks**:
  - Hourly check for subscription renewals
  - Process expired subscriptions
  - Handle grace periods (5 days)
  - Retry failed renewals (3 attempts with exponential backoff)
- **Payment Methods**:
  - Nano cryptocurrency payments
  - Fiat (Stripe) payments
- **Service Export**: Singleton instance for app-wide use

#### [backend/services/emailService.js](backend/services/emailService.js)
- **Purpose**: Email notifications
- **Configuration**:
  - Nodemailer transport (SMTP or simulated)
  - Uses config.smtp for credentials
- **Key Functions**:
  - `sendEmail(to, subject, html)` - Send email
  - `sendTransactionReceipt(user, transaction)` - Transaction receipts
  - Various notification emails
- **Production Mode**: Uses real SMTP if configured, simulates otherwise

#### [backend/services/webhookService.js](backend/services/webhookService.js)
- **Purpose**: External webhook handling (Stripe, blockchain events)
- **Key Features**:
  - Event signature verification (HMAC-SHA256)
  - Duplicate event prevention (5-minute window)
  - Timestamp validation
- **Key Functions**:
  - `generateSignature(payload, timestamp)` - Create webhook signature
  - `verifySignature(payload, signature, timestamp)` - Verify webhook authenticity
  - `isEventProcessed(eventId)` - Prevent duplicate processing
- **Security**: 300s timestamp tolerance

#### [backend/services/websocket.js](backend/services/websocket.js)
- **Purpose**: Real-time WebSocket communication
- **Features**:
  - Real-time notifications
  - Live transaction updates
  - Connection management

#### [backend/services/notificationService.js](backend/services/notificationService.js)
- **Purpose**: Multi-channel notifications
- **Channels**: Email, push, SMS (based on user preferences)
- **Types**: Transaction alerts, subscription updates, fraud alerts

#### [backend/services/logger.js](backend/services/logger.js)
- **Purpose**: Structured logging
- **Key Exports**:
  - `logger.info()`, `logger.error()`, `logger.warn()`
  - `requestLogger` - Middleware for request logging
  - `errorLogger` - Middleware for error logging
- **Features**: Structured logging with metadata, timestamp tracking

#### [backend/services/recommendationEngine.js](backend/services/recommendationEngine.js)
- **Purpose**: Personalized recommendations
- **Key Functions**:
  - `getRecommendations()` - Plan recommendations
  - `getPlanComparison()` - Plan comparison data
  - `getRenewalReminder()` - Renewal notifications
  - `generateFinaMessage()` - AI-generated messages
  - `PLANS_CONFIG` - Plan definitions

---

## 7. ARCHITECTURE PATTERNS & KEY INTERCONNECTIONS

### Authentication Flow
```
LoginScreen → api.login() → POST /auth/login → authController.login()
↓
JWT generated and returned
↓
setToken(jwt) → localStorage
↓
getUserProfile(token) → API calls attach Bearer token
↓
auth.js middleware verifies JWT
↓
req.user populated for protected routes
```

### Subscription Flow
```
PricingScreen → getCurrentSubscription() → GET /subscription/current
↓
Cached response shows current plan
↓
User upgrades plan
↓
billingController.verifyPayment() → Stripe verification
↓
subscriptionAutomation.processRenewal() → Updates UserSubscription
↓
Features unlocked based on plan tier
```

### Transaction Flow
```
SendScreen → sendTransaction(token, payload)
↓
POST /transaction/send → transactionController.send()
↓
fraudDetection.analyzeTransaction() → Risk assessment
↓
nano.sendFromWallet() → Nano RPC call with failover
↓
nanoWallet.confirmTransaction() → Monitor confirmations
↓
Transaction saved to DB
↓
emailService.sendTransactionReceipt()
```

### Wallet Provisioning Flow
```
authController.register() creates user
↓
nano.createWalletAndAccount() → RPC call to create account
↓
If fails → walletQueue.push(job)
↓
subscriptionAutomation/walletQueue periodically retries
↓
On success → User.walletAddress populated
```

### QR Scanner Flow
```
QRSystem (hook-based)
↓
useQRScanner({ onScan, onError })
↓
Html5Qrcode library manages camera
↓
validateNanoAddress(qrText)
↓
Extract nano: URI or raw address
↓
onScan callback with validated address
↓
SendScreen uses address for transaction
```

### Key Dependencies
- **Frontend**: React Router, html5-qrcode, Fetch API
- **Backend**: Express, Mongoose, JWT, Stripe, Nano RPC, Nodemailer
- **Blockchain**: Nano RPC nodes (hardened, with failover)
- **Payment**: Stripe integration with currency conversion
- **Email**: Nodemailer with SMTP or simulation mode
