# BigTreeTech Filament Motion Sensor with OpenCentauri Filament Reporting

This project uses a BigTreeTech filament motion sensor and an ESP32, in addition to patched OpenCentauri firmware, to provide Klipper-like detection. The firmware uses SDCP telemetry from the printer to determine expected filament flow conditions, compares it to the physical pulse sensor, and pauses the printer when hard jams or severe under‑extrusion (soft jams elsewhere in documentation) are detected. An HTML dashboard served by the ESP32 provides status, configuration, and OTA updates.

## Highlights

- **Dual-mode jam detection** – windowed tracking plus hysteresis for hard/soft snags  
- **Telemetry gap handling** – avoids false positives during communication drops  
- **Lite Web UI** – pure HTML/CSS/JS (~50 KB gzipped) served directly from LittleFS  
- **ElegantOTA built in** – visit `/update` for firmware uploads without serial cables  
- **Comprehensive simulator** – 20 scenario tests plus log replay to guard against regressions

## Repository layout

```
data/                # LittleFS content (lite UI + settings templates)
data_lite/           # Build output from webui_lite/ (generated)
src/                 # ESP32 firmware (Arduino framework)
test/                # Pulse simulator + fixtures
webui_lite/          # Single-page Lite UI source
```

## Requirements

- PlatformIO Core (`pip install platformio` or via VS Code extension)
- Python 3.10+
- Node.js 18+ (for Lite UI build tooling)
- ESP32‑S3 DevKitC‑1 (default) or other microcontrollers (via alternate envs)

## Quick start

### Option A: Standard Build (recommended for experienced users)

Requires: Python 3.10+, Node.js 18+, PlatformIO Core

```bash
# Build Lite UI + firmware and flash via USB
python tools/build_and_flash.py

# Build artifacts only (no upload) – results land in data/ and .pio/
python tools/build_and_flash.py --local

# Target another board (see platformio.ini for env names)
python tools/build_and_flash.py --env <board>

# Reuse existing node_modules when rebuilding the UI
python tools/build_and_flash.py --skip-npm-install
```

### Option B: Portable Environment (no global dependencies)

Requires: Only Python 3.10+ and Node.js 18+

This creates an isolated build environment in `tools/.venv/` and `tools/.platformio/` without modifying your global Python or PlatformIO installations.

```bash
# One-time setup (installs PlatformIO and ESP32 toolchain locally)
python tools/setup_local_env.py

# Build firmware using the portable environment
python tools/build_local.py

# Target another board
python tools/build_local.py --env seeed_esp32c3
```

### Option C: Quick Start Scripts

```bash
# Windows
quick-start.bat

# Linux/Mac
./quick-start.sh
```

These scripts verify your environment and guide you through the build process.

## Troubleshooting

### Check Your Environment

Before building, verify all dependencies are installed:

```bash
python tools/check_environment.py
```

This checks for:
- Python 3.10+
- Node.js 18+
- npm
- PlatformIO Core
- ESP32 platform
- ESP32 toolchain integrity

### Build Fails: "FreeRTOS.h: No such file or directory"

**Cause:** Corrupted or incomplete ESP32 platform installation in PlatformIO.

**Solutions (try in order):**

1. Clean and reinstall ESP32 platform:
   ```bash
   pio run --target clean
   pio platform uninstall espressif32
   pio platform install espressif32
   python tools/build_and_flash.py
   ```

2. Clear global PlatformIO cache (nuclear option):
   ```bash
   # Windows
   rmdir /s /q "%USERPROFILE%\.platformio"

   # Linux/Mac
   rm -rf ~/.platformio

   # Then rebuild (PlatformIO will reinstall everything)
   python tools/build_and_flash.py
   ```

3. Use the portable environment to avoid global state issues:
   ```bash
   python tools/setup_local_env.py
   python tools/build_local.py
   ```

### Missing Dependencies

If you're missing Python, Node.js, npm, or PlatformIO:

**Python 3.10+:**
- Download: https://www.python.org/downloads/
- Ubuntu/Debian: `sudo apt install python3 python3-pip python3-venv`
- macOS: `brew install python3`

**Node.js 18+ (includes npm):**
- Download: https://nodejs.org/ (LTS version recommended)
- Ubuntu/Debian: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs`
- macOS: `brew install node`

**PlatformIO Core:**
```bash
pip install platformio

# Or use the portable environment
python tools/setup_local_env.py
```

### Build Succeeds but Upload Fails

**Check USB connection:**
- Ensure ESP32 board is connected via USB
- Check that drivers are installed (especially on Windows)
- Try a different USB cable (data cable, not charge-only)

**Find the correct port:**
```bash
# List available serial ports
pio device list
```

### Settings

Edit `data/user_settings.json` with your Wi-Fi SSID, password, and Elegoo printer IP.

For sensitive credentials, use `data/user_settings.secrets.json` (see `user_settings.secrets.json.example` in the repo root for format). The build script merges secrets into the filesystem image during build and restores the original file afterwards, keeping your secrets out of git.

## Web UI

- Local development: `cd webui_lite && npm install && npm run dev`.  
- Production build artifacts live in `data/lite/` after running `npm run build` or the Python helper.  
- OTA firmware updates remain available via `/update` (ElegantOTA).

## Testing

The pulse simulator exercises hard/soft jam logic, sparse infill, retractions, replayed logs, etc.

```bash
# From repo root
wsl bash -lc "cd /mnt/c/Users/<you>/Documents/GitHub/cc_sfs/test && bash build_tests.sh"
```

All 20 tests must pass before releasing firmware (the build script does not run them automatically).

## Logging & diagnostics

- Live logs: `GET /api/logs_live` (last 100 entries, plain text).  
- Full logs: `GET /api/logs_text` (downloadable .txt).  
- Crash logs for triage can be stored under `logs/history/` but should be moved into `test/fixtures/` if they are used by automated tests (see `test/fixtures/log_for_test.txt`).

## Customize / extend

- Adjust jam thresholds, ratios, and telemetry windows via `SettingsManager` in `src/SettingsManager.*`.  
- Add new Web UI cards or settings by editing `webui_lite/index.html` (no bundler required).  
- New PlatformIO environments (e.g., Seeed boards) can be added to `platformio.ini` – remember to define `FILAMENT_RUNOUT_PIN` and `MOVEMENT_SENSOR_PIN`.

## OTA workflow

1. Build + flash firmware once via USB for a baseline image.  
2. For future updates, visit `http://device-ip/update` (ElegantOTA interface) and upload the `firmware.bin` produced by PlatformIO.  
3. The Lite UI can also push updates by using the local upload controls from its Update tab (it simply opens `/update` in a new window).

## Contributing

- Run `python tools/build_and_flash.py --local` before opening a PR (verifies the build still succeeds).  
- Run the pulse simulator (`test/build_tests.sh`) whenever jam detection logic or fixture paths change.  
- Keep the Lite UI small—prefer CSS variables/utility functions over large JS dependencies.

## License

See [LICENSE.MD](LICENSE.MD).

## Credits

- OpenCentauri team for enabling the firmware patches required to access filament extrusion data
- jrowny for the initial idea and starting point
