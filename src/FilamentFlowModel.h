#ifndef FILAMENT_FLOW_MODEL_H
#define FILAMENT_FLOW_MODEL_H

#include <Arduino.h>

/**
 * FilamentFlowModel
 * 
 * A unified abstraction for raw extrusion and sensor pulses.
 * Provides a deterministic timing model and derivative engine for
 * accurate flow rate calculation and jam detection.
 */
class FilamentFlowModel
{
public:
    FilamentFlowModel();

    /**
     * Reset the model state.
     * Call on print start or after a significant pause.
     */
    void reset();

    /**
     * Update the expected extrusion position from printer telemetry.
     * @param totalExtrusionMm Total expected extrusion in mm.
     * @param timestampMs Timestamp of the telemetry in milliseconds.
     */
    void updateExpectedPosition(float totalExtrusionMm, unsigned long timestampMs);

    /**
     * Record a sensor pulse.
     * @param mmPerPulse Distance in mm per pulse.
     * @param timestampMs Timestamp of the pulse in milliseconds.
     */
    void addSensorPulse(float mmPerPulse, unsigned long timestampMs);

    /**
     * Update the model state (calculate rates, derivatives, etc.).
     * Should be called frequently (e.g., inside loop).
     * @param timestampMs Current timestamp in milliseconds.
     */
    void update(unsigned long timestampMs);

    // --- Getters ---

    /**
     * Get the current expected flow rate in mm/s.
     */
    float getExpectedFlowRate() const;

    /**
     * Get the current actual (sensor) flow rate in mm/s.
     */
    float getActualFlowRate() const;

    /**
     * Get the first derivative of the actual flow rate (acceleration) in mm/s^2.
     */
    float getActualFlowDerivative() const;

    /**
     * Get a quality score for the sensor signal (0.0 - 1.0).
     * 1.0 = perfect correlation, 0.0 = no correlation / noise.
     */
    float getQualityScore() const;

    /**
     * Get the current deficit (expected - actual) in mm.
     */
    float getDeficit() const;

    /**
     * Get the ratio of actual to expected flow (0.0 - 1.0+).
     */
    float getFlowRatio() const;

    /**
     * Get the total expected distance in the current window (mm).
     */
    float getExpectedDistance() const;

    /**
     * Get the total actual distance in the current window (mm).
     */
    float getActualDistance() const;

private:
    // Configuration
    static const unsigned long WINDOW_SIZE_MS = 2000; // 2 second sliding window
    static const unsigned long SAMPLE_INTERVAL_MS = 100; // 100ms buckets for rate calc
    static const int MAX_BUCKETS = WINDOW_SIZE_MS / SAMPLE_INTERVAL_MS;

    // State
    bool initialized;
    unsigned long lastUpdateMs;
    
    // Telemetry tracking
    float lastTotalExpectedMm;      // Last absolute value received from telemetry
    float pendingExpectedDeltaMm;   // Accumulated delta since last bucket close
    
    // Pulse tracking
    float pendingActualDeltaMm;     // Accumulated pulses since last bucket close

    // Derived metrics
    float currentExpectedRate;
    float currentActualRate;
    float currentActualDerivative;
    float prevActualRate;           // For derivative calc
    float currentDeficit;
    float currentFlowRatio;
    float currentQualityScore;
    float currentExpectedDistance;
    float currentActualDistance;

    // Internal helper to calculate rates over the window
    struct TimeBucket {
        float expectedDelta;
        float actualDelta;
    };
    
    // Circular buffer for windowed calculation
    TimeBucket history[MAX_BUCKETS];
    int historyHead;
    int historyCount;

    void calculateMetrics();
};

#endif // FILAMENT_FLOW_MODEL_H
