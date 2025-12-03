/**
 * ESP32 Log Streaming - Browser-Side Collector
 * 
 * This script connects to the ESP32's Server-Sent Events endpoint and accumulates
 * logs in browser memory, providing unlimited storage vs. ESP32's limited RAM.
 * 
 * Features:
 * - Real-time log streaming via SSE
 * - Persistent storage using localStorage
 * - Export to JSON/text
 * - Filter by log level
 * - Search functionality
 * 
 * Usage:
 * 1. Include this script in your HTML: <script src="logCollector.js"></script>
 * 2. Call ESP32LogCollector.connect()
 * 3. Access logs via ESP32LogCollector.getLogs()
 */

const ESP32LogCollector = (function () {
    'use strict';

    // Private variables
    let eventSource = null;
    let logBuffer = [];
    let maxLogs = 5000;  // Limit to prevent browser memory issues
    const STORAGE_KEY = 'esp32_device_logs';

    // Log level mapping
    const LogLevel = {
        NORMAL: 0,
        VERBOSE: 1,
        PIN_VALUES: 2
    };

    const LogLevelNames = ['NORMAL', 'VERBOSE', 'PIN_VALUES'];

    /**
     * Load logs from localStorage on page load
     */
    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                logBuffer = JSON.parse(stored);
                console.log(`Loaded ${logBuffer.length} logs from localStorage`);
                return logBuffer.length;
            }
        } catch (e) {
            console.error('Failed to load logs from localStorage:', e);
        }
        return 0;
    }

    /**
     * Save logs to localStorage
     */
    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(logBuffer));
        } catch (e) {
            console.error('Failed to save logs to localStorage:', e);
        }
    }

    /**
     * Add a log entry to the buffer
     */
    function addLog(logEntry) {
        logBuffer.push(logEntry);

        // Trim if exceeds max
        if (logBuffer.length > maxLogs) {
            logBuffer = logBuffer.slice(-maxLogs);
        }

        // Save to localStorage (debounced in production)
        saveToStorage();

        // Trigger custom event for UI updates
        window.dispatchEvent(new CustomEvent('esp32-log', { detail: logEntry }));
    }

    /**
     * Connect to ESP32 SSE endpoint
     */
    function connect(deviceUrl = window.location.origin) {
        if (eventSource) {
            console.log('Already connected to log stream');
            return;
        }

        const sseUrl = `${deviceUrl}/status_events`;
        console.log(`Connecting to ${sseUrl}...`);

        eventSource = new EventSource(sseUrl);

        eventSource.addEventListener('open', () => {
            console.log('✓ Connected to ESP32 log stream');
        });

        eventSource.addEventListener('log', (event) => {
            try {
                const logEntry = JSON.parse(event.data);
                addLog(logEntry);
            } catch (e) {
                console.error('Failed to parse log entry:', e);
            }
        });

        eventSource.addEventListener('error', (event) => {
            console.error('SSE connection error:', event);
            if (eventSource.readyState === EventSource.CLOSED) {
                console.log('Connection closed, attempting to reconnect...');
                disconnect();
                setTimeout(() => connect(deviceUrl), 5000);
            }
        });
    }

    /**
     * Disconnect from SSE endpoint
     */
    function disconnect() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
            console.log('Disconnected from log stream');
        }
    }

    /**
     * Get all logs or filter by criteria
     */
    function getLogs(filter = {}) {
        let filtered = logBuffer;

        // Filter by level
        if (filter.level !== undefined) {
            filtered = filtered.filter(log => log.level === filter.level);
        }

        // Filter by search term
        if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            filtered = filtered.filter(log =>
                log.message.toLowerCase().includes(searchLower)
            );
        }

        // Filter by time range
        if (filter.startTime) {
            filtered = filtered.filter(log => log.timestamp >= filter.startTime);
        }
        if (filter.endTime) {
            filtered = filtered.filter(log => log.timestamp <= filter.endTime);
        }

        return filtered;
    }

    /**
     * Export logs as JSON
     */
    function exportAsJson(filename = 'esp32_logs.json') {
        const dataStr = JSON.stringify(logBuffer, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        downloadBlob(blob, filename);
    }

    /**
     * Export logs as plain text
     */
    function exportAsText(filename = 'esp32_logs.txt') {
        const lines = logBuffer.map(log => {
            const date = new Date(log.timestamp * 1000);
            const level = LogLevelNames[log.level] || 'UNKNOWN';
            return `[${date.toISOString()}] [${level}] ${log.message}`;
        });

        const text = lines.join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        downloadBlob(blob, filename);
    }

    /**
     * Helper to download blob as file
     */
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Clear all logs
     */
    function clear() {
        logBuffer = [];
        localStorage.removeItem(STORAGE_KEY);
        console.log('Logs cleared');
    }

    /**
     * Get statistics
     */
    function getStats() {
        const stats = {
            total: logBuffer.length,
            byLevel: {},
            oldestTimestamp: logBuffer.length > 0 ? logBuffer[0].timestamp : null,
            newestTimestamp: logBuffer.length > 0 ? logBuffer[logBuffer.length - 1].timestamp : null
        };

        // Count by level
        logBuffer.forEach(log => {
            const levelName = LogLevelNames[log.level] || 'UNKNOWN';
            stats.byLevel[levelName] = (stats.byLevel[levelName] || 0) + 1;
        });

        return stats;
    }

    // Auto-load from storage on script load
    loadFromStorage();

    // Public API
    return {
        connect,
        disconnect,
        getLogs,
        exportAsJson,
        exportAsText,
        clear,
        getStats,
        LogLevel
    };
})();

// Auto-connect on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ESP32LogCollector.connect();
    });
} else {
    ESP32LogCollector.connect();
}
