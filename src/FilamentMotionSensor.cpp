#include "FilamentMotionSensor.h"

FilamentMotionSensor::FilamentMotionSensor()
{
    reset();
}

void FilamentMotionSensor::reset()
{
    initialized           = false;
    firstPulseReceived    = false;
    lastExpectedUpdateMs  = millis();
    lastSensorPulseMs     = millis();
    
    flowModel.reset();
}

void FilamentMotionSensor::updateExpectedPosition(float totalExtrusionMm)
{
    unsigned long currentTime = millis();
    
    // We need to handle the "first pulse" logic here or in the model.
    // The original code had: "Only track expected position changes after first pulse received"
    // This was to skip priming.
    // We should preserve this logic.
    
    if (!initialized)
    {
        initialized = true;
        lastExpectedUpdateMs = currentTime;
        // Initialize model with baseline but don't count it as movement
        flowModel.updateExpectedPosition(totalExtrusionMm, currentTime);
        return;
    }

    // Check for retraction (handled by model, but we need to update lastExpectedUpdateMs?)
    // Original code: "Do NOT reset lastExpectedUpdateMs here!"
    // So we just pass it to the model.
    
    // Original logic: "Only track expected position changes after first pulse received"
    // If we haven't received a pulse, we should probably NOT update the model's expected position
    // OR we update it but the model handles it?
    // The model calculates delta. If we update it, it sees movement.
    // So we should gate the call to flowModel.updateExpectedPosition.
    
    if (firstPulseReceived)
    {
        flowModel.updateExpectedPosition(totalExtrusionMm, currentTime);
        flowModel.update(currentTime);
        lastExpectedUpdateMs = currentTime;
    }
    else
    {
        // Just update the baseline in the model so when we DO start, we don't have a huge jump?
        // Actually, if we don't call updateExpectedPosition, the model's lastTotalExpectedMm stays old.
        // When we finally call it, we get a huge delta.
        // So we SHOULD call it, but maybe reset the model immediately if !firstPulseReceived?
        // Or just re-initialize the baseline each time until first pulse.
        
        // Better approach:
        // If !firstPulseReceived, we treat every update as a "reset baseline"
        flowModel.reset(); 
        flowModel.updateExpectedPosition(totalExtrusionMm, currentTime);
        lastExpectedUpdateMs = currentTime;
    }
}

void FilamentMotionSensor::addSensorPulse(float mmPerPulse)
{
    unsigned long currentTime = millis();
    lastSensorPulseMs = currentTime;

    if (!firstPulseReceived)
    {
        firstPulseReceived = true;
        // Now we start tracking. The model was effectively reset by updateExpectedPosition logic above.
    }

    flowModel.addSensorPulse(mmPerPulse, currentTime);
    flowModel.update(currentTime);
}

float FilamentMotionSensor::getDeficit()
{
    // Ensure model is up to date
    flowModel.update(millis());
    return flowModel.getDeficit();
}

float FilamentMotionSensor::getExpectedDistance()
{
    flowModel.update(millis());
    return flowModel.getExpectedDistance();
}

float FilamentMotionSensor::getSensorDistance()
{
    flowModel.update(millis());
    return flowModel.getActualDistance();
}

void FilamentMotionSensor::getWindowedRates(float &expectedRate, float &actualRate)
{
    flowModel.update(millis());
    expectedRate = flowModel.getExpectedFlowRate();
    actualRate = flowModel.getActualFlowRate();
}

bool FilamentMotionSensor::isInitialized() const
{
    return initialized;
}

bool FilamentMotionSensor::isWithinGracePeriod(unsigned long gracePeriodMs) const
{
    if (!initialized || gracePeriodMs == 0)
    {
        return false;
    }
    unsigned long currentTime = millis();
    return (currentTime - lastExpectedUpdateMs) < gracePeriodMs;
}

float FilamentMotionSensor::getFlowRatio()
{
    flowModel.update(millis());
    return flowModel.getFlowRatio();
}
