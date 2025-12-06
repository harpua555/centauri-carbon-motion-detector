/**
 * Custom ESP32 flasher module using esptool-js directly
 * Provides full control over UI without ESP Web Tools popups
 */

const FLASH_STATES = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    DETECTING: 'detecting',
    DOWNLOADING: 'downloading',
    ERASING: 'erasing',
    WRITING: 'writing',
    VERIFYING: 'verifying',
    FINISHED: 'finished',
    ERROR: 'error'
};

// Chip family mapping for manifest matching
const CHIP_FAMILY_MAP = {
    'ESP32': 'ESP32',
    'ESP32-S2': 'ESP32-S2',
    'ESP32-S3': 'ESP32-S3',
    'ESP32-C3': 'ESP32-C3',
    'ESP32-C6': 'ESP32-C6',
    'ESP32-H2': 'ESP32-H2'
};

class EspFlasher {
    constructor(options = {}) {
        this.onProgress = options.onProgress || (() => { });
        this.onLog = options.onLog || console.log;
        this.onStateChange = options.onStateChange || (() => { });
        this.transport = null;
        this.espLoader = null;
        this.esptoolModule = null;
    }

    /**
     * Get list of previously authorized serial ports
     * @returns {Promise<SerialPort[]>}
     */
    async getAuthorizedPorts() {
        if (!('serial' in navigator)) {
            throw new Error('Web Serial API not supported in this browser');
        }
        return navigator.serial.getPorts();
    }

    /**
     * Request a new port authorization (triggers browser native dialog)
     * @returns {Promise<SerialPort>}
     */
    async requestNewPort() {
        if (!('serial' in navigator)) {
            throw new Error('Web Serial API not supported in this browser');
        }
        return navigator.serial.requestPort();
    }

    /**
     * Load esptool-js module dynamically
     */
    async loadEsptool() {
        if (this.esptoolModule) return this.esptoolModule;

        try {
            // Import esptool-js from CDN
            this.esptoolModule = await import('https://unpkg.com/esptool-js@0.4.5/bundle.js');
            return this.esptoolModule;
        } catch (error) {
            throw new Error(`Failed to load esptool-js: ${error.message}`);
        }
    }

    /**
     * Flash firmware to the device
     * @param {SerialPort} port - The serial port to use
     * @param {string} manifestUrl - URL to the manifest.json file
     * @param {Object} options - Flash options
     */
    async flash(port, manifestUrl, options = {}) {
        const { eraseFirst = false } = options;

        try {
            // Load esptool-js
            const { ESPLoader, Transport } = await this.loadEsptool();

            this.setState(FLASH_STATES.CONNECTING);
            this.onProgress(FLASH_STATES.CONNECTING, 0, 'Connecting to device...');
            this.onLog('Connecting to device...', 'info');

            // Close port if it was left open from a previous session
            if (port.readable || port.writable) {
                try {
                    await port.close();
                    // Give the OS a moment to release the file handle
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (e) {
                    this.onLog(`Warning: Failed to force close port: ${e.message}`, 'warn');
                }
            }

            // Create transport - esptool-js will handle opening the port
            this.transport = new Transport(port, true);

            this.onProgress(FLASH_STATES.CONNECTING, 5, 'Connecting to bootloader...');
            this.onLog('Connecting to ESP bootloader...', 'info');

            // Create ESP loader with terminal output
            const loaderOptions = {
                transport: this.transport,
                baudrate: 115200,
                romBaudrate: 115200,
                terminal: {
                    clean: () => { },
                    writeLine: (data) => {
                        if (data && data.trim()) {
                            this.onLog(data.trim(), 'info');
                        }
                    },
                    write: (data) => {
                        if (data && data.trim()) {
                            this.onLog(data.trim(), 'info');
                        }
                    }
                }
            };

            this.espLoader = new ESPLoader(loaderOptions);

            // Connect to chip
            await this.espLoader.main();

            this.setState(FLASH_STATES.DETECTING);
            this.onProgress(FLASH_STATES.DETECTING, 10, 'Detecting chip...');

            const chipName = this.espLoader.chip.CHIP_NAME;
            this.onLog(`Detected chip: ${chipName}`, 'info');
            this.onLog(`MAC Address: ${await this.espLoader.chip.readMac(this.espLoader)}`, 'info');

            // Download manifest
            this.setState(FLASH_STATES.DOWNLOADING);
            this.onProgress(FLASH_STATES.DOWNLOADING, 15, 'Downloading firmware manifest...');
            this.onLog('Downloading firmware manifest...', 'info');

            const manifest = await this.fetchManifest(manifestUrl);

            // Find matching build for chip
            const build = this.findMatchingBuild(manifest, chipName);
            if (!build) {
                throw new Error(`No compatible firmware build found for ${chipName}`);
            }

            this.onLog(`Found firmware build for ${build.chipFamily}`, 'info');

            // Download firmware parts
            this.onProgress(FLASH_STATES.DOWNLOADING, 20, 'Downloading firmware files...');
            const parts = await this.downloadParts(build, manifestUrl);
            this.onLog(`Downloaded ${parts.length} firmware part(s)`, 'info');

            // Optionally erase flash first
            if (eraseFirst) {
                this.setState(FLASH_STATES.ERASING);
                this.onProgress(FLASH_STATES.ERASING, 25, 'Erasing flash memory...');
                this.onLog('Erasing flash memory (this may take a while)...', 'info');
                await this.espLoader.eraseFlash();
                this.onLog('Flash erased successfully', 'info');
            }

            // Write firmware
            this.setState(FLASH_STATES.WRITING);
            this.onProgress(FLASH_STATES.WRITING, 30, 'Writing firmware...');
            this.onLog('Starting firmware write...', 'info');

            const totalSize = parts.reduce((sum, p) => sum + p.data.length, 0);
            let totalWritten = 0;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const partName = part.path || `part ${i + 1}`;

                this.onLog(`Writing ${partName} to 0x${part.address.toString(16)}...`, 'info');

                // Convert Uint8Array to binary string (esptool-js expects string data)
                const binaryString = Array.from(part.data, byte => String.fromCharCode(byte)).join('');

                const fileArray = [{
                    data: binaryString,
                    address: part.address
                }];

                await this.espLoader.writeFlash({
                    fileArray,
                    flashSize: 'keep',
                    flashMode: 'keep',
                    flashFreq: 'keep',
                    eraseAll: false,
                    compress: true,
                    reportProgress: (fileIndex, written, total) => {
                        const partProgress = written / total;
                        const overallWritten = totalWritten + (part.data.length * partProgress);
                        const overallPercent = 30 + ((overallWritten / totalSize) * 65);

                        this.onProgress(
                            FLASH_STATES.WRITING,
                            overallPercent,
                            `Writing ${partName}... ${Math.round(partProgress * 100)}%`
                        );
                    }
                });

                totalWritten += part.data.length;
                this.onLog(`Completed ${partName}`, 'info');
            }

            // Success!
            this.setState(FLASH_STATES.FINISHED);
            this.onProgress(FLASH_STATES.FINISHED, 100, 'Flash complete!');
            this.onLog('Firmware written successfully!', 'success');

            // Hard reset the device
            this.onLog('Resetting device...', 'info');
            await this.espLoader.hardReset();
            this.onLog('Device reset. Flash complete!', 'success');

            return { success: true, chipName };

        } catch (error) {
            this.setState(FLASH_STATES.ERROR);
            this.onProgress(FLASH_STATES.ERROR, 0, `Error: ${error.message}`);
            this.onLog(`Flash failed: ${error.message}`, 'error');
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Disconnect and cleanup
     */
    async disconnect() {
        try {
            if (this.transport) {
                await this.transport.disconnect();
            }
        } catch (e) {
            // Ignore disconnect errors
        }
        this.transport = null;
        this.espLoader = null;
    }

    /**
     * Set state and notify callback
     */
    setState(state) {
        this.onStateChange(state);
    }

    /**
     * Fetch and parse manifest file
     */
    async fetchManifest(url) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to download manifest: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Find a build in the manifest that matches the detected chip
     */
    findMatchingBuild(manifest, chipName) {
        if (!manifest.builds || !Array.isArray(manifest.builds)) {
            return null;
        }

        // Normalize chip name for comparison
        const normalizedChip = chipName.toUpperCase().replace(/[^A-Z0-9]/g, '');

        return manifest.builds.find(build => {
            if (!build.chipFamily) return false;
            const normalizedFamily = build.chipFamily.toUpperCase().replace(/[^A-Z0-9]/g, '');
            return normalizedChip.includes(normalizedFamily) || normalizedFamily.includes(normalizedChip);
        });
    }

    /**
     * Download all firmware parts from a build
     */
    async downloadParts(build, manifestUrl) {
        const parts = [];

        // Determine base URL - handle blob URLs which don't have directory structure
        let baseUrl = null;
        try {
            if (!manifestUrl.startsWith('blob:')) {
                baseUrl = new URL('.', manifestUrl).href;
            }
        } catch {
            // Ignore URL construction errors
        }

        for (const part of build.parts || []) {
            let partUrl;
            const pathStr = part.path || '';

            // Check if path is already a full URL (e.g., blob URL from WiFi patching)
            if (pathStr.startsWith('blob:') || pathStr.startsWith('http://') || pathStr.startsWith('https://')) {
                partUrl = pathStr;
            } else if (baseUrl) {
                partUrl = new URL(pathStr, baseUrl).href;
            } else {
                throw new Error(`Cannot resolve firmware path: ${pathStr}`);
            }

            const displayName = pathStr.startsWith('blob:') ? 'patched firmware' : pathStr;
            this.onLog(`Downloading ${displayName}...`, 'info');

            const response = await fetch(partUrl, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to download ${displayName}: ${response.status}`);
            }

            const data = new Uint8Array(await response.arrayBuffer());

            parts.push({
                path: displayName,
                address: part.offset || 0,
                data
            });
        }

        return parts;
    }

    /**
     * Get port info for display
     */
    /**
     * Start serial monitor on the port
     */
    async startMonitor(port) {
        try {
            if (!port.readable) {
                await port.open({ baudRate: 115200 });
            }

            this.monitoring = true;
            this.onLog('\n--- Starting Serial Monitor ---\n', 'info');

            let buffer = '';
            const decoder = new TextDecoder();

            while (port.readable && this.monitoring) {
                const reader = port.readable.getReader();
                this.monitorReader = reader;

                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        if (value) {
                            buffer += decoder.decode(value, { stream: true });

                            // Process lines in buffer
                            let newlineIndex;
                            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                                const line = buffer.substring(0, newlineIndex).trim();
                                if (line) {
                                    this.onLog(line, 'output');
                                }
                                buffer = buffer.substring(newlineIndex + 1);
                            }
                        }
                    }
                } catch (error) {
                    if (this.monitoring) {
                        this.onLog(`Monitor error: ${error.message}`, 'error');
                    }
                } finally {
                    reader.releaseLock();
                }
            }
        } catch (error) {
            this.onLog(`Failed to start monitor: ${error.message}`, 'error');
        }
    }

    /**
     * Stop serial monitor
     */
    async stopMonitor() {
        this.monitoring = false;
        if (this.monitorReader) {
            try {
                await this.monitorReader.cancel();
            } catch (e) {
                // Ignore cancel errors
            }
            this.monitorReader = null;
        }
    }

    /**
     * Get port info for display
     */
    static getPortInfo(port) {
        try {
            const info = port.getInfo();
            const vendorMap = {
                0x303a: 'Espressif',
                0x10c4: 'Silicon Labs',
                0x1a86: 'Qinheng',
                0x0403: 'FTDI'
            };

            let label = 'Serial Port';
            if (info.usbVendorId) {
                const vendorName = vendorMap[info.usbVendorId] || `Vendor 0x${info.usbVendorId.toString(16)}`;
                const pid = info.usbProductId ? `:${info.usbProductId.toString(16)}` : '';
                label = `${vendorName} USB Device${pid}`;
            }

            return {
                vendorId: info.usbVendorId ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : 'N/A',
                productId: info.usbProductId ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : 'N/A',
                label
            };
        } catch {
            return {
                vendorId: 'N/A',
                productId: 'N/A',
                label: 'Serial Port'
            };
        }
    }
}

export { EspFlasher, FLASH_STATES };
