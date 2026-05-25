# ChangeAIPay Performance Optimization - Implementation Guide

## Quick Reference

### New Utilities & How to Use Them

#### 1. Storage Utilities (`src/utils/storage.js`)
Safe access to localStorage/sessionStorage without hydration mismatches.

**Example:**
```javascript
import { safeGetFromStorage, safeSetStorage, safeClearStorage } from './utils/storage';

// Get with default value
const token = safeGetFromStorage('token', 'default_value');

// Set value (returns boolean for success)
const success = safeSetStorage('key', { data: 'value' });

// Clear value
safeClearStorage('key');

// Check availability
import { isLocalStorageAvailable } from './utils/storage';
if (isLocalStorageAvailable()) {
  // Safe to use localStorage
}
```

#### 2. API Cache (`src/utils/apiCache.js`)
Automatic caching and retry logic for API calls.

**Example:**
```javascript
import { getCachedData, setCachedData, withRetry } from './utils/apiCache';

// Manually cache data
setCachedData('user:123', userData);

// Retrieve cached data
const cached = getCachedData('user:123');

// Retry API call with exponential backoff
try {
  const result = await withRetry(
    () => fetch('/api/data'),
    3,  // max attempts
    1000 // initial delay in ms
  );
} catch (err) {
  console.error('Failed after retries:', err);
}

// Clear specific cache entry or all
import { clearCache } from './utils/apiCache';
clearCache('user:123');
clearCache(); // Clear all
```

#### 3. Custom Hooks (`src/utils/hooks.js`)
Advanced React hooks for optimization and async operations.

**Available Hooks:**

```javascript
// Prevent stale closure issues
import { useStableCallback } from './utils/hooks';
const stableCallback = useStableCallback(myCallback, [dep1, dep2]);

// Safe state updates on unmounted components
import { useSafeState } from './utils/hooks';
const [state, setSafeState] = useSafeState(initialValue);

// Async operations with cleanup
import { useAsync } from './utils/hooks';
const { execute, status, data, error } = useAsync(
  async () => {
    const response = await fetch('/api/data');
    return response.json();
  },
  true // immediate: execute immediately
);

// Async with abort support
import { useAsyncWithAbort } from './utils/hooks';
const { execute, status, data, error, abort } = useAsyncWithAbort(
  async (signal) => {
    const response = await fetch('/api/data', { signal });
    return response.json();
  }
);

// Debounced values (useful for search input)
import { useDebouncedValue } from './utils/hooks';
const debouncedSearchTerm = useDebouncedValue(searchTerm, 300); // 300ms delay

// Throttled callbacks
import { useThrottledCallback } from './utils/hooks';
const throttledScroll = useThrottledCallback(() => {
  // Called max once per 500ms
}, 500);

// Get previous value
import { usePrevious } from './utils/hooks';
const prevValue = usePrevious(currentValue);

// Check if component is mounted
import { useMounted } from './utils/hooks';
const isMounted = useMounted();

// Effect that runs after first render
import { useUpdateEffect } from './utils/hooks';
useUpdateEffect(() => {
  // Runs on dependency changes, but not on mount
}, [dependency]);
```

#### 4. Error Boundary (`src/utils/errorBoundary.jsx`)
Catch component errors and prevent full app crashes.

**Example:**
```javascript
import ErrorBoundary from './utils/errorBoundary';

<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// Usage in App.jsx (already wrapped)
```

---

## API Layer Enhancements

### Automatic Caching
GET requests to these endpoints are now cached (5-minute TTL):
- `getUserProfile` ✅
- `getCurrentSubscription` ✅
- `getSubscriptionUsage` ✅
- `getMerchantSubscription` ✅
- `getTransactionHistory` ✅
- `getAIHistory` ✅

### Timeout Protection
All API calls now have 15-second timeout. If a request takes longer:
```javascript
Error: "Request timeout. Please check your connection and try again."
```

### Custom Timeout
```javascript
import { apiRequest } from './api';

// Custom timeout for slow endpoints
const result = await apiRequest('/slow-endpoint', {
  token: myToken,
  timeout: 30000 // 30 seconds
});
```

---

## QR Scanner Improvements

### Enhanced Hook API
```javascript
import { useQRScanner } from './components/QRSystem';

const {
  isScanning,        // Is camera currently scanning
  hasPermission,     // null=pending, true=granted, false=denied
  lastScanned,       // Last scanned payment data
  cameraError,       // Error message if any
  isPermissionDenied,// True if user denied permission
  startScanning,     // Async function to start scanner
  stopScanning,      // Async function to stop scanner
  toggleTorch,       // Toggle flashlight if available
  requestPermissionRetry, // Retry after permission denial
  validateNanoAddress // Validate address format
} = useQRScanner({
  onScan: (data) => {
    // Handle scanned payment data
    console.log(data);
  },
  onError: (err) => {
    // Handle scanner error
    console.error(err);
  }
});
```

### Error Handling
```javascript
// In component
const { cameraError, isPermissionDenied, requestPermissionRetry } = useQRScanner({...});

if (isPermissionDenied) {
  return (
    <div>
      <p>Camera permission denied</p>
      <button onClick={() => requestPermissionRetry('qr-scanner')}>
        Try Again
      </button>
    </div>
  );
}

if (cameraError) {
  return <div>Error: {cameraError}</div>;
}
```

---

## React Component Optimization

### Code Splitting Already In Place
These components are automatically lazy-loaded:
- UserDashboard
- MerchantDashboard
- AdminDashboard
- PricingScreen
- MerchantPricingScreen
- SendScreen
- PricingCheckout
- HistoryScreen
- ReceiveScreen

No additional action needed - Vite handles splitting automatically.

### Memoization
```javascript
import React, { memo } from 'react';

// Prevent unnecessary re-renders
const MyComponent = memo(function MyComponent({ data }) {
  return <div>{data}</div>;
});

// Memoize expensive callbacks
import { useCallback } from 'react';
const handleClick = useCallback(() => {
  doSomething();
}, [dependency]);

// Memoize expensive values
import { useMemo } from 'react';
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(dependency);
}, [dependency]);
```

---

## Performance Debugging

### Check Bundle Size
```bash
npm run build
# Look at dist/ folder sizes
```

### Chrome DevTools Performance
1. Open DevTools → Performance tab
2. Record page interaction
3. Look for:
   - Long tasks (>50ms)
   - Layout shifts
   - Forced reflows

### Lighthouse
1. DevTools → Lighthouse tab
2. Run audit
3. Check Core Web Vitals
4. Fix recommendations

### React DevTools Profiler
```javascript
// Wrap component in Profiler to measure render time
import { Profiler } from 'react';

<Profiler id="MyComponent" onRender={onRender}>
  <MyComponent />
</Profiler>

const onRender = (id, phase, actualDuration) => {
  console.log(`${id} (${phase}) took ${actualDuration}ms`);
};
```

---

## Testing Improvements

### QR Scanner Testing
```javascript
// Mock the QR scanner for unit tests
import { useQRScanner } from './components/QRSystem';

jest.mock('./components/QRSystem', () => ({
  useQRScanner: () => ({
    isScanning: false,
    hasPermission: true,
    startScanning: jest.fn(),
    stopScanning: jest.fn(),
    // ... other properties
  })
}));
```

### API Testing with Caching
```javascript
// Tests will hit cache on subsequent calls
import { clearCache } from './utils/apiCache';

beforeEach(() => {
  clearCache(); // Clear cache before each test
});

test('API caching works', async () => {
  const result1 = await getUserProfile(token);
  const result2 = await getUserProfile(token); // From cache
  expect(result1).toEqual(result2);
});
```

---

## Deployment Verification Checklist

### Before Production:
- [ ] Run `npm run build` - no errors
- [ ] Check `dist/` folder
  - [ ] Main bundle < 300KB
  - [ ] Vendor chunks properly split
  - [ ] No console errors
- [ ] Test on mobile device
  - [ ] QR scanner works (Android Chrome)
  - [ ] QR scanner works (iPhone Safari)
  - [ ] No white screens on initial load
  - [ ] Touch response is snappy
- [ ] Run Lighthouse audit
  - [ ] Mobile score ≥ 85
  - [ ] Core Web Vitals green
- [ ] Test API timeout
  - [ ] Check network tab, throttle to slow 4G
  - [ ] Requests timeout after 15s
  - [ ] Error message displays

### After Deployment:
- [ ] Visit https://changeaipay.netlify.app
- [ ] Test full flow:
  - [ ] Login/Register
  - [ ] Send payment (test form)
  - [ ] QR scan functionality
  - [ ] Receive payment QR
  - [ ] Dashboard loads
- [ ] Monitor Network tab
  - [ ] Verify long-term cached assets load from browser cache
  - [ ] HTML never cached (always fresh)
- [ ] Check Lighthouse on production URL

---

## Common Issues & Solutions

### Issue: "White Screen on Initial Load"
**Solution:**
- Ensure `ProtectedRoute` has token before rendering
- Check if bootStatus is "loading"
- Look for errors in DevTools console

### Issue: "QR Camera Permission Stuck"
**Solution:**
- Clear browser site data
- Check if camera is already in use by other app
- Try on different device
- Check browser camera permissions settings

### Issue: "Slow API Requests"
**Solution:**
- Check network tab for timeout errors
- Verify API server is running
- Check if network is throttled
- Use browser cache (check DevTools Network tab)

### Issue: "Layout Shifts"
**Solution:**
- Ensure all dynamic content has reserved space
- Use CSS aspect-ratio for images
- Load fonts with `display: swap`

---

## Git Workflow

### View Changes
```bash
git diff
git log --oneline
```

### Commit Message Format
```
[feature/fix/perf] Brief description

- Detailed explanation
- List of changes
```

### Example:
```
[perf] Optimize QR scanner and API caching

- Added timeout protection (15s) to all API calls
- Implemented caching for GET requests with 5-min TTL
- Enhanced QR scanner error handling and recovery
- Improved auth bootstrap with timeout protection
- Updated Vite config for better code splitting
```

---

## Performance Budget

### Recommended Limits:
- **Total JS**: < 350KB (gzipped)
- **Total CSS**: < 50KB (gzipped)
- **LCP**: < 2.5 seconds
- **FCP**: < 1.5 seconds
- **CLS**: < 0.1

---

## Support & Troubleshooting

### Debug Logging
```javascript
// Enable detailed logging
localStorage.setItem('DEBUG', 'changeaipay:*');

// Disable
localStorage.removeItem('DEBUG');
```

### Performance Monitoring
```javascript
// Measure Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

---

## Documentation References

- **React**: https://react.dev
- **Vite**: https://vitejs.dev
- **React Router**: https://reactrouter.com
- **html5-qrcode**: https://github.com/mebjas/html5-qrcode
- **Web Vitals**: https://web.dev/vitals

---

**Last Updated**: May 25, 2026
**Version**: 1.0.0
