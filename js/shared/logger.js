// logger.js
// Logging is currently disabled as part of codebase cleanup.
// Keep the API surface so imports/call-sites don't need refactors.

class Logger {
    constructor(source = 'Renderer') {
        this.source = source;
    }

    _send(level, ...args) {
        // Intentionally disabled.
        return;
    }

    info(...args) { this._send('INFO', ...args); }
    warn(...args) { this._send('WARN', ...args); }
    error(...args) { this._send('ERROR', ...args); }
    debug(...args) { this._send('DEBUG', ...args); }
}

export const logger = new Logger('App');
export const createLogger = (source) => new Logger(source);
