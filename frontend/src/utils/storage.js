// Safely initialize state from storage to prevent hydration mismatches
export function safeGetFromStorage(key, defaultValue = null, isSession = false) {
  if (typeof window === "undefined") return defaultValue;
  
  try {
    const storage = isSession ? sessionStorage : localStorage;
    const item = storage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item);
  } catch (err) {
    console.error(`Failed to parse ${key} from storage:`, err);
    return defaultValue;
  }
}

export function safeSetStorage(key, value, isSession = false) {
  if (typeof window === "undefined") return false;
  
  try {
    const storage = isSession ? sessionStorage : localStorage;
    const serialized = JSON.stringify(value);
    storage.setItem(key, serialized);
    return true;
  } catch (err) {
    console.error(`Failed to save ${key} to storage:`, err);
    return false;
  }
}

export function safeClearStorage(key, isSession = false) {
  if (typeof window === "undefined") return;
  
  try {
    const storage = isSession ? sessionStorage : localStorage;
    storage.removeItem(key);
  } catch (err) {
    console.error(`Failed to clear ${key} from storage:`, err);
  }
}

// Detect if we're in a browser environment
export const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

// Detect if localStorage is available
export function isLocalStorageAvailable() {
  if (!isBrowser) return false;
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

// Detect if sessionStorage is available
export function isSessionStorageAvailable() {
  if (!isBrowser) return false;
  try {
    const test = "__storage_test__";
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
