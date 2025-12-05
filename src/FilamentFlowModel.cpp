#include "FilamentFlowModel.h"
#include <iostream>

FilamentFlowModel::FilamentFlowModel()
{
    reset();
}

void FilamentFlowModel::reset()
{
    initialized = false;
    lastUpdateMs = 0;
    
    lastTotalExpectedMm = 0.0f;
    pendingExpectedDeltaMm = 0.0f;
    pendingActualDeltaMm = 0.0f;

    currentExpectedRate = 0.0f;
    currentActualRate = 0.0f;
    currentActualDerivative = 0.0f;
    prevActualRate = 0.0f;
    currentDeficit = 0.0f;
    currentFlowRatio = 1.0f;
    currentQualityScore = 1.0f;
    currentExpectedDistance = 0.0f;
    currentActualDistance = 0.0f;

    historyHead = 0;
    historyCount = 0;
    for (int i = 0; i < MAX_BUCKETS; i++) {
        history[i] = {0.0f, 0.0f};
    }
}

void FilamentFlowModel::updateExpectedPosition(float totalExtrusionMm, unsigned long timestampMs)
{
    if (!initialized) {
        lastTotalExpectedMm = totalExtrusionMm;
        lastUpdateMs = timestampMs; // Sync time
        initialized = true;
        return;
    }

    // Handle retractions or resets (negative delta)
    if (totalExtrusionMm < lastTotalExpectedMm) {
        // Retraction detected. 
        // We do NOT add negative delta to pending, as it would confuse flow rate.
        // We just reset the baseline.
        lastTotalExpectedMm = totalExtrusionMm;
        // Optionally reset pending delta if we want to discard partial forward movement before retraction
        pendingExpectedDeltaMm = 0.0f; 
        return;
    }

    float delta = totalExtrusionMm - lastTotalExpectedMm;
    pendingExpectedDeltaMm += delta;
    lastTotalExpectedMm = totalExtrusionMm;
}

void FilamentFlowModel::addSensorPulse(float mmPerPulse, unsigned long timestampMs)
{
    (void)timestampMs; // We use the update() loop for timing
    if (!initialized) return;
    pendingActualDeltaMm += mmPerPulse;
}

void FilamentFlowModel::update(unsigned long timestampMs)
{
    if (!initialized) return;

    // Initialize lastUpdateMs on first call if needed
    if (lastUpdateMs == 0) {
        lastUpdateMs = timestampMs;
        return;
    }

    bool bucketsProcessed = false;
    unsigned long dt = timestampMs - lastUpdateMs;

    // Process as many full buckets as fit in the elapsed time
    while (dt >= SAMPLE_INTERVAL_MS) {
        // Assume uniform distribution over the elapsed time
        float ratio = (float)SAMPLE_INTERVAL_MS / (float)dt;
        
        float chunkExp = pendingExpectedDeltaMm * ratio;
        float chunkAct = pendingActualDeltaMm * ratio;
        
        // Add bucket
        history[historyHead] = {chunkExp, chunkAct};
        
        // Advance head
        historyHead = (historyHead + 1) % MAX_BUCKETS;
        if (historyCount < MAX_BUCKETS) {
            historyCount++;
        }

        // Remove processed portion from pending
        pendingExpectedDeltaMm -= chunkExp;
        pendingActualDeltaMm -= chunkAct;
        
        // Advance time
        lastUpdateMs += SAMPLE_INTERVAL_MS;
        dt -= SAMPLE_INTERVAL_MS;
        bucketsProcessed = true;
    }

    // If we processed any buckets, update metrics
    if (bucketsProcessed) {
         calculateMetrics();
    }
}

void FilamentFlowModel::calculateMetrics()
{
    float totalExpected = 0.0f;
    float totalActual = 0.0f;
    
    // Sum up the window
    for (int i = 0; i < historyCount; i++) {
        // Calculate index: (head - 1 - i) wrapped
        int idx = (historyHead - 1 - i + MAX_BUCKETS) % MAX_BUCKETS;
        totalExpected += history[idx].expectedDelta;
        totalActual += history[idx].actualDelta;
    }
    

    float windowDurationSec = (historyCount * SAMPLE_INTERVAL_MS) / 1000.0f;
    if (windowDurationSec <= 0.001f) windowDurationSec = 0.001f;

    // Store distances
    currentExpectedDistance = totalExpected;
    currentActualDistance = totalActual;

    // 1. Rates
    currentExpectedRate = totalExpected / windowDurationSec;
    
    // Save previous actual rate for derivative
    prevActualRate = currentActualRate;
    currentActualRate = totalActual / windowDurationSec;

    // 2. Derivative (Acceleration)
    // dt is the window shift (SAMPLE_INTERVAL_MS)
    float dtSec = SAMPLE_INTERVAL_MS / 1000.0f;
    currentActualDerivative = (currentActualRate - prevActualRate) / dtSec;

    // 3. Deficit
    currentDeficit = totalExpected - totalActual;
    if (currentDeficit < 0) currentDeficit = 0; // Ignore surplus

    // 4. Flow Ratio
    if (currentExpectedRate > 0.1f) {
        currentFlowRatio = currentActualRate / currentExpectedRate;
    } else {
        currentFlowRatio = 1.0f; // Assume perfect if no expected flow
    }
    
    // Clamp ratio
    if (currentFlowRatio > 1.5f) currentFlowRatio = 1.5f;

    // 5. Quality Score
    // Simple metric: How close is the ratio to 1.0?
    // Penalize deviation.
    // Score = 1.0 - |1.0 - Ratio|
    // But we also want to penalize "noise" if we had access to variance.
    // For now, ratio stability is a good proxy.
    float ratioError = fabsf(1.0f - currentFlowRatio);
    currentQualityScore = 1.0f - ratioError;
    if (currentQualityScore < 0.0f) currentQualityScore = 0.0f;
}

float FilamentFlowModel::getExpectedFlowRate() const { return currentExpectedRate; }
float FilamentFlowModel::getActualFlowRate() const { return currentActualRate; }
float FilamentFlowModel::getActualFlowDerivative() const { return currentActualDerivative; }
float FilamentFlowModel::getQualityScore() const { return currentQualityScore; }
float FilamentFlowModel::getDeficit() const { return currentDeficit; }
float FilamentFlowModel::getFlowRatio() const { return currentFlowRatio; }
float FilamentFlowModel::getExpectedDistance() const { return currentExpectedDistance; }
float FilamentFlowModel::getActualDistance() const { return currentActualDistance; }
