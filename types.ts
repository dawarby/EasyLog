export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
  address?: string;
  accuracy?: number;
}

export interface OdometerReading {
  value: number;
  timestamp: string; // ISO string
  imageUrl?: string; // Base64 or URL
  location?: LocationPoint;
}

export interface Trip {
  id: string;
  start: OdometerReading;
  end?: OdometerReading;
  distance?: number; // Calculated distance
  status: 'active' | 'completed';
  verificationStatus?: 'pending' | 'verified';
  notes?: string;
  clientName?: string;
  tripType?: 'work' | 'personal';
  registrationNumber?: string;
  trackingMode?: 'camera' | 'gps';
  startLocation?: LocationPoint;
  endLocation?: LocationPoint;
  routeCoordinates?: [number, number][];
  triggerSource?: 'manual' | 'bluetooth' | 'shortcut';
  isCalibration?: boolean;
  calibrationDrift?: number; // Physical reading - app estimated reading
  calibrationReason?: string;
}

export interface VehicleCalibrationStatus {
  vehicleReg: string;
  lastCalibrationDate: string | null;
  lastCalibrationOdometer: number | null;
  daysSinceLastCalibration: number;
  isOverdue: boolean;
  intervalDays: number;
}

export interface BluetoothConfig {
  enabled: boolean;
  deviceName: string;
  vehicleReg: string;
  defaultTripType: 'work' | 'personal';
  autoEndTrip: boolean;
}

export interface TrackingSettings {
  mode: 'camera' | 'gps';
  keepScreenAwake: boolean;
  highAccuracy: boolean;
  autoStopAlert: boolean;
}

export interface SavedLocation {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number; // Geofence radius in meters, default 250m
}

export interface HomeWorkConfig {
  home: SavedLocation;
  work: SavedLocation;
  autoDetectHomeAsPersonal: boolean;
  autoDetectWorkAsBusiness: boolean;
}

export interface Backup {
  id: string;
  timestamp: string;
  tripCount: number;
  sizeBytes: number;
  data: Trip[];
}