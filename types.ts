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

export interface Backup {
  id: string;
  timestamp: string;
  tripCount: number;
  sizeBytes: number;
  data: Trip[];
}