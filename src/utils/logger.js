// Structured logger for the SB Manifest Bot
// Replaces raw console.log with log levels and timestamps

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

const currentLevel = process.env.DEBUG === 'true' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

function timestamp() {
    return new Date().toISOString();
}

function formatMessage(level, prefix, message, meta) {
    const ts = timestamp();
    const base = `[${ts}] [${level}]${prefix ? ` [${prefix}]` : ''} ${message}`;
    if (meta !== undefined && meta !== '') {
        // In production, avoid logging full objects to prevent credential leaks
        if (currentLevel > LOG_LEVELS.DEBUG && typeof meta === 'object') {
            return base; // Skip meta in non-debug mode
        }
        return base;
    }
    return base;
}

const logger = {
    /**
     * Debug-level log — only visible when DEBUG=true
     */
    debug(message, meta) {
        if (currentLevel <= LOG_LEVELS.DEBUG) {
            console.log(formatMessage('DEBUG', null, message, meta));
            if (meta !== undefined) console.log(meta);
        }
    },

    /**
     * Info-level log — general operational messages
     */
    info(message, meta) {
        if (currentLevel <= LOG_LEVELS.INFO) {
            console.log(formatMessage('INFO', null, message, meta));
        }
    },

    /**
     * Success log — for important positive events
     */
    success(message) {
        if (currentLevel <= LOG_LEVELS.INFO) {
            console.log(formatMessage('INFO', '✓', message));
        }
    },

    /**
     * Event log — for user actions and events
     */
    event(message) {
        if (currentLevel <= LOG_LEVELS.INFO) {
            console.log(formatMessage('INFO', '⚡', message));
        }
    },

    /**
     * Warning-level log
     */
    warn(message, meta) {
        if (currentLevel <= LOG_LEVELS.WARN) {
            console.warn(formatMessage('WARN', '⚠', message, meta));
            if (meta !== undefined && currentLevel <= LOG_LEVELS.DEBUG) console.warn(meta);
        }
    },

    /**
     * Error-level log
     */
    error(message, error) {
        if (currentLevel <= LOG_LEVELS.ERROR) {
            console.error(formatMessage('ERROR', '✖', message));
            if (error) {
                // Only log the message and stack, not the whole error object (which may contain secrets)
                if (error instanceof Error) {
                    console.error(`  → ${error.message}`);
                    if (currentLevel <= LOG_LEVELS.DEBUG && error.stack) {
                        console.error(error.stack);
                    }
                } else {
                    console.error(`  → ${error}`);
                }
            }
        }
    },

    /**
     * Create a child logger with a prefix
     */
    child(prefix) {
        return {
            debug: (msg, meta) => {
                if (currentLevel <= LOG_LEVELS.DEBUG) {
                    console.log(formatMessage('DEBUG', prefix, msg, meta));
                    if (meta !== undefined) console.log(meta);
                }
            },
            info: (msg) => {
                if (currentLevel <= LOG_LEVELS.INFO) {
                    console.log(formatMessage('INFO', prefix, msg));
                }
            },
            warn: (msg, meta) => {
                if (currentLevel <= LOG_LEVELS.WARN) {
                    console.warn(formatMessage('WARN', prefix, msg, meta));
                }
            },
            error: (msg, err) => {
                if (currentLevel <= LOG_LEVELS.ERROR) {
                    console.error(formatMessage('ERROR', prefix, msg));
                    if (err instanceof Error) {
                        console.error(`  → ${err.message}`);
                    } else if (err) {
                        console.error(`  → ${err}`);
                    }
                }
            }
        };
    }
};

export default logger;
export { LOG_LEVELS };
