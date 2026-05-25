import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook to prevent stale closures and ensure callbacks don't cause re-renders
 * when dependencies don't change
 */
export function useStableCallback(callback, deps) {
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, deps);

  return useCallback((...args) => callbackRef.current(...args), []);
}

/**
 * Hook for safe async operations with cleanup
 */
export function useAsync(asyncFunction, immediate = true, deps = []) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    setError(null);
    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
      return response;
    } catch (error) {
      setError(error);
      setStatus('error');
    }
  }, deps);

  useEffect(() => {
    if (!immediate) return;
    execute();
  }, [execute, immediate]);

  return { execute, status, data, error };
}

/**
 * Hook for managing async operations with abort signal support
 */
export function useAsyncWithAbort(asyncFunction, deps = []) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const abortControllerRef = useRef(null);

  const execute = useCallback(async (...args) => {
    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setStatus('pending');
    setError(null);
    
    try {
      const response = await asyncFunction(...args, abortController.signal);
      if (!abortController.signal.aborted) {
        setData(response);
        setStatus('success');
      }
      return response;
    } catch (error) {
      if (error.name !== 'AbortError' && !abortController.signal.aborted) {
        setError(error);
        setStatus('error');
      }
    }
  }, deps);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { execute, status, data, error, abort: () => abortControllerRef.current?.abort() };
}

/**
 * Hook for debounced values
 */
export function useDebouncedValue(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for throttled callbacks
 */
export function useThrottledCallback(callback, delay = 500, deps = []) {
  const lastRunRef = useRef(0);
  const timeoutRef = useRef(null);

  return useCallback((...args) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRunRef.current;

    if (timeSinceLastRun >= delay) {
      callback(...args);
      lastRunRef.current = now;
    } else {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        callback(...args);
        lastRunRef.current = Date.now();
      }, delay - timeSinceLastRun);
    }
  }, [callback, delay]);
}

/**
 * Hook for previous value
 */
export function usePrevious(value) {
  const ref = useRef();
  
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Hook for mounting status
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

/**
 * Hook for safe state update (checks if mounted)
 */
export function useSafeState(initialState) {
  const [state, setState] = useState(initialState);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setSafeState = useCallback((newState) => {
    if (isMountedRef.current) {
      setState(newState);
    }
  }, []);

  return [state, setSafeState];
}

/**
 * Hook for previous props detection
 */
export function useUpdateEffect(effect, deps) {
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    return effect();
  }, deps);
}
