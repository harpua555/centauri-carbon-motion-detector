# Quick Test Guide

## 🚀 Run Everything

```bash
cd test
./build_and_run_all_tests.sh
```

Expected output: All tests pass with green ✓ indicators.

## 📋 Test Suite Breakdown

### C++ Tests (4 files)
1. **pulse_simulator** - FilamentMotionSensor comprehensive tests (existing)
2. **test_jam_detector** - JamDetector unit tests (12 cases)
3. **test_sdcp_protocol** - SDCPProtocol unit tests (5 cases)
4. **test_additional_edge_cases** - Edge cases & integration (9 cases) **NEW**

### Python Tests (1 file)
- **test_tools.py** - Build tools validation (13 test classes, 42+ methods)

### JavaScript Tests (1 file)
- **test_distributor.js** - Web components validation (20 tests)

## 🔧 Requirements

**For C++ tests:**
- g++ with C++11 support

**For Python tests:**
- Python 3.6+
- No external dependencies (PyYAML optional)

**For JavaScript tests:**
- Node.js 12+
- No external dependencies

## 📊 Expected Results

### Full Test Run (`build_and_run_all_tests.sh`)

When running the complete test suite, you should see output similar to:

```text
[C++ Tests]
Building pulse_simulator...
Running FilamentMotionSensor tests...
  ✓ Test case 1: Normal pulse sequence
  ✓ Test case 2: Rapid pulses
  ✓ Test case 3: Edge detection
[PASS] pulse_simulator - All 15 tests passed

Building test_jam_detector...
Running JamDetector tests...
  ✓ Jam detection threshold test
  ✓ Pressure spike handling
  ✓ Recovery sequence
  ✓ False positive filtering
[PASS] test_jam_detector - All 12 tests passed

Building test_sdcp_protocol...
Running SDCPProtocol tests...
  ✓ Frame encoding/decoding
  ✓ Checksum validation
  ✓ Protocol version compatibility
[PASS] test_sdcp_protocol - All 5 tests passed

Building test_additional_edge_cases...
Running Edge Cases tests...
  ✓ Memory boundary conditions
  ✓ Concurrent state changes
  ✓ Buffer overflow protection
[PASS] test_additional_edge_cases - All 9 cases passed

[Python Tests]
Running test_tools.py...
  ✓ TestBoardConfig: 8 tests passed
  ✓ TestBuildTools: 12 tests passed
  ✓ TestEnvironment: 15 tests passed
  ✓ TestVersioning: 7 tests passed
[PASS] test_tools.py - All 42+ methods passed

[JavaScript Tests]
Running test_distributor.js...
  ✓ Web component rendering tests: 10 passed
  ✓ HTTP endpoint tests: 7 passed
  ✓ Firmware update simulation: 3 passed
[PASS] test_distributor.js - All 20 tests passed

========================================
Overall: ALL TESTS PASSED (41 test files, 104+ total tests)
Runtime: ~15 seconds
========================================
```

### Individual Test Suite Expectations

| Test Suite | Expected Result | Return Value |
|-----------|-----------------|--------------|
| **pulse_simulator** | All sensor readings valid; timestamps accurate | Exit code 0 |
| **test_jam_detector** | Jam conditions detected within 100ms threshold | Exit code 0 |
| **test_sdcp_protocol** | Protocol frames encode/decode with 100% accuracy | Exit code 0 |
| **test_additional_edge_cases** | All boundary conditions handled gracefully | Exit code 0 |
| **test_tools.py** | All build configurations validated | Exit code 0 |
| **test_distributor.js** | All HTTP responses return valid JSON with 200 OK | Exit code 0 |

### Failure Indicators

If a test fails, you will see output like:

```text
[FAIL] test_jam_detector - Assertion failed at line 42
  Expected: pressure_spike_detected = true
  Got: pressure_spike_detected = false
  
Failed condition: jam_threshold_exceeded()
```

**Exit codes:**
- `0` = All tests passed
- `1` = One or more tests failed
- `2` = Build/compilation error
