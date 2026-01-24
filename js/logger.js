// logger.js
// Centralized logging utility that writes to both Console and File (via IPC)
// Allows the AI Agent to debug the renderer process by reading userData/logs/debug.log

// Initialize ipcRenderer safely
let ipcRenderer = null;
try {
    if (window.require) {
        ipcRenderer = window.require('electron').ipcRenderer;
    }
} catch (e) {
    console.warn('Logger: Failed to initialize ipcRenderer', e);
}

class Logger {
    constructor(source = 'Renderer') {
        this.source = source;
    }

    _send(level, ...args) {
        // format message
        const message = args.map(arg => {
            if (arg instanceof Error) return arg.stack;
            if (typeof arg === 'object') return JSON.stringify(arg); // Simple stringify
            return String(arg);
        }).join(' ');

        // Log to browser console (for human debugging)
        if (level === 'ERROR') console.error(`[${this.source}]`, ...args);
        else if (level === 'WARN') console.warn(`[${this.source}]`, ...args);
        // else console.log(`[${this.source}]`, ...args); // Disabled for performance

        // Send to Main process (for File logging/AI visibility)
        if (ipcRenderer) {
            try {
                ipcRenderer.send('log-message', {
                    source: this.source,
                    level: level,
                    message: message
                });
            } catch (e) {
                console.error('Failed to send log via IPC', e);
            }
        }
    }

    info(...args) { this._send('INFO', ...args); }
    warn(...args) { this._send('WARN', ...args); }
    error(...args) { this._send('ERROR', ...args); }
    debug(...args) { this._send('DEBUG', ...args); }
}

export const logger = new Logger('App');
export const createLogger = (source) => new Logger(source);
