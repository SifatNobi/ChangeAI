const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS.INFO;

function formatMessage(level, message, data) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

export const logger = {
  debug: (message, data) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) formatMessage("DEBUG", message, data);
  },
  info: (message, data) => {
    if (currentLevel <= LOG_LEVELS.INFO) formatMessage("INFO", message, data);
  },
  warn: (message, data) => {
    if (currentLevel <= LOG_LEVELS.WARN) formatMessage("WARN", message, data);
  },
  error: (message, data) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      formatMessage("ERROR", message, data);
      try {
        fetch("/api/log-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: "ERROR",
            message,
            data,
            url: window.location?.href,
            timestamp: new Date().toISOString()
          })
        }).catch(() => {});
      } catch {}
    }
  }
};

export default logger;
