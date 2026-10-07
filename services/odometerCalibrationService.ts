import { Trip, VehicleCalibrationStatus } from '../types';

export const STORAGE_KEY_CALIBRATION_PREFIX = 'easylog_calibration_';
export const DEFAULT_CALIBRATION_INTERVAL_DAYS = 30; // Monthly intervals

export interface StoredCalibrationMeta {
  lastCalibrationDate: string; // ISO string
  lastCalibrationOdometer: number;
  intervalDays?: number;
}

/**
 * Gets the calibration status for a specific vehicle registration
 */
export function getVehicleCalibrationStatus(
  vehicleReg: string,
  history: Trip[],
  intervalDays: number = DEFAULT_CALIBRATION_INTERVAL_DAYS
): VehicleCalibrationStatus {
  if (!vehicleReg) {
    return {
      vehicleReg: '',
      lastCalibrationDate: null,
      lastCalibrationOdometer: null,
      daysSinceLastCalibration: 0,
      isOverdue: false,
      intervalDays
    };
  }

  const regUpper = vehicleReg.toUpperCase();

  // 1. Check direct localStorage record
  let lastDate: string | null = null;
  let lastOdo: number | null = null;

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_CALIBRATION_PREFIX}${regUpper}`);
      if (stored) {
        const parsed: StoredCalibrationMeta = JSON.parse(stored);
        lastDate = parsed.lastCalibrationDate;
        lastOdo = parsed.lastCalibrationOdometer;
      }
    } catch (e) {
      console.warn('Error reading calibration cache', e);
    }
  }

  // 2. Fall back to finding the latest calibration entry in trip history
  if (!lastDate) {
    const calibTrips = history.filter(
      (t) => t.registrationNumber?.toUpperCase() === regUpper && t.isCalibration && t.end?.timestamp
    );

    if (calibTrips.length > 0) {
      calibTrips.sort((a, b) => new Date(b.end!.timestamp).getTime() - new Date(a.end!.timestamp).getTime());
      lastDate = calibTrips[0].end!.timestamp;
      lastOdo = calibTrips[0].end!.value;
    }
  }

  // 3. If never calibrated, check the date of the very first trip for this vehicle
  if (!lastDate) {
    const vehicleTrips = history.filter(
      (t) => t.registrationNumber?.toUpperCase() === regUpper && t.start?.timestamp
    );
    if (vehicleTrips.length > 0) {
      vehicleTrips.sort((a, b) => new Date(a.start.timestamp).getTime() - new Date(b.start.timestamp).getTime());
      lastDate = vehicleTrips[0].start.timestamp;
      lastOdo = vehicleTrips[0].start.value;
    }
  }

  if (!lastDate) {
    return {
      vehicleReg: regUpper,
      lastCalibrationDate: null,
      lastCalibrationOdometer: null,
      daysSinceLastCalibration: 0,
      isOverdue: false, // Brand new vehicle without trips
      intervalDays
    };
  }

  const lastTime = new Date(lastDate).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - lastTime);
  const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isOverdue = daysSince >= intervalDays;

  return {
    vehicleReg: regUpper,
    lastCalibrationDate: lastDate,
    lastCalibrationOdometer: lastOdo,
    daysSinceLastCalibration: daysSince,
    isOverdue,
    intervalDays
  };
}

/**
 * Checks all configured vehicles to see if any are overdue for monthly calibration
 */
export function getOverdueVehicles(
  vehicles: string[],
  history: Trip[],
  intervalDays: number = DEFAULT_CALIBRATION_INTERVAL_DAYS
): VehicleCalibrationStatus[] {
  return vehicles
    .map((v) => getVehicleCalibrationStatus(v, history, intervalDays))
    .filter((status) => status.isOverdue);
}

/**
 * Saves a completed calibration event into localStorage
 */
export function recordVehicleCalibration(
  vehicleReg: string,
  odometer: number,
  timestamp: string = new Date().toISOString()
): void {
  if (typeof window === 'undefined' || !vehicleReg) return;
  try {
    const data: StoredCalibrationMeta = {
      lastCalibrationDate: timestamp,
      lastCalibrationOdometer: odometer,
      intervalDays: DEFAULT_CALIBRATION_INTERVAL_DAYS
    };
    localStorage.setItem(`${STORAGE_KEY_CALIBRATION_PREFIX}${vehicleReg.toUpperCase()}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Error saving calibration record', e);
  }
}

/**
 * Creates an ATO-compliant Calibration Logbook Entry
 * @param vehicleReg Registration number
 * @param physicalDashboardReading The actual verified odometer number from physical cluster
 * @param currentAppOdometer The app's prior estimated odometer reading
 * @param imageUrl Photo of the odometer cluster (ATO evidentiary substantiation)
 * @param notes Notes or reason (e.g., Monthly calibration, Service invoice align)
 */
export function createAtoCalibrationTrip(
  vehicleReg: string,
  physicalDashboardReading: number,
  currentAppOdometer: number,
  imageUrl?: string,
  notes?: string
): Trip {
  const drift = physicalDashboardReading - currentAppOdometer;
  const now = new Date().toISOString();

  // ATO Division 28 & FBT Rule: Any unexplained positive discrepancy is attributed to unlogged Personal travel
  // to prevent inflating business percentage deductions.
  const distanceAdjustment = drift > 0 ? drift : 0;
  const tripType = 'personal';

  let compliantNote = notes?.trim() || 'ATO Monthly Odometer Calibration & Cluster Alignment';
  if (drift !== 0) {
    const sign = drift > 0 ? `+${drift}` : `${drift}`;
    compliantNote += ` (Dashboard cluster adjusted ${sign} km vs GPS estimate. Logbook baseline synchronized)`;
  } else {
    compliantNote += ' (Dashboard verified: 100% exact match with GPS estimate)';
  }

  const calibrationTrip: Trip = {
    id: crypto.randomUUID(),
    status: 'completed',
    verificationStatus: 'verified', // Pre-verified since user confirmed actual dashboard
    start: {
      value: currentAppOdometer,
      timestamp: now,
      imageUrl
    },
    end: {
      value: physicalDashboardReading,
      timestamp: now,
      imageUrl
    },
    distance: distanceAdjustment,
    tripType,
    clientName: 'ATO Odometer Calibration',
    registrationNumber: vehicleReg.toUpperCase(),
    notes: compliantNote,
    trackingMode: 'camera',
    triggerSource: 'manual',
    isCalibration: true,
    calibrationDrift: drift,
    calibrationReason: compliantNote
  };

  recordVehicleCalibration(vehicleReg, physicalDashboardReading, now);

  return calibrationTrip;
}

/**
 * Silently performs an ATO odometer recalibration whenever a photo-verified reading is taken.
 * Resets the 30-day monthly calibration schedule and generates a calibration alignment entry
 * if there is any drift between the last recorded end odometer and the photo-evidenced start odometer.
 * 
 * @param vehicleReg The vehicle registration number
 * @param photoOdoValue The exact odometer reading evidenced by the photo
 * @param lastRecordedEndOdo The end odometer from the previous completed trip for this vehicle
 * @param photoImageUrl The image evidence from the camera scan (optional)
 * @returns An ATO calibration Trip record if drift was adjusted, or null if already 100% aligned
 */
export function processSilentPhotoCalibration(
  vehicleReg: string,
  photoOdoValue: number,
  lastRecordedEndOdo: number | null,
  photoImageUrl?: string
): Trip | null {
  const regUpper = vehicleReg.toUpperCase();
  const now = new Date().toISOString();

  // Always reset the 30-day monthly calibration timer because a verified physical reading was captured
  recordVehicleCalibration(regUpper, photoOdoValue, now);

  // If no prior trip or readings match exactly, no alignment trip needed
  if (lastRecordedEndOdo === null) {
    return null;
  }

  const drift = photoOdoValue - lastRecordedEndOdo;
  if (drift === 0) {
    // Exact match: timer reset, no drift adjustment needed
    return null;
  }

  // Create an automatic recalibration alignment entry to adjust previous end trip to actual photo reading
  const sign = drift > 0 ? `+${drift}` : `${drift}`;
  const notes = `ATO Auto-Recalibration: Aligned previous trip end (${lastRecordedEndOdo}) to photo-verified start (${photoOdoValue}). Drift: ${sign} km. Baseline synced.`;

  const calibrationTrip: Trip = {
    id: crypto.randomUUID(),
    status: 'completed',
    verificationStatus: 'verified',
    start: {
      value: lastRecordedEndOdo,
      timestamp: now,
      imageUrl: photoImageUrl
    },
    end: {
      value: photoOdoValue,
      timestamp: now,
      imageUrl: photoImageUrl
    },
    distance: drift > 0 ? drift : 0, // ATO Division 28 rule: Unlogged movement attributed to personal
    tripType: 'personal',
    clientName: 'ATO Cluster Auto-Recalibration',
    registrationNumber: regUpper,
    notes,
    trackingMode: 'camera',
    triggerSource: 'manual',
    isCalibration: true,
    calibrationDrift: drift,
    calibrationReason: notes
  };

  return calibrationTrip;
}

