import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Trip, OdometerReading, Backup, LocationPoint, BluetoothConfig } from './types';
import { TripHistory } from './components/TripHistory';
import { OdometerScanner } from './components/OdometerScanner';
import { TripEditor } from './components/TripEditor';
import { SettingsModal, SettingsTab } from './components/SettingsModal';
import { MissedTripAlert } from './components/MissedTripAlert';
import { OfflineIndicator } from './components/OfflineIndicator';
import { GpsStartModal } from './components/GpsStartModal';
import { GpsDriveHud } from './components/GpsDriveHud';
import { GpsEndModal } from './components/GpsEndModal';
import { BluetoothSetupModal } from './components/BluetoothSetupModal';
import { TripMapModal } from './components/TripMapModal';
import { TripVerificationModal } from './components/TripVerificationModal';
import { OdometerCalibrationModal } from './components/OdometerCalibrationModal';
import { CalibrationReminderBanner } from './components/CalibrationReminderBanner';
import { calculateDistance, reverseGeocode, isPlaceholderAddress, requestScreenWakeLock, releaseScreenWakeLock, playTripStartTone, playTripEndTone, triggerHaptic, getCurrentPosition } from './services/gpsService';
import { getStoredBluetoothConfig, saveBluetoothConfig, STORAGE_KEY_PASSENGER_MODE, DEFAULT_BT_CONFIG, syncWithNativeAndroidBridge, getVehicleForBluetoothDevice } from './services/bluetoothService';
import { getVehicleCalibrationStatus, getOverdueVehicles } from './services/odometerCalibrationService';
import { sendCalibrationReminderNotification } from './services/pushNotificationService';
import { getStoredHomeWorkConfig, evaluateTripPurpose, isLocationMatch } from './services/locationConfigService';
import { CarFront, Play, Square, Briefcase, Settings as SettingsIcon, X, CheckCircle2, User, ExternalLink, AlertCircle, AlertTriangle, Zap, ArrowRight, CornerDownRight, HardDrive, Navigation, Camera, Bluetooth, Shield, UserX, Radio, Map, BookOpen, Info, FileCheck, Clock, Gauge } from 'lucide-react';
import { saveSnapshotToFolder, checkDirectoryConnection, listExternalBackups, loadBackupFile, connectDirectory, getConnectedFolderName, disconnectDirectory } from './services/storageService';

// Key for Local Storage - EasyLog
const STORAGE_KEY_TRIPS = 'easylog_trips';
const STORAGE_KEY_ACTIVE = 'easylog_active_trip';
const STORAGE_KEY_BACKUPS = 'easylog_backups';
const STORAGE_KEY_VEHICLES = 'easylog_vehicles';
const STORAGE_KEY_UNIT = 'easylog_unit';
const STORAGE_KEY_TRACKING_MODE = 'easylog_tracking_mode';
const STORAGE_KEY_WAKE_LOCK = 'easylog_wake_lock';
const STORAGE_KEY_HIGH_ACCURACY = 'easylog_high_accuracy';

// Demo Data for Testing
const DEMO_TRIPS: Trip[] = [
  {
    id: 'demo-1',
    status: 'completed',
    verificationStatus: 'verified',
    start: {
      value: 45200,
      timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      location: { latitude: -33.8688, longitude: 151.2093, address: 'George St, Sydney CBD' }
    },
    end: {
      value: 45245,
      timestamp: new Date(Date.now() - 172800000 + 5400000).toISOString(), // +1.5 hours
      location: { latitude: -33.8915, longitude: 151.2767, address: 'Campbell Parade, Bondi Beach' }
    },
    distance: 45,
    notes: 'Grocery run & errand',
    clientName: 'Personal',
    tripType: 'personal',
    registrationNumber: 'ABC-123',
    trackingMode: 'gps',
    startLocation: { latitude: -33.8688, longitude: 151.2093, address: 'George St, Sydney CBD' },
    endLocation: { latitude: -33.8915, longitude: 151.2767, address: 'Campbell Parade, Bondi Beach' },
    routeCoordinates: [
      [-33.8688, 151.2093],
      [-33.8760, 151.2280],
      [-33.8840, 151.2520],
      [-33.8915, 151.2767]
    ]
  },
  {
    id: 'demo-2',
    status: 'completed',
    verificationStatus: 'pending',
    start: {
      value: 45310,
      timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      location: { latitude: -33.8688, longitude: 151.2093, address: 'Sydney Tech Park' }
    },
    end: {
      value: 45432,
      timestamp: new Date(Date.now() - 86400000 + 7200000).toISOString(), // +2 hours
      location: { latitude: -33.8150, longitude: 151.0011, address: 'Parramatta Business Centre' }
    },
    distance: 122,
    notes: 'Site visit for project review',
    clientName: 'Acme Corp',
    tripType: 'work',
    registrationNumber: 'XYZ-999',
    trackingMode: 'gps',
    triggerSource: 'bluetooth',
    startLocation: { latitude: -33.8688, longitude: 151.2093, address: 'Sydney Tech Park' },
    endLocation: { latitude: -33.8150, longitude: 151.0011, address: 'Parramatta Business Centre' },
    routeCoordinates: [
      [-33.8688, 151.2093],
      [-33.8520, 151.1300],
      [-33.8340, 151.0650],
      [-33.8150, 151.0011]
    ]
  }
];

const getFYDefaults = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = now.getMonth() < 6 ? currentYear - 1 : currentYear;
  
  const start = new Date(startYear, 6, 1); // July 1st
  const offset = start.getTimezoneOffset() * 60000;
  const startStr = (new Date(start.getTime() - offset)).toISOString().split('T')[0];
  const endStr = (new Date(now.getTime() - offset)).toISOString().split('T')[0];
  
  return { start: startStr, end: endStr };
};

export default function App() {
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [history, setHistory] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [scannerMode, setScannerMode] = useState<'start' | 'end'>('start');
  
  // Settings State
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');
  const [trackingMode, setTrackingMode] = useState<'camera' | 'gps'>('gps');
  const [keepScreenAwake, setKeepScreenAwake] = useState<boolean>(true);
  const [highAccuracy, setHighAccuracy] = useState<boolean>(true);

  // GPS Active Tracking State
  const [showGpsStart, setShowGpsStart] = useState<boolean>(false);
  const [showGpsEnd, setShowGpsEnd] = useState<boolean>(false);
  const [trackedGpsDistance, setTrackedGpsDistance] = useState<number>(0);
  const [currentGpsSpeed, setCurrentGpsSpeed] = useState<number>(0);
  const [gpsDurationSeconds, setGpsDurationSeconds] = useState<number>(0);
  const [currentGpsLocation, setCurrentGpsLocation] = useState<LocationPoint | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isStationary, setIsStationary] = useState<boolean>(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState<boolean>(false);

  // Bluetooth & Passenger Protection State
  const [isBluetoothModalOpen, setIsBluetoothModalOpen] = useState<boolean>(false);
  const [bluetoothConfig, setBluetoothConfig] = useState<BluetoothConfig>(getStoredBluetoothConfig());
  const [passengerMode, setPassengerMode] = useState<boolean>(false);
  const hasProcessedUrlAction = useRef(false);

  // Map View Modal State
  const [isMapModalOpen, setIsMapModalOpen] = useState<boolean>(false);
  const [selectedMapTrip, setSelectedMapTrip] = useState<Trip | null>(null);

  // Filter State
  const fy = getFYDefaults();
  const [filterType, setFilterType] = useState<'all' | 'work' | 'personal' | 'unverified' | 'gps'>('all');
  const [filterRego, setFilterRego] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(fy.start);
  const [endDate, setEndDate] = useState<string>(fy.end);
  
  // Trip Verification Queue State
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState<boolean>(false);
  const unverifiedTrips = useMemo(() => {
    return history.filter(t => t.verificationStatus === 'pending');
  }, [history]);

  // Overdue Monthly Odometer Calibration Vehicles
  const overdueVehicles = useMemo(() => {
    return getOverdueVehicles(vehicles, history, 30);
  }, [vehicles, history]);

  const handleCommitTrip = (tripToCommit: Trip) => {
    const committed: Trip = {
      ...tripToCommit,
      verificationStatus: 'verified'
    };
    handleSaveTrip(committed);
  };

  const handleCommitAllTrips = () => {
    const updatedHistory = history.map(t => 
      t.verificationStatus === 'pending' ? { ...t, verificationStatus: 'verified' as const } : t
    );
    setHistory(updatedHistory);
    createSnapshot(updatedHistory);
    showNotification("All pending trips committed to official logbook!", "success");
  };

  // Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

  // Settings & Backup State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('setup');
  const [backups, setBackups] = useState<Backup[]>([]);
  const [externalBackups, setExternalBackups] = useState<Backup[]>([]);
  const [hasExternalStorage, setHasExternalStorage] = useState(false);
  const [connectedFolder, setConnectedFolder] = useState<string | null>(null);
  const [backupPermissionNeeded, setBackupPermissionNeeded] = useState(false);

  const openSettings = (tab: SettingsTab = 'setup') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  // Missed Trip Detection State
  const [showMissedTripAlert, setShowMissedTripAlert] = useState(false);
  const [pendingStartTrip, setPendingStartTrip] = useState<{
    value: number;
    imageUrl: string;
    notes?: string;
    clientName?: string;
    tripType?: 'work' | 'personal';
    registrationNumber?: string;
  } | null>(null);
  const [missedTripData, setMissedTripData] = useState<{
    gap: number;
    lastOdo: number;
    currentOdo: number;
    vehicle: string;
    lastTime: string;
  } | null>(null);

  // Chain Trip / Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastFinishedTrip, setLastFinishedTrip] = useState<Trip | null>(null);
  const [prefilledStartValue, setPrefilledStartValue] = useState<number | null>(null);

  // Abort Confirmation State
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // ATO Calibration State
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [calibrationTargetVehicle, setCalibrationTargetVehicle] = useState<string>('');
  const [isCalibrationBannerDismissed, setIsCalibrationBannerDismissed] = useState(false);

  const openCalibration = (vehicleReg?: string) => {
    setCalibrationTargetVehicle(vehicleReg || vehicles[0] || '');
    setIsCalibrationOpen(true);
  };

  // Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load data on mount
  useEffect(() => {
    const savedTrips = localStorage.getItem(STORAGE_KEY_TRIPS) || localStorage.getItem('snaplog_trips');
    const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE) || localStorage.getItem('snaplog_active_trip');
    const savedBackups = localStorage.getItem(STORAGE_KEY_BACKUPS) || localStorage.getItem('snaplog_backups');
    const savedVehicles = localStorage.getItem(STORAGE_KEY_VEHICLES) || localStorage.getItem('snaplog_vehicles');
    const savedUnit = localStorage.getItem(STORAGE_KEY_UNIT) || localStorage.getItem('snaplog_unit');
    const savedMode = localStorage.getItem(STORAGE_KEY_TRACKING_MODE) || localStorage.getItem('snaplog_tracking_mode');
    const savedWake = localStorage.getItem(STORAGE_KEY_WAKE_LOCK) || localStorage.getItem('snaplog_wake_lock');
    const savedAcc = localStorage.getItem(STORAGE_KEY_HIGH_ACCURACY) || localStorage.getItem('snaplog_high_accuracy');

    let loadedHistory: Trip[] = [];

    // 1. Load History (check both easylog_trips and snaplog_trips and backups)
    try {
      const easyRaw = localStorage.getItem(STORAGE_KEY_TRIPS);
      const snapRaw = localStorage.getItem('snaplog_trips');
      const easyTrips: Trip[] = easyRaw ? JSON.parse(easyRaw) : [];
      const snapTrips: Trip[] = snapRaw ? JSON.parse(snapRaw) : [];

      // Combine trips from both keys by unique ID (prioritizing non-demo trips)
      const tripDict: Record<string, Trip> = {};
      snapTrips.forEach((t: Trip) => { if (t && t.id) tripDict[t.id] = t; });
      easyTrips.forEach((t: Trip) => { if (t && t.id) tripDict[t.id] = t; });

      const combined: Trip[] = Object.values(tripDict);
      const hasRealTrips = combined.some((t: Trip) => !t.id.startsWith('demo-'));
      const effectiveCombined = hasRealTrips ? combined.filter((t: Trip) => !t.id.startsWith('demo-')) : combined;

      if (effectiveCombined.length > 0) {
        loadedHistory = effectiveCombined;
      } else {
        // Also check if any backup has saved trips
        const backupsRaw = localStorage.getItem(STORAGE_KEY_BACKUPS) || localStorage.getItem('snaplog_backups');
        if (backupsRaw) {
          const parsedBackups: Backup[] = JSON.parse(backupsRaw);
          if (Array.isArray(parsedBackups) && parsedBackups.length > 0 && parsedBackups[0]?.data?.length > 0) {
            loadedHistory = parsedBackups[0].data;
          }
        }
      }

      if (loadedHistory.length === 0) {
        loadedHistory = DEMO_TRIPS;
      }
    } catch (e) {
      console.error("Failed to parse history", e);
      loadedHistory = DEMO_TRIPS;
    }
    setHistory(loadedHistory);

    // 2. Load Active Trip
    if (savedActive) {
      try {
        const parsed = JSON.parse(savedActive);
        setActiveTrip(parsed);
        if (parsed.trackingMode === 'gps') {
          setTrackedGpsDistance(parsed.distance || 0);
          if (parsed.startLocation) {
            setCurrentGpsLocation(parsed.startLocation);
          }
        }
      } catch (e) {
        console.error("Failed to parse active trip", e);
      }
    }

    // 3. Load Backups
    if (savedBackups) {
      try {
        setBackups(JSON.parse(savedBackups));
      } catch (e) {
        console.error("Failed to parse backups", e);
      }
    }

    // 4. Load Vehicles
    if (savedVehicles) {
      try {
        const parsed = JSON.parse(savedVehicles);
        setVehicles(parsed);
      } catch (e) { console.error(e); }
    }

    // 5. Load Unit & Preferences
    if (savedUnit === 'mi') {
        setDistanceUnit('mi');
    }
    if (savedMode === 'camera' || savedMode === 'gps') {
        setTrackingMode(savedMode);
    }
    if (savedWake !== null) {
        setKeepScreenAwake(savedWake === 'true');
    }
    if (savedAcc !== null) {
        setHighAccuracy(savedAcc === 'true');
    }

    // 6. Check External Storage
    checkDirectoryConnection().then(isConnected => {
      setHasExternalStorage(isConnected);
      if (isConnected) {
        getConnectedFolderName().then(name => setConnectedFolder(name));
        listExternalBackups().then(list => {
          setExternalBackups(list);
          setBackupPermissionNeeded(false);
        }).catch(() => {
          setBackupPermissionNeeded(true);
        });
      }
    });

    // 7. Load Passenger Mode
    const savedPassenger = localStorage.getItem(STORAGE_KEY_PASSENGER_MODE);
    if (savedPassenger !== null) {
      setPassengerMode(savedPassenger === 'true');
    }

  }, []);

  // URL Deep Link & Native Android Play Store Car Bluetooth Bridge
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Process URL actions (e.g. from notifications or deep links)
    if (!hasProcessedUrlAction.current) {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      const vehicleParam = params.get('vehicle');

      if (action === 'start_trip' || action === 'bluetooth_start') {
        hasProcessedUrlAction.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => {
          handleStartBluetoothTrip(vehicleParam || undefined);
        }, 500);
      } else if (action === 'end_trip' || action === 'bluetooth_end') {
        hasProcessedUrlAction.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => {
          handleEndBluetoothTrip();
        }, 500);
      } else if (action === 'verify_trips') {
        hasProcessedUrlAction.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => {
          setIsVerificationModalOpen(true);
        }, 500);
      }
    }

    // 1b. Listen for custom events from notifications and deep links
    const handleOpenVerification = () => {
      setIsVerificationModalOpen(true);
    };

    const handleOpenCalibrationEvent = (event: any) => {
      const v = event?.detail?.vehicleReg || vehicles[0] || '';
      openCalibration(v);
    };

    window.addEventListener('open-verification-queue', handleOpenVerification);
    window.addEventListener('open-calibration-dialog', handleOpenCalibrationEvent);

    // 2. Native Android Play Store Bridge (Zero-Tasker Direct Bluetooth Broadcast)
    const handleNativeConnect = (event: any) => {
      const vehicle = event?.detail?.vehicle;
      const device = event?.detail?.device;
      const macAddress = event?.detail?.macAddress;
      handleStartBluetoothTrip(vehicle, device, macAddress);
    };

    const handleNativeDisconnect = () => {
      handleEndBluetoothTrip();
    };

    window.addEventListener('android_bluetooth_connected', handleNativeConnect);
    window.addEventListener('android_bluetooth_disconnected', handleNativeDisconnect);

    // Direct interface for Native Android WebView JavascriptInterface
    (window as any).EasyLogNative = {
      isNative: true,
      onBluetoothConnected: (device?: string, vehicle?: string, macAddress?: string) => {
        handleStartBluetoothTrip(vehicle, device, macAddress);
      },
      onBluetoothDisconnected: () => {
        handleEndBluetoothTrip();
      },
      setPassengerMode: (enabled: boolean) => {
        handlePassengerModeToggle(enabled);
      },
      isTripActive: () => !!activeTrip
    };

    // Sync current preferences to native Android shared preferences if running in native app
    syncWithNativeAndroidBridge(bluetoothConfig, passengerMode);

    return () => {
      window.removeEventListener('open-verification-queue', handleOpenVerification);
      window.removeEventListener('open-calibration-dialog', handleOpenCalibrationEvent);
      window.removeEventListener('android_bluetooth_connected', handleNativeConnect);
      window.removeEventListener('android_bluetooth_disconnected', handleNativeDisconnect);
    };
  }, [history, vehicles, activeTrip, passengerMode, bluetoothConfig]);

  // Sync vehicles from history to ensure list is complete
  useEffect(() => {
    const historyRegos = new Set(
      history
        .map(t => t.registrationNumber)
        .filter((r): r is string => !!r && r.trim() !== '')
        .map(r => r.toUpperCase())
    );

    const hasMissing = Array.from(historyRegos).some(r => !vehicles.includes(r));

    if (hasMissing) {
      setVehicles(prev => {
        const unique = new Set([...prev, ...historyRegos]);
        if (unique.size === prev.length) return prev;
        return Array.from(unique).sort();
      });
    }
  }, [history, vehicles]);

  // Save data on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (activeTrip) {
      localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(activeTrip));
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE);
    }
  }, [activeTrip]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BACKUPS, JSON.stringify(backups));
  }, [backups]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VEHICLES, JSON.stringify(vehicles));
  }, [vehicles]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_UNIT, distanceUnit);
  }, [distanceUnit]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TRACKING_MODE, trackingMode);
  }, [trackingMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WAKE_LOCK, keepScreenAwake.toString());
  }, [keepScreenAwake]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HIGH_ACCURACY, highAccuracy.toString());
  }, [highAccuracy]);

  // Self-healing migration: backfill any missing or placeholder start/end addresses in historical trips
  useEffect(() => {
    let isCancelled = false;
    const repairHistoryAddresses = async () => {
      let hasUpdates = false;
      const updatedHistory = await Promise.all(
        history.map(async (trip) => {
          let updatedTrip = { ...trip };
          let changed = false;

          // Check start location address
          const startLoc = updatedTrip.startLocation || updatedTrip.start?.location;
          if (startLoc && startLoc.latitude && startLoc.longitude && startLoc.latitude !== 0 && isPlaceholderAddress(startLoc.address)) {
            try {
              const addr = await reverseGeocode(startLoc.latitude, startLoc.longitude);
              if (addr && !isPlaceholderAddress(addr)) {
                updatedTrip = {
                  ...updatedTrip,
                  startLocation: { ...startLoc, address: addr },
                  start: { ...updatedTrip.start, location: { ...(updatedTrip.start?.location || startLoc), address: addr } }
                };
                changed = true;
              }
            } catch (e) {}
          }

          // Check end location address
          const endLoc = updatedTrip.endLocation || updatedTrip.end?.location;
          if (endLoc && endLoc.latitude && endLoc.longitude && endLoc.latitude !== 0 && isPlaceholderAddress(endLoc.address)) {
            try {
              const addr = await reverseGeocode(endLoc.latitude, endLoc.longitude);
              if (addr && !isPlaceholderAddress(addr)) {
                updatedTrip = {
                  ...updatedTrip,
                  endLocation: { ...endLoc, address: addr },
                  end: updatedTrip.end ? { ...updatedTrip.end, location: { ...(updatedTrip.end.location || endLoc), address: addr } } : undefined
                };
                changed = true;
              }
            } catch (e) {}
          }

          if (changed) hasUpdates = true;
          return updatedTrip;
        })
      );

      if (!isCancelled && hasUpdates) {
        setHistory(updatedHistory);
      }
    };

    const timer = setTimeout(() => {
      repairHistoryAddresses();
    }, 1500);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Real-time GPS Tracking Watcher Effect
  useEffect(() => {
    if (!activeTrip || activeTrip.trackingMode !== 'gps') {
      return;
    }

    // Screen Wake Lock
    if (keepScreenAwake) {
      requestScreenWakeLock().then(setIsWakeLockActive);
    }

    // Elapsed Duration Timer
    const startTime = new Date(activeTrip.start.timestamp).getTime();
    const timerInterval = setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setGpsDurationSeconds(elapsed);
    }, 1000);

    // Geolocation Watcher
    let lastLat: number | null = activeTrip.startLocation?.latitude || null;
    let lastLon: number | null = activeTrip.startLocation?.longitude || null;
    let lastMoveTime = Date.now();

    let watchId: number | null = null;
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy, speed } = pos.coords;
          setGpsAccuracy(accuracy);

          // Speed in km/h or mph
          const rawSpeedKmh = (speed !== null && speed >= 0) ? (speed * 3.6) : 0;
          const speedInUnit = distanceUnit === 'mi' ? (rawSpeedKmh * 0.621371) : rawSpeedKmh;
          setCurrentGpsSpeed(speedInUnit);

          // Update current position display immediately so coordinates are never missing
          setCurrentGpsLocation((prev) => ({
            latitude,
            longitude,
            accuracy,
            timestamp: new Date().toISOString(),
            address: prev?.address || 'Tracking GPS route...'
          }));

          // Filter out extreme inaccurate fixes (> 100m) for distance calculations
          if (accuracy > 100) return;

          // If active trip's start location was missing coordinates (0,0) or still has placeholder address,
          // backfill it immediately with this accurate fix!
          if (!lastLat || lastLat === 0) {
            lastLat = latitude;
            lastLon = longitude;
            setActiveTrip((curr) => {
              if (!curr) return null;
              const curStartAddr = curr.startLocation?.address || curr.start?.location?.address;
              const needsAddress = isPlaceholderAddress(curStartAddr);
              const locPoint: LocationPoint = {
                latitude,
                longitude,
                accuracy,
                timestamp: curr.startLocation?.timestamp || new Date().toISOString(),
                address: !needsAddress && curStartAddr ? curStartAddr : 'Resolving start address...'
              };

              if (needsAddress) {
                reverseGeocode(latitude, longitude).then((addr) => {
                  if (addr && !isPlaceholderAddress(addr)) {
                    setActiveTrip((c) => {
                      if (!c) return null;
                      return {
                        ...c,
                        startLocation: { ...(c.startLocation || locPoint), address: addr },
                        start: { ...c.start, location: { ...(c.start?.location || locPoint), address: addr } }
                      };
                    });
                  }
                });
              }

              return {
                ...curr,
                startLocation: locPoint,
                start: {
                  ...curr.start,
                  location: locPoint
                }
              };
            });
          } else {
            // Check if start location has valid coordinates but address is still a placeholder
            setActiveTrip((curr) => {
              if (!curr) return null;
              const curStartAddr = curr.startLocation?.address || curr.start?.location?.address;
              if (isPlaceholderAddress(curStartAddr)) {
                const sLat = curr.startLocation?.latitude || curr.start?.location?.latitude || latitude;
                const sLon = curr.startLocation?.longitude || curr.start?.location?.longitude || longitude;
                if (sLat !== 0 && sLon !== 0) {
                  reverseGeocode(sLat, sLon).then((addr) => {
                    if (addr && !isPlaceholderAddress(addr)) {
                      setActiveTrip((c) => {
                        if (!c) return null;
                        return {
                          ...c,
                          startLocation: { ...(c.startLocation || { latitude: sLat, longitude: sLon }), address: addr },
                          start: { ...c.start, location: { ...(c.start?.location || { latitude: sLat, longitude: sLon }), address: addr } }
                        };
                      });
                    }
                  });
                }
              }
              return curr;
            });
          }

          if (lastLat !== null && lastLon !== null) {
            const delta = calculateDistance(lastLat, lastLon, latitude, longitude, distanceUnit);
            // Ignore jitter: minimum displacement 8m unless speed indicates movement
            if (delta >= (distanceUnit === 'mi' ? 0.005 : 0.008) || rawSpeedKmh > 3) {
              lastMoveTime = Date.now();
              setIsStationary(false);

              setTrackedGpsDistance((prev) => {
                const updated = prev + delta;
                setActiveTrip((curr) => curr ? { ...curr, distance: updated } : null);
                return updated;
              });

              lastLat = latitude;
              lastLon = longitude;
            } else {
              // Stationary check: no movement for 3 minutes
              if (Date.now() - lastMoveTime > 180000) {
                setIsStationary(true);
              }
            }
          } else {
            lastLat = latitude;
            lastLon = longitude;
          }
        },
        (err) => {
          console.warn('GPS location tracking error:', err);
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 20000,
          maximumAge: 3000
        }
      );
    }

    // Periodic reverse geocode refresh (every 35s)
    const geocodeInterval = setInterval(() => {
      if (lastLat && lastLon) {
        reverseGeocode(lastLat, lastLon).then((addr) => {
          setCurrentGpsLocation((prev) => prev ? { ...prev, address: addr } : null);
        });
      }
    }, 35000);

    return () => {
      clearInterval(timerInterval);
      clearInterval(geocodeInterval);
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      releaseScreenWakeLock();
      setIsWakeLockActive(false);
    };
  }, [activeTrip?.id, activeTrip?.trackingMode, keepScreenAwake, highAccuracy, distanceUnit]);

  const getLastKnownOdoForVehicle = (reg: string): number | null => {
    const last = getLastTripForVehicle(reg);
    return last?.end?.value || null;
  };

  const handleStartTripClick = () => {
    if (trackingMode === 'gps') {
      setShowGpsStart(true);
    } else {
      setScannerMode('start');
      setPrefilledStartValue(null);
      setShowScanner(true);
    }
  };

  const handleStartGpsTrip = (data: {
    startOdo: number;
    vehicle: string;
    tripType: 'work' | 'personal';
    clientName: string;
    notes: string;
    startLocation: LocationPoint;
  }) => {
    if (data.vehicle) {
      updateVehiclesList(data.vehicle);
    }

    const newTrip: Trip = {
      id: crypto.randomUUID(),
      start: {
        value: data.startOdo,
        timestamp: new Date().toISOString(),
        location: data.startLocation
      },
      distance: 0,
      status: 'active',
      tripType: data.tripType,
      clientName: data.clientName,
      notes: data.notes,
      registrationNumber: data.vehicle,
      trackingMode: 'gps',
      startLocation: data.startLocation
    };

    setTrackedGpsDistance(0);
    setGpsDurationSeconds(0);
    setCurrentGpsSpeed(0);
    setCurrentGpsLocation(data.startLocation);
    setActiveTrip(newTrip);
    setShowGpsStart(false);

    // If startLocation address is still resolving/placeholder, resolve it in background
    if (isPlaceholderAddress(data.startLocation?.address) && data.startLocation?.latitude && data.startLocation?.longitude && data.startLocation.latitude !== 0) {
      reverseGeocode(data.startLocation.latitude, data.startLocation.longitude).then(addr => {
        if (addr && !isPlaceholderAddress(addr)) {
          setActiveTrip(prev => {
            if (!prev) return null;
            return {
              ...prev,
              startLocation: { ...prev.startLocation!, address: addr },
              start: { ...prev.start, location: prev.start.location ? { ...prev.start.location, address: addr } : undefined }
            };
          });
        }
      });
    }

    showNotification("GPS tracking active! Drive safely.", "success");
  };

  const handleGpsEndTrigger = async () => {
    playTripEndTone();
    triggerHaptic('stop');

    // Ensure start location address is resolved before showing review dialog
    if (activeTrip?.startLocation && activeTrip.startLocation.latitude && activeTrip.startLocation.longitude && activeTrip.startLocation.latitude !== 0) {
      const sAddr = activeTrip.startLocation.address;
      if (isPlaceholderAddress(sAddr)) {
        try {
          const resolved = await reverseGeocode(activeTrip.startLocation.latitude, activeTrip.startLocation.longitude);
          if (resolved && !isPlaceholderAddress(resolved)) {
            setActiveTrip(prev => prev ? {
              ...prev,
              startLocation: { ...prev.startLocation!, address: resolved },
              start: { ...prev.start, location: prev.start.location ? { ...prev.start.location, address: resolved } : undefined }
            } : null);
          }
        } catch (e) {}
      }
    }

    if (currentGpsLocation && currentGpsLocation.latitude !== 0) {
      try {
        const addr = await reverseGeocode(currentGpsLocation.latitude, currentGpsLocation.longitude);
        if (addr && !isPlaceholderAddress(addr)) {
          setCurrentGpsLocation(prev => prev ? { ...prev, address: addr } : null);
        }
      } catch (e) {}
    }

    // Evaluate Home / Work purpose and pre-classify trip type
    const hwConfig = getStoredHomeWorkConfig();
    const endPoint = currentGpsLocation && currentGpsLocation.latitude !== 0 ? { ...currentGpsLocation } : undefined;
    const hwEval = evaluateTripPurpose(activeTrip?.startLocation, endPoint, hwConfig);
    if (hwEval.recommendedType) {
      setActiveTrip(prev => prev ? {
        ...prev,
        tripType: hwEval.recommendedType || prev.tripType,
        notes: prev.notes || (hwEval.reason || undefined)
      } : null);
    }

    setShowGpsEnd(true);
  };

  const handleSaveGpsTrip = (completedTrip: Trip) => {
    setShowGpsEnd(false);
    const tripToSave: Trip = {
      ...completedTrip,
      verificationStatus: completedTrip.verificationStatus || 'pending'
    };
    const cleanHistory = history.filter(t => !t.id.startsWith('demo-'));
    const newHistory = [tripToSave, ...cleanHistory];
    setHistory(newHistory);
    setActiveTrip(null);
    createSnapshot(newHistory);

    setLastFinishedTrip(tripToSave);
    setShowSuccessModal(true);
    showNotification(`Trip saved (${tripToSave.distance} ${distanceUnit}) — added to verification queue`, "success");
  };

  const handlePassengerModeToggle = (val: boolean) => {
    setPassengerMode(val);
    localStorage.setItem(STORAGE_KEY_PASSENGER_MODE, String(val));
    if (val) {
      showNotification("Passenger Mode Active: Auto-tracking paused while riding as a passenger.", "success");
    } else {
      showNotification("Passenger Mode Disabled: Normal vehicle tracking active.", "success");
    }
  };

  const handleStartBluetoothTrip = async (customVehicle?: string, triggeredByDevice?: string, macAddress?: string) => {
    if (passengerMode) {
      showNotification("Passenger Mode is active. Auto-tracking skipped to prevent logging passenger travel.", "error");
      return;
    }

    if (activeTrip) {
      showNotification("A trip is already currently active.", "success");
      return;
    }

    // Resolve vehicle registration & preferences using multi-vehicle Bluetooth allocation mapping
    // Unchanging MAC address is prioritized first, then friendly device name
    let allocatedVehicle = customVehicle;
    let allocatedTripType = bluetoothConfig.defaultTripType || 'work';
    let matchedDeviceName = triggeredByDevice;

    if (triggeredByDevice || macAddress) {
      const match = getVehicleForBluetoothDevice(triggeredByDevice, bluetoothConfig, macAddress);
      if (match.vehicleReg && !customVehicle) {
        allocatedVehicle = match.vehicleReg;
      }
      if (match.tripType) {
        allocatedTripType = match.tripType;
      }
      if (match.matchedMapping?.deviceName) {
        matchedDeviceName = match.matchedMapping.deviceName;
      }
    }

    const targetVehicle = (allocatedVehicle || bluetoothConfig.vehicleReg || vehicles[0] || 'MY-CAR').toUpperCase();
    updateVehiclesList(targetVehicle);

    const startOdo = getLastKnownOdoForVehicle(targetVehicle) || 0;
    let targetTripType = allocatedTripType;

    let startLoc: LocationPoint = {
      latitude: 0,
      longitude: 0,
      timestamp: new Date().toISOString(),
      address: 'Acquiring GPS location...'
    };

    try {
      const pos = await getCurrentPosition(highAccuracy);
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      startLoc = {
        latitude: lat,
        longitude: lon,
        accuracy: acc,
        timestamp: new Date().toISOString(),
        address: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`
      };

      // Fast reverse geocode attempt (up to 1.8s) so trip starts with human-readable address immediately
      try {
        const quickAddr = await Promise.race([
          reverseGeocode(lat, lon),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1800))
        ]);
        if (quickAddr && !isPlaceholderAddress(quickAddr)) {
          startLoc.address = quickAddr;
        }
      } catch (e) {
        // Will be updated via background resolution
      }

      // Check if starting at Home: auto-detect as 'personal' under ATO commute rules
      const hwConfig = getStoredHomeWorkConfig();
      if (hwConfig.autoDetectHomeAsPersonal && isLocationMatch(startLoc, hwConfig.home)) {
        targetTripType = 'personal';
      }

      // Background resolution ensures activeTrip is updated whenever reverse geocoding finishes
      reverseGeocode(lat, lon).then(addr => {
        if (addr && !isPlaceholderAddress(addr)) {
          const freshConfig = getStoredHomeWorkConfig();
          const freshResolvedLoc: LocationPoint = {
            latitude: lat,
            longitude: lon,
            accuracy: acc,
            timestamp: new Date().toISOString(),
            address: addr
          };
          const freshEval = evaluateTripPurpose(freshResolvedLoc, null, freshConfig);

          setCurrentGpsLocation(prev => prev ? { ...prev, address: addr } : freshResolvedLoc);
          setActiveTrip(prev => {
            if (!prev) return null;
            const updatedType = (freshEval.isHomeTrip && freshConfig.autoDetectHomeAsPersonal)
              ? 'personal'
              : prev.tripType;
            return {
              ...prev,
              tripType: updatedType,
              startLocation: {
                ...(prev.startLocation || startLoc),
                latitude: lat,
                longitude: lon,
                address: addr
              },
              start: {
                ...prev.start,
                location: {
                  ...(prev.start?.location || startLoc),
                  latitude: lat,
                  longitude: lon,
                  address: addr
                }
              }
            };
          });
        }
      }).catch(err => {
        console.warn("Background reverse geocode failed on auto-start:", err);
      });

    } catch (err) {
      console.warn("Could not get initial GPS location for Bluetooth trip", err);
    }

    const newTrip: Trip = {
      id: crypto.randomUUID(),
      start: {
        value: startOdo,
        timestamp: new Date().toISOString(),
        location: startLoc
      },
      distance: 0,
      status: 'active',
      tripType: targetTripType,
      registrationNumber: targetVehicle,
      trackingMode: 'gps',
      triggerSource: 'bluetooth',
      startLocation: startLoc
    };

    setTrackedGpsDistance(0);
    setGpsDurationSeconds(0);
    setCurrentGpsSpeed(0);
    setCurrentGpsLocation(startLoc);
    setActiveTrip(newTrip);
    playTripStartTone();
    triggerHaptic('start');

    const hwConfigOnStart = getStoredHomeWorkConfig();
    const isHomeStart = hwConfigOnStart.autoDetectHomeAsPersonal && isLocationMatch(startLoc, hwConfigOnStart.home);
    const devLabel = matchedDeviceName ? ` (${matchedDeviceName})` : '';
    const startMsg = isHomeStart
      ? `🚗 Connected to Car${devLabel}! Auto-tracking started for ${targetVehicle} (Home: Personal Commute)`
      : `🚗 Connected to Car${devLabel}! Auto-tracking started for ${targetVehicle}`;
    showNotification(startMsg, "success");
  };

  const handleEndBluetoothTrip = async () => {
    if (!activeTrip) {
      showNotification("No active trip to end.", "error");
      return;
    }

    if (activeTrip.trackingMode === 'gps') {
      if (bluetoothConfig.autoEndTrip) {
        const finalDist = Math.round(trackedGpsDistance * 10) / 10;
        const endOdo = activeTrip.start.value + Math.round(finalDist);
        let endAddr = currentGpsLocation?.address;
        if ((!endAddr || isPlaceholderAddress(endAddr)) && currentGpsLocation && currentGpsLocation.latitude !== 0) {
          try {
            endAddr = await reverseGeocode(currentGpsLocation.latitude, currentGpsLocation.longitude);
          } catch (e) {}
        }

        // CRITICAL: Ensure start location address is resolved before saving
        let startLocToSave = activeTrip.startLocation || activeTrip.start.location;
        let startAddr = startLocToSave?.address;
        if ((!startAddr || isPlaceholderAddress(startAddr)) && startLocToSave && startLocToSave.latitude && startLocToSave.longitude && startLocToSave.latitude !== 0) {
          try {
            const resolvedStart = await reverseGeocode(startLocToSave.latitude, startLocToSave.longitude);
            if (resolvedStart && !isPlaceholderAddress(resolvedStart)) {
              startAddr = resolvedStart;
            }
          } catch (e) {
            console.warn('Could not reverse geocode start location on auto trip end', e);
          }
        }

        if (startLocToSave && startAddr) {
          startLocToSave = { ...startLocToSave, address: startAddr };
        }

        const endPointToSave = currentGpsLocation ? { ...currentGpsLocation, address: endAddr } : undefined;

        // Auto-detect trip purpose: ATO rule for Home trips = Personal
        const hwConfig = getStoredHomeWorkConfig();
        const hwEval = evaluateTripPurpose(startLocToSave, endPointToSave, hwConfig);
        let finalTripType = activeTrip.tripType || 'work';
        let finalNotes = activeTrip.notes;

        if (hwEval.recommendedType) {
          finalTripType = hwEval.recommendedType;
          if (!finalNotes && hwEval.reason) {
            finalNotes = hwEval.reason;
          }
        }

        const completedTrip: Trip = {
          ...activeTrip,
          status: 'completed',
          distance: finalDist,
          tripType: finalTripType,
          notes: finalNotes,
          start: {
            ...activeTrip.start,
            location: startLocToSave
          },
          startLocation: startLocToSave,
          end: {
            value: endOdo,
            timestamp: new Date().toISOString(),
            location: endPointToSave
          },
          endLocation: endPointToSave
        };

        handleSaveGpsTrip(completedTrip);
        playTripEndTone();
        triggerHaptic('stop');

        const disconnectMsg = (hwEval.isHomeTrip && hwConfig.autoDetectHomeAsPersonal)
          ? `🚗 Car Disconnected — Saved as Personal (Home Commute, ${finalDist} ${distanceUnit})`
          : `🚗 Car Disconnected — Trip saved (${finalDist} ${distanceUnit})`;
        showNotification(disconnectMsg, 'success');

        // Check if vehicle has reached monthly calibration threshold
        const targetVehicle = completedTrip.registrationNumber || bluetoothConfig.vehicleReg || vehicles[0];
        if (targetVehicle) {
          const calibStatus = getVehicleCalibrationStatus(targetVehicle, history);
          if (calibStatus.isOverdue) {
            setTimeout(() => {
              sendCalibrationReminderNotification(targetVehicle, calibStatus.daysSinceLastCalibration);
              showNotification(
                `⚠️ ${targetVehicle} is due for monthly odometer calibration (${calibStatus.daysSinceLastCalibration} days since last sync)`,
                'error'
              );
            }, 1200);
          }
        }
      } else {
        handleGpsEndTrigger();
        showNotification("🚗 Car Disconnected — Review and save your trip", "success");

        const targetVehicle = activeTrip.registrationNumber || bluetoothConfig.vehicleReg || vehicles[0];
        if (targetVehicle) {
          const calibStatus = getVehicleCalibrationStatus(targetVehicle, history);
          if (calibStatus.isOverdue) {
            setTimeout(() => {
              sendCalibrationReminderNotification(targetVehicle, calibStatus.daysSinceLastCalibration);
            }, 1200);
          }
        }
      }
    } else {
      handleEndTripClick();
    }
  };

  const handleOpenTripMap = (trip: Trip) => {
    setSelectedMapTrip(trip);
    setIsMapModalOpen(true);
  };

  const handleOpenAllTripsMap = () => {
    if (history.length > 0) {
      setSelectedMapTrip(history[0]);
      setIsMapModalOpen(true);
    } else {
      showNotification("No trips recorded yet to show on map.", "error");
    }
  };

  const handleUpdateTripFromMap = (updatedTrip: Trip) => {
    handleSaveTrip(updatedTrip);
    setSelectedMapTrip(updatedTrip);
  };

  const handleEndTripClick = () => {
    setScannerMode('end');
    setPrefilledStartValue(null);
    setShowScanner(true);
  };

  const updateVehiclesList = (reg: string) => {
    if (!reg) return;
    const upperReg = reg.toUpperCase();
    if (!vehicles.includes(upperReg)) {
      setVehicles(prev => [...prev, upperReg].sort());
    }
  };

  const handleDeleteVehicle = (reg: string) => {
    setVehicles(prev => prev.filter(v => v !== reg));
  };

  const handleEditVehicle = (oldReg: string, newReg: string) => {
    const upperOld = oldReg.toUpperCase();
    const upperNew = newReg.toUpperCase();
    
    // Update list
    setVehicles(prev => prev.map(v => v === upperOld ? upperNew : v).sort());
    
    // Cascade update to history
    const newHistory = history.map(t => {
      if (t.registrationNumber === upperOld) {
        return { ...t, registrationNumber: upperNew };
      }
      return t;
    });
    setHistory(newHistory);
    
    // Update active trip
    if (activeTrip && activeTrip.registrationNumber === upperOld) {
      setActiveTrip({ ...activeTrip, registrationNumber: upperNew });
    }
    
    createSnapshot(newHistory);
  };

  // Snapshot Logic
  const createSnapshot = async (currentHistory: Trip[]) => {
    // Lightweight snapshot: Remove images to save space
    const lightHistory = currentHistory.map(trip => ({
      ...trip,
      start: { ...trip.start, imageUrl: undefined },
      end: trip.end ? { ...trip.end, imageUrl: undefined } : undefined
    }));

    const snapshot: Backup = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      tripCount: currentHistory.length,
      sizeBytes: new Blob([JSON.stringify(lightHistory)]).size,
      data: lightHistory
    };

    const newBackups = [snapshot, ...backups].slice(0, 6);
    setBackups(newBackups);
    
    // Attempt external save in auto mode (silent)
    if (hasExternalStorage) {
       const result = await saveSnapshotToFolder(lightHistory, true);
       if (!result.success && result.error === 'permission') {
          // If silent save fails due to permission, flag it for the user
          setBackupPermissionNeeded(true);
       } else if (result.success) {
          setBackupPermissionNeeded(false);
          // showNotification(`Backup saved to: ${result.path}`, 'success'); // Optional: Too noisy for auto-save
       }
    }
  };

  const getLastTripForVehicle = (reg: string) => {
    const relevant = history.filter(t => 
        t.registrationNumber === reg && 
        t.status === 'completed' &&
        t.end
    );
    if (relevant.length === 0) return null;
    
    // Sort descending by end date
    return relevant.sort((a, b) => {
        const dateA = new Date(a.end!.timestamp).getTime();
        const dateB = new Date(b.end!.timestamp).getTime();
        return dateB - dateA;
    })[0];
  };

  const handleScanComplete = (value: number, imageUrl: string, notes?: string, clientName?: string, tripType?: 'work' | 'personal', registrationNumber?: string) => {
    
    if (registrationNumber) {
      updateVehiclesList(registrationNumber);
    }

    if (scannerMode === 'start') {
      // --- MISSED TRIP DETECTION LOGIC ---
      if (registrationNumber) { 
        const lastTrip = getLastTripForVehicle(registrationNumber);
        if (lastTrip && lastTrip.end && value > lastTrip.end.value) {
            const gap = value - lastTrip.end.value;
            if (gap > 0) {
               setPendingStartTrip({ value, imageUrl, notes, clientName, tripType, registrationNumber });
               setMissedTripData({
                 gap,
                 lastOdo: lastTrip.end.value,
                 currentOdo: value,
                 vehicle: registrationNumber,
                 lastTime: lastTrip.end.timestamp
               });
               setShowScanner(false);
               setShowMissedTripAlert(true);
               return; 
            }
        }
      }

      createNewActiveTrip({ value, imageUrl, notes, clientName, tripType, registrationNumber });
    } else {
      // END TRIP LOGIC
      if (!activeTrip) return;

      const reading: OdometerReading = {
        value,
        timestamp: new Date().toISOString(),
        imageUrl
      };

      const finalStartVal = activeTrip.start.value;
      
      const distance = value - finalStartVal;
      const finalNotes = notes ? notes : activeTrip.notes;
      const finalClientName = clientName ? clientName : activeTrip.clientName;
      const finalTripType = tripType ? tripType : (activeTrip.tripType || 'work');
      const finalReg = registrationNumber ? registrationNumber : activeTrip.registrationNumber;

      const completedTrip: Trip = {
        ...activeTrip,
        start: {
            ...activeTrip.start,
            value: finalStartVal,
        },
        end: reading,
        distance: distance < 0 ? 0 : distance,
        status: 'completed',
        verificationStatus: 'pending',
        notes: finalNotes,
        clientName: finalClientName,
        tripType: finalTripType,
        registrationNumber: finalReg
      };

      // Filter out demo trips on first real trip completion
      const cleanHistory = history.filter(t => !t.id.startsWith('demo-'));
      const newHistory = [completedTrip, ...cleanHistory];
      setHistory(newHistory);
      setActiveTrip(null);
      createSnapshot(newHistory);
      setShowScanner(false);
      
      // Trigger Success Modal / Chain Trip
      setLastFinishedTrip(completedTrip);
      setShowSuccessModal(true);
    }
  };

  const createNewActiveTrip = (data: { value: number, imageUrl: string, notes?: string, clientName?: string, tripType?: 'work' | 'personal', registrationNumber?: string }) => {
      const reading: OdometerReading = {
        value: data.value,
        timestamp: new Date().toISOString(),
        imageUrl: data.imageUrl
      };

      const newTrip: Trip = {
        id: crypto.randomUUID(),
        start: reading,
        status: 'active',
        notes: data.notes,
        clientName: data.clientName,
        tripType: data.tripType || 'work',
        registrationNumber: data.registrationNumber
      };
      setActiveTrip(newTrip);
      setShowScanner(false);
  };

  // Chain Trip: Start Next Trip using previous End Value
  const handleChainTrip = () => {
      setShowSuccessModal(false);
      if (lastFinishedTrip && lastFinishedTrip.end) {
          if (trackingMode === 'gps') {
              setShowGpsStart(true);
          } else {
              setScannerMode('start');
              setPrefilledStartValue(lastFinishedTrip.end.value);
              setShowScanner(true);
          }
      }
  };

  const handleIgnoreMissedTrip = () => {
    setShowMissedTripAlert(false);
    if (pendingStartTrip) {
       createNewActiveTrip(pendingStartTrip);
       setPendingStartTrip(null);
    }
  };

  const handleAddMissedTrip = () => {
      setShowMissedTripAlert(false);
      if (!missedTripData || !pendingStartTrip) return;
      
      const gapTrip: Trip = {
          id: crypto.randomUUID(),
          status: 'completed',
          start: {
              value: missedTripData.lastOdo,
              timestamp: missedTripData.lastTime,
          },
          end: {
              value: missedTripData.currentOdo,
              timestamp: new Date().toISOString(),
              imageUrl: pendingStartTrip.imageUrl 
          },
          distance: missedTripData.gap,
          tripType: 'work',
          registrationNumber: missedTripData.vehicle,
          notes: 'Missed trip automatically detected',
          clientName: ''
      };
      
      setEditingTrip(gapTrip);
      setIsEditorOpen(true);
  };

  const handleCancelScan = () => {
    setShowScanner(false);
    setPrefilledStartValue(null);
  };

  const handleAbortTrip = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAbortConfirm(true);
  };

  const confirmAbortTrip = () => {
    setActiveTrip(null);
    setShowAbortConfirm(false);
    showNotification("Trip discarded successfully", "success");
  };

  // Editor Handlers
  const handleAddManual = () => {
    setEditingTrip(null);
    setIsEditorOpen(true);
  };

  const handleEditTrip = (trip: Trip) => {
    setEditingTrip(trip);
    setIsEditorOpen(true);
  };

  const handleDeleteTrip = (tripId: string) => {
    const newHistory = history.filter(t => t.id !== tripId);
    if (newHistory.length === 0) {
       setHistory(DEMO_TRIPS);
    } else {
       setHistory(newHistory);
    }
    setIsEditorOpen(false);
    createSnapshot(newHistory);
  };

  const handleSaveTrip = (trip: Trip) => {
    if (trip.registrationNumber) {
      updateVehiclesList(trip.registrationNumber);
    }

    let newHistory = [...history];
    const isExisting = history.some(t => t.id === trip.id);

    if (isExisting) {
      newHistory = history.map(t => t.id === trip.id ? trip : t);
    } else {
      // It's a brand new trip (manual or missed gap)
      newHistory = newHistory.filter(t => !t.id.startsWith('demo-'));
      newHistory = [trip, ...newHistory];
    }
    
    setHistory(newHistory);
    createSnapshot(newHistory);
    
    // If we just filled in a missed trip, we might have a pending real trip to start
    if (pendingStartTrip) {
        setTimeout(() => {
            createNewActiveTrip(pendingStartTrip);
            setPendingStartTrip(null);
        }, 100);
    }
  };

  const handleEditorClose = () => {
      setIsEditorOpen(false);
      // If we cancelled a missed trip log, we still need to start the active trip if pending
      if (pendingStartTrip && !activeTrip) {
         createNewActiveTrip(pendingStartTrip);
         setPendingStartTrip(null);
      }
  };

  const handleExport = () => {
    const dateRangeTrips = history.filter(trip => {
      if (filterRego && trip.registrationNumber !== filterRego) return false;
      
      const tripDate = new Date(trip.start.timestamp);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        if (tripDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23,59,59,999);
        if (tripDate > end) return false;
      }
      return true;
    });

    if (dateRangeTrips.length === 0) {
      alert("No trips match the current date/vehicle filters to export.");
      return;
    }

    const totalDist = dateRangeTrips.reduce((acc, t) => acc + (t.distance || 0), 0);
    const workDist = dateRangeTrips
      .filter(t => (t.tripType || 'work') === 'work')
      .reduce((acc, t) => acc + (t.distance || 0), 0);
    const businessPercent = totalDist > 0 ? ((workDist / totalDist) * 100).toFixed(2) : '0.00';
    const totalTrips = dateRangeTrips.length;
    const unitLabel = distanceUnit === 'km' ? 'km' : 'mi';

    const exportTrips = dateRangeTrips.filter(trip => {
      if (filterType === 'unverified') return trip.verificationStatus === 'pending';
      if (filterType === 'gps') return trip.trackingMode === 'gps' || trip.triggerSource === 'bluetooth';
      return filterType === 'all' || (trip.tripType || 'work') === filterType;
    });

    const headers = ['Start Date', 'Start Time', `Start Odometer (${unitLabel})`, 'End Date', 'End Time', `End Odometer (${unitLabel})`, `Distance (${unitLabel})`, 'Registration', 'Type', 'Tracking Mode', 'Client Name', 'Start Location', 'End Location', 'Status', 'Reason/Notes'];
    
    const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
    const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

    const formatSummaryDate = (d: string) => {
        if(!d) return 'All';
        const [y, m, dNum] = d.split('-').map(Number);
        return new Date(y, m-1, dNum).toLocaleDateString(locale);
    };

    const summaryHeader = [
      `"LOGBOOK SUMMARY"`,
      `"Period: ${formatSummaryDate(startDate)} to ${formatSummaryDate(endDate)}"`,
      `"Vehicle: ${filterRego || 'All'}"`,
      `"Total Trips: ${totalTrips}"`,
      `"Total ${unitLabel === 'km' ? 'Km' : 'Mi'}: ${totalDist}"`,
      `"Business ${unitLabel === 'km' ? 'Km' : 'Mi'}: ${workDist}"`,
      `"Business Use: ${businessPercent}%"`,
      ""
    ].join('\n');

    const csvContent = [
      summaryHeader,
      headers.join(','),
      ...exportTrips.map(trip => {
        const startDateObj = new Date(trip.start.timestamp);
        const endDateObj = trip.end ? new Date(trip.end.timestamp) : null;
        const escapedNotes = trip.notes ? `"${trip.notes.replace(/"/g, '""')}"` : '';
        const escapedClient = trip.clientName ? `"${trip.clientName.replace(/"/g, '""')}"` : '';
        const escapedReg = trip.registrationNumber ? `"${trip.registrationNumber}"` : '';
        const escapedStartLoc = trip.startLocation?.address ? `"${trip.startLocation.address.replace(/"/g, '""')}"` : '';
        const escapedEndLoc = trip.endLocation?.address ? `"${trip.endLocation.address.replace(/"/g, '""')}"` : '';
        const modeLabel = trip.isCalibration ? 'ATO Calibration' : (trip.trackingMode === 'gps' ? 'GPS' : 'Camera');
        const calibPrefix = trip.isCalibration ? '[CALIBRATION SYNC] ' : '';
        const finalEscapedNotes = `"${calibPrefix}${trip.notes ? trip.notes.replace(/"/g, '""') : ''}"`;
        
        return [
          `"${startDateObj.toLocaleDateString(locale)}"`,
          `"${startDateObj.toLocaleTimeString(locale, timeOpts)}"`,
          trip.start.value,
          endDateObj ? `"${endDateObj.toLocaleDateString(locale)}"` : '',
          endDateObj ? `"${endDateObj.toLocaleTimeString(locale, timeOpts)}"` : '',
          trip.end?.value || '',
          trip.distance || 0,
          escapedReg,
          trip.tripType || 'work',
          `"${modeLabel}"`,
          escapedClient,
          escapedStartLoc,
          escapedEndLoc,
          `"${trip.status}"`,
          finalEscapedNotes
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `easylog_logbook_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleArchiveAndReset = () => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      history: history,
      activeTrip: activeTrip,
      settings: { vehicles, distanceUnit }
    };
    
    try {
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `easylog-archive-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setHistory(DEMO_TRIPS);
        setActiveTrip(null);
        setVehicles([]);
        setBackups([]);
        localStorage.clear();
        
        localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(DEMO_TRIPS));
        localStorage.setItem(STORAGE_KEY_UNIT, distanceUnit);
        
        setIsSettingsOpen(false);
        showNotification("System archived and reset successfully.", 'success');
    } catch (e) {
        alert("Failed to generate archive. Data was NOT reset.");
    }
  };

  const handleRestoreSnapshot = (backup: Backup, isExternal: boolean) => {
    try {
      if (backup.data) {
        setHistory(backup.data);
        setActiveTrip(null);
        createSnapshot(backup.data);
        showNotification("Snapshot restored successfully");
        setIsSettingsOpen(false);
      } else if (isExternal) {
        loadBackupFile(backup.id).then(data => {
          if (data) {
            setHistory(data);
            setActiveTrip(null);
            createSnapshot(data);
            showNotification("External snapshot restored");
            setIsSettingsOpen(false);
          } else {
             showNotification("Failed to load external file", 'error');
          }
        });
      }
    } catch (e) {
      showNotification("Failed to restore snapshot", 'error');
    }
  };

  const handleDownloadSnapshot = async (backup: Backup) => {
    let data = backup.data;
    if (!data || data.length === 0) {
       data = await loadBackupFile(backup.id) || [];
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `easylog-snapshot-${backup.timestamp.split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const handleRestoreFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const text = e.target?.result as string;
              const json = JSON.parse(text);
              
              if (json.history || json.activeTrip) {
                  if (json.history && Array.isArray(json.history)) {
                      setHistory(json.history);
                  }
                  if (json.activeTrip) {
                      setActiveTrip(json.activeTrip);
                  } else {
                      setActiveTrip(null);
                  }
                  if (json.settings?.vehicles && Array.isArray(json.settings.vehicles)) {
                      setVehicles(json.settings.vehicles);
                  }
                  if (json.settings?.distanceUnit) {
                      setDistanceUnit(json.settings.distanceUnit);
                  }
                  showNotification("Full archive restored successfully", 'success');
              } 
              else if (Array.isArray(json)) {
                  setHistory(json);
                  setActiveTrip(null);
                  showNotification("Trips restored successfully", 'success');
              } else {
                  throw new Error("Unknown file format");
              }
              
              setIsSettingsOpen(false);
          } catch (err) {
              alert("Invalid backup file format.");
          }
      };
      reader.readAsText(file);
  };

  const handleDisconnectFolder = async () => {
    await disconnectDirectory();
    setHasExternalStorage(false);
    setConnectedFolder(null);
    setExternalBackups([]);
    setBackupPermissionNeeded(false);
    showNotification("Disconnected from backup folder", "success");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 font-sans">
      
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-xl shadow-lg flex items-center animate-fade-in-up ${
           notification.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
        }`}>
           {notification.type === 'success' ? <CheckCircle2 size={18} className="mr-2 text-green-400" /> : <AlertCircle size={18} className="mr-2" />}
           <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-20 safe-area-top">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-md shadow-indigo-200">
              <CarFront size={20} />
            </div>
            <div>
               <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                EasyLog
              </h1>
              <div className="text-[10px] text-gray-400 font-medium leading-none">Smart Mileage Tracker</div>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => openCalibration()}
              className={`p-2 rounded-full transition relative ${
                overdueVehicles.length > 0
                  ? 'text-amber-700 bg-amber-100 hover:bg-amber-200 animate-pulse'
                  : 'text-gray-500 hover:text-amber-700 hover:bg-amber-50'
              }`}
              title={
                overdueVehicles.length > 0
                  ? `ATO Monthly Calibration Due for ${overdueVehicles[0].vehicleReg}`
                  : 'ATO Odometer Calibration & Cluster Alignment'
              }
            >
              <Gauge size={20} />
              {overdueVehicles.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-600 text-white text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center shadow-xs">
                  !
                </span>
              )}
            </button>
            {unverifiedTrips.length > 0 && (
              <button 
                  onClick={() => setIsVerificationModalOpen(true)}
                  className="p-2 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-full transition relative"
                  title={`${unverifiedTrips.length} trip(s) require verification`}
              >
                  <FileCheck size={20} />
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center shadow-xs animate-pulse">
                    {unverifiedTrips.length}
                  </span>
              </button>
            )}
            <button 
                onClick={() => openSettings('guide')}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition"
                title="User Guide & Help"
            >
                <BookOpen size={20} />
            </button>
            {backupPermissionNeeded && (
                <button 
                   onClick={() => openSettings('data')}
                   className="p-2 text-orange-500 bg-orange-50 hover:bg-orange-100 rounded-full transition animate-pulse"
                   title="Backup Paused - Reconnect"
                >
                   <HardDrive size={20} />
                </button>
            )}
            <button 
                onClick={() => openSettings('setup')}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition"
                title="Settings"
            >
                <SettingsIcon size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        
        {/* Persistent Monthly Odometer Calibration Reminder Banner */}
        {!isCalibrationBannerDismissed && overdueVehicles.length > 0 && (
          <CalibrationReminderBanner
            overdueVehicles={overdueVehicles}
            onOpenCalibration={(v) => openCalibration(v)}
            onDismiss={() => setIsCalibrationBannerDismissed(true)}
          />
        )}

        {/* Verification Required Banner Notification */}
        {unverifiedTrips.length > 0 && (
          <div 
            onClick={() => setIsVerificationModalOpen(true)}
            className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-2xl p-4 text-white shadow-md shadow-amber-500/20 border border-amber-400/30 flex items-start justify-between gap-3 cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-0.5 group animate-fade-in"
          >
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <FileCheck size={20} className="text-white" />
              </div>
              <div className="space-y-1">
                <div className="font-bold text-sm leading-tight flex items-center gap-1.5">
                  <span>You have {unverifiedTrips.length} trip{unverifiedTrips.length === 1 ? '' : 's'} logged that require verification.</span>
                </div>
                <p className="text-xs text-amber-100 leading-snug">
                  Take a minute to check personal/business classification and trip reasons before committing to your final logbook.
                </p>
                <div className="text-[10px] text-amber-200 font-medium flex items-center pt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-200 mr-1.5 animate-ping"></span>
                  <span>Included in summary total for live calculations</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsVerificationModalOpen(true);
              }}
              className="px-3 py-2 bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs rounded-xl shadow-xs transition shrink-0 flex items-center space-x-1 whitespace-nowrap active:scale-95 self-center"
            >
              <span>Review & Commit ({unverifiedTrips.length})</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}
        
        {/* Active Trip Card */}
        <section>
          {activeTrip ? (
             activeTrip.trackingMode === 'gps' ? (
               <GpsDriveHud
                 trip={activeTrip}
                 currentSpeed={currentGpsSpeed}
                 trackedDistance={trackedGpsDistance}
                 durationSeconds={gpsDurationSeconds}
                 currentLocation={currentGpsLocation}
                 gpsAccuracy={gpsAccuracy}
                 isWakeLockActive={isWakeLockActive}
                 distanceUnit={distanceUnit}
                 isStationary={isStationary}
                 onEndTrip={handleGpsEndTrigger}
                 onAbortTrip={() => handleAbortTrip()}
                 onOpenMap={() => handleOpenTripMap(activeTrip)}
               />
             ) : (
               <div className="relative bg-white rounded-2xl shadow-lg border-l-4 border-indigo-500 overflow-hidden transform transition-all hover:shadow-xl">
                 <button 
                    onClick={handleAbortTrip}
                    className="absolute top-2 right-2 p-2 text-gray-300 hover:text-red-500 transition-colors z-10"
                    title="Discard Trip"
                 >
                    <X size={20} />
                 </button>
                 <div className="p-6">
                   <div className="flex justify-between items-start mb-4">
                     <div>
                       <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 animate-pulse">
                         ● Trip in Progress
                       </span>
                       <h2 className="text-xl font-bold text-gray-900 mt-2">
                         Current Trip
                       </h2>
                       <div className="flex flex-wrap gap-2 mt-2">
                         {activeTrip.tripType && (
                            <div className={`flex items-center text-xs font-semibold px-2 py-1 rounded-md ${
                                activeTrip.tripType === 'personal' ? 'bg-green-50 text-green-700' : 'bg-indigo-50 text-indigo-700'
                            }`}>
                               {activeTrip.tripType === 'personal' ? <User size={12} className="mr-1"/> : <Briefcase size={12} className="mr-1"/>}
                               {activeTrip.tripType === 'personal' ? 'Personal' : 'Work'}
                            </div>
                         )}
                         {activeTrip.registrationNumber && (
                           <div className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded border border-gray-200">
                             {activeTrip.registrationNumber}
                           </div>
                         )}
                       </div>
                       {activeTrip.clientName && (
                          <div className="flex items-center mt-2 text-sm text-gray-600">
                             <Briefcase size={14} className="mr-1.5 text-gray-400" />
                             {activeTrip.clientName}
                          </div>
                       )}
                     </div>
                     <div className="text-right mt-6">
                        <div className="text-xs text-gray-400 uppercase tracking-wide">Started at</div>
                        <div className="text-xl font-mono font-bold text-gray-800">
                          {activeTrip.start.value.toLocaleString()} {distanceUnit}
                        </div>
                        {!activeTrip.start.imageUrl && (
                            <div className="text-[10px] text-gray-400 mt-1 font-medium bg-gray-100 px-1 rounded inline-block">
                                Entered Manually
                            </div>
                        )}
                     </div>
                   </div>
                   
                   <div className="mt-6 flex gap-3">
                      <button
                        onClick={handleEndTripClick}
                        className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-3 rounded-xl font-semibold flex items-center justify-center transition"
                      >
                        <Square size={18} className="mr-2" />
                        End Trip
                      </button>
                   </div>
                 </div>
               </div>
             )
          ) : (
             <div className="space-y-3">
               {/* Quick Mode Switcher */}
               <div className="flex items-center justify-between px-1">
                 <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                   Tracking Mode
                 </span>
                 <div className="flex bg-gray-200/80 p-0.5 rounded-xl text-xs font-semibold">
                   <button
                     type="button"
                     onClick={() => setTrackingMode('gps')}
                     className={`px-3 py-1.5 rounded-lg flex items-center transition-all ${
                       trackingMode === 'gps'
                         ? 'bg-white text-emerald-700 shadow-sm'
                         : 'text-gray-500 hover:text-gray-800'
                     }`}
                   >
                     <Navigation size={12} className="mr-1.5 text-emerald-600" />
                     Automatic GPS
                   </button>
                   <button
                     type="button"
                     onClick={() => setTrackingMode('camera')}
                     className={`px-3 py-1.5 rounded-lg flex items-center transition-all ${
                       trackingMode === 'camera'
                         ? 'bg-white text-indigo-700 shadow-sm'
                         : 'text-gray-500 hover:text-gray-800'
                     }`}
                   >
                     <Camera size={12} className="mr-1.5 text-indigo-600" />
                     Camera Only
                   </button>
                 </div>
               </div>

               {/* Passenger Mode Alert Banner (if active) */}
               {passengerMode && (
                 <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3.5 flex items-center justify-between text-xs text-amber-900 animate-fade-in shadow-xs">
                   <div className="flex items-center space-x-2.5">
                     <div className="p-1.5 bg-amber-500 text-white rounded-lg shrink-0">
                       <UserX size={16} />
                     </div>
                     <div>
                       <div className="font-bold text-amber-950">Passenger Mode Active</div>
                       <div className="text-[11px] text-amber-800">Auto-tracking paused (travelling as a passenger)</div>
                     </div>
                   </div>
                   <button
                     type="button"
                     onClick={() => handlePassengerModeToggle(false)}
                     className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] rounded-lg transition shrink-0"
                   >
                     Turn Off
                   </button>
                 </div>
               )}

               {/* Car Bluetooth & Zero-Passenger Tracking Card */}
               <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/60 border border-blue-200/70 rounded-2xl p-3 flex items-center justify-between shadow-xs">
                 <button
                   type="button"
                   onClick={() => setIsBluetoothModalOpen(true)}
                   className="flex items-center space-x-2.5 text-left group overflow-hidden pr-2"
                 >
                   <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs group-hover:scale-105 transition-transform shrink-0">
                     <Bluetooth size={16} />
                   </div>
                   <div className="overflow-hidden">
                     <div className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
                       <span className="truncate">Car Bluetooth Auto-Start</span>
                       <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 shrink-0">
                         {bluetoothConfig.deviceName ? bluetoothConfig.deviceName : 'Setup'}
                       </span>
                     </div>
                     <p className="text-[10px] text-gray-500 truncate">
                       {bluetoothConfig.deviceName
                         ? `Tracks only in your car (${bluetoothConfig.vehicleReg || 'All'}) • Passenger rides ignored`
                         : 'Only track in your car • Ignores passenger rides'}
                     </p>
                   </div>
                 </button>

                 <div className="flex items-center space-x-1 shrink-0">
                   <button
                     type="button"
                     onClick={() => handlePassengerModeToggle(!passengerMode)}
                     className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center transition ${
                       passengerMode
                         ? 'bg-amber-100 border-amber-300 text-amber-800 shadow-xs'
                         : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                     }`}
                     title="Toggle Passenger Mode (disables tracking while in friends' cars or buses)"
                   >
                     <UserX size={12} className="mr-1" />
                     Passenger
                   </button>
                   <button
                     type="button"
                     onClick={() => setIsBluetoothModalOpen(true)}
                     className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition"
                     title="Configure Car Bluetooth & Routines"
                   >
                     <SettingsIcon size={14} />
                   </button>
                 </div>
               </div>

               {trackingMode === 'gps' ? (
                 <button
                   onClick={handleStartTripClick}
                   className="w-full bg-white rounded-2xl shadow-sm border-2 border-dashed border-emerald-300 p-8 flex flex-col items-center justify-center hover:border-emerald-500 hover:bg-emerald-50/40 transition group"
                 >
                   <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                     <Navigation size={32} />
                   </div>
                   <span className="text-lg font-bold text-gray-800">Start GPS Trip</span>
                   <span className="text-sm text-gray-500 mt-1">Automatic live distance tracking</span>
                 </button>
               ) : (
                 <button
                   onClick={handleStartTripClick}
                   className="w-full bg-white rounded-2xl shadow-sm border-2 border-dashed border-indigo-200 p-8 flex flex-col items-center justify-center hover:border-indigo-400 hover:bg-indigo-50 transition group"
                 >
                   <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                     <Play size={32} className="ml-1" />
                   </div>
                   <span className="text-lg font-bold text-gray-800">Start New Trip</span>
                   <span className="text-sm text-gray-500 mt-1">Tap to scan odometer</span>
                 </button>
               )}
             </div>
          )}
        </section>

        {/* History List */}
        <TripHistory 
          trips={history} 
          activeTrip={activeTrip}
          onExport={handleExport}
          onEdit={handleEditTrip}
          onAddManual={handleAddManual}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          vehicles={vehicles}
          filterRego={filterRego}
          onFilterRegoChange={setFilterRego}
          distanceUnit={distanceUnit}
          onViewMap={handleOpenTripMap}
          onViewAllMap={handleOpenAllTripsMap}
          onOpenVerificationQueue={() => setIsVerificationModalOpen(true)}
        />

        {/* Footer info & guide access */}
        <footer className="pt-2 pb-6 text-center text-xs text-gray-400 space-y-2">
          <div className="flex items-center justify-center space-x-3">
            <button
              onClick={() => openSettings('guide')}
              className="hover:text-indigo-600 font-medium transition flex items-center"
            >
              <BookOpen size={12} className="mr-1" />
              User Guide
            </button>
            <span>•</span>
            <button
              onClick={() => openSettings('automation')}
              className="hover:text-indigo-600 font-medium transition flex items-center"
            >
              <Zap size={12} className="mr-1 text-amber-500" />
              GPS & BT Automation
            </button>
            <span>•</span>
            <button
              onClick={() => openSettings('about')}
              className="hover:text-indigo-600 font-medium transition flex items-center"
            >
              <Info size={12} className="mr-1" />
              v2.0.0
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            EasyLog • 100% on-device private logbook
          </p>
        </footer>

      </main>

      {/* Missed Trip Alert Modal */}
      <MissedTripAlert 
        isOpen={showMissedTripAlert}
        onClose={() => {
           setShowMissedTripAlert(false);
           setPendingStartTrip(null);
        }}
        onAddMissed={handleAddMissedTrip}
        onIgnore={handleIgnoreMissedTrip}
        data={missedTripData}
        distanceUnit={distanceUnit}
      />

      {/* Success / Chain Trip Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-5">
              <div className="flex items-center justify-center text-green-600 mb-2">
                 <div className="bg-green-100 p-3 rounded-full">
                    <CheckCircle2 size={32} />
                 </div>
              </div>
              <div className="text-center">
                 <h3 className="text-xl font-bold text-gray-800">Trip Saved!</h3>
                 <p className="text-gray-500 text-sm mt-1">Your trip has been logged successfully.</p>
              </div>
              
              <div className="space-y-3 pt-2">
                 <button 
                   onClick={handleChainTrip}
                   className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center justify-center"
                 >
                   <CornerDownRight size={18} className="mr-2" />
                   Start Next Trip
                 </button>
                 <button 
                   onClick={() => setShowSuccessModal(false)}
                   className="w-full py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition"
                 >
                   Done
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* GPS Start Modal */}
      {showGpsStart && (
        <GpsStartModal
          isOpen={showGpsStart}
          onClose={() => setShowGpsStart(false)}
          onStartGpsTrip={handleStartGpsTrip}
          vehicles={vehicles}
          onAddVehicle={updateVehiclesList}
          lastKnownOdoForVehicle={getLastKnownOdoForVehicle}
          distanceUnit={distanceUnit}
        />
      )}

      {/* GPS End Modal */}
      {showGpsEnd && activeTrip && (
        <GpsEndModal
          isOpen={showGpsEnd}
          trip={activeTrip}
          trackedDistance={trackedGpsDistance}
          durationSeconds={gpsDurationSeconds}
          endLocation={currentGpsLocation}
          distanceUnit={distanceUnit}
          allTrips={history}
          onSave={handleSaveGpsTrip}
          onCancel={() => setShowGpsEnd(false)}
        />
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <OdometerScanner 
          mode={scannerMode}
          onScanComplete={handleScanComplete}
          onCancel={handleCancelScan}
          initialData={scannerMode === 'end' ? activeTrip : null}
          vehicles={vehicles}
          onAddVehicle={updateVehiclesList}
          distanceUnit={distanceUnit}
          prefilledValue={prefilledStartValue}
        />
      )}

      {/* Manual Editor Modal */}
      <TripEditor
        isOpen={isEditorOpen}
        onClose={handleEditorClose}
        onSave={handleSaveTrip}
        onDelete={handleDeleteTrip}
        initialTrip={editingTrip}
        vehicles={vehicles}
        distanceUnit={distanceUnit}
        allTrips={history}
      />
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsTab}
        backups={backups}
        externalBackups={externalBackups}
        hasExternalStorage={hasExternalStorage}
        connectedFolderName={connectedFolder}
        onConnectFolder={connectDirectory}
        onRefreshExternal={() => listExternalBackups().then(setExternalBackups)}
        onRestoreSnapshot={handleRestoreSnapshot}
        onDownloadSnapshot={handleDownloadSnapshot}
        onRestoreFile={handleRestoreFile}
        onArchiveAndReset={handleArchiveAndReset}
        vehicles={vehicles}
        onAddVehicle={updateVehiclesList}
        onDeleteVehicle={handleDeleteVehicle}
        onEditVehicle={handleEditVehicle}
        distanceUnit={distanceUnit}
        onDistanceUnitChange={setDistanceUnit}
        onDisconnectFolder={handleDisconnectFolder}
        trackingMode={trackingMode}
        onTrackingModeChange={setTrackingMode}
        keepScreenAwake={keepScreenAwake}
        onKeepScreenAwakeChange={setKeepScreenAwake}
        highAccuracy={highAccuracy}
        onHighAccuracyChange={setHighAccuracy}
        bluetoothConfig={bluetoothConfig}
        onOpenBluetoothSetup={() => {
          setIsSettingsOpen(false);
          setIsBluetoothModalOpen(true);
        }}
        passengerMode={passengerMode}
        onPassengerModeToggle={handlePassengerModeToggle}
        isTripActive={!!activeTrip}
        onSimulateConnect={() => handleStartBluetoothTrip()}
        onSimulateDisconnect={() => handleEndBluetoothTrip()}
        onOpenCalibration={(v) => openCalibration(v)}
        showNotification={showNotification}
      />

      {/* Car Bluetooth Automation & Zero Passenger Tracking Modal */}
      {isBluetoothModalOpen && (
        <BluetoothSetupModal
          isOpen={isBluetoothModalOpen}
          onClose={() => setIsBluetoothModalOpen(false)}
          config={bluetoothConfig}
          onSaveConfig={(newConfig) => {
            setBluetoothConfig(newConfig);
            saveBluetoothConfig(newConfig);
          }}
          vehicles={vehicles}
          onAddVehicle={updateVehiclesList}
          isTripActive={!!activeTrip}
          onSimulateConnect={(v, d, mac) => handleStartBluetoothTrip(v, d, mac)}
          onSimulateDisconnect={() => handleEndBluetoothTrip()}
          showNotification={showNotification}
        />
      )}

      {/* Interactive Trip Map & Route Viewer */}
      {isMapModalOpen && (
        <TripMapModal
          isOpen={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          trip={selectedMapTrip || activeTrip || (history.length > 0 ? history[0] : null)}
          allTrips={history}
          distanceUnit={distanceUnit}
          onUpdateTrip={handleUpdateTripFromMap}
          showNotification={showNotification}
        />
      )}

      {/* Trip Verification Review Queue Modal */}
      {isVerificationModalOpen && (
        <TripVerificationModal
          isOpen={isVerificationModalOpen}
          onClose={() => setIsVerificationModalOpen(false)}
          unverifiedTrips={unverifiedTrips}
          vehicles={vehicles}
          distanceUnit={distanceUnit}
          onCommitTrip={handleCommitTrip}
          onCommitAll={handleCommitAllTrips}
          onUpdateTrip={handleSaveTrip}
          onDeleteTrip={handleDeleteTrip}
          onViewMap={handleOpenTripMap}
          onOpenFullEditor={(trip) => {
            setIsVerificationModalOpen(false);
            handleEditTrip(trip);
          }}
          showNotification={showNotification}
        />
      )}

      {/* ATO Monthly Odometer Calibration Modal */}
      {isCalibrationOpen && (
        <OdometerCalibrationModal
          isOpen={isCalibrationOpen}
          onClose={() => setIsCalibrationOpen(false)}
          vehicles={vehicles}
          selectedVehicle={calibrationTargetVehicle}
          history={history}
          onSaveCalibrationTrip={(calibTrip) => {
            handleSaveTrip(calibTrip);
            setIsCalibrationBannerDismissed(false);
          }}
          lastKnownOdoForVehicle={getLastKnownOdoForVehicle}
          distanceUnit={distanceUnit}
          showNotification={showNotification}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}