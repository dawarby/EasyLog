import { BluetoothConfig, VehicleBluetoothMapping } from '../types';

export const STORAGE_KEY_BT_CONFIG = 'easylog_bt_config';
export const STORAGE_KEY_PASSENGER_MODE = 'easylog_passenger_mode';
const LEGACY_STORAGE_KEY_BT_CONFIG = 'snaplog_bt_config';
const LEGACY_STORAGE_KEY_PASSENGER_MODE = 'snaplog_passenger_mode';

export const DEFAULT_BT_CONFIG: BluetoothConfig = {
  enabled: false,
  deviceName: '',
  deviceMacAddress: '',
  vehicleReg: '',
  defaultTripType: 'work',
  autoEndTrip: false,
  vehicleMappings: []
};

/**
 * Normalizes a MAC address string (e.g. "00-1a-7d-da-71-13" or "001A7DDA7113" -> "00:1A:7D:DA:71:13")
 */
export function normalizeMacAddress(mac?: string): string {
  if (!mac) return '';
  const clean = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g)?.join(':') || mac.toUpperCase();
  }
  return mac.trim().toUpperCase();
}

/**
 * Validates whether a string matches a 6-byte Bluetooth MAC address pattern
 */
export function isValidMacAddress(mac?: string): boolean {
  if (!mac) return false;
  const regex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return regex.test(mac.trim());
}

/**
 * Automatically formats MAC address input as user types
 */
export function formatMacAddressInput(input: string): string {
  const clean = input.replace(/[^0-9A-Fa-f]/g, '').slice(0, 12).toUpperCase();
  const chunks = clean.match(/.{1,2}/g);
  return chunks ? chunks.join(':') : clean;
}

/**
 * Generates a valid standard 6-byte Bluetooth MAC address or hardware ID.
 * Optionally uses a seed string (e.g. device name or vehicle reg) for deterministic MAC generation.
 */
export function generateDeviceHardwareMac(seed?: string, prefix = '00:1A:7D'): string {
  const cleanPrefix = prefix.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
  const hexChars = '0123456789ABCDEF';
  
  if (seed && seed.trim()) {
    // Deterministic hash based on seed string
    let hash = 0;
    const str = seed.trim().toLowerCase();
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    let hex = cleanPrefix;
    const seedBytes = 6 - (cleanPrefix.length / 2);
    for (let i = 0; i < seedBytes * 2; i++) {
      const idx = Math.abs((hash ^ (i * 31 + 17))) % 16;
      hex += hexChars.charAt(idx);
    }
    const chunks = hex.match(/.{1,2}/g);
    return chunks ? chunks.join(':') : hex;
  }

  // Random hardware MAC with automotive standard OUI prefix
  let hex = cleanPrefix;
  const remainingBytes = 6 - (cleanPrefix.length / 2);
  for (let i = 0; i < remainingBytes * 2; i++) {
    hex += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  const chunks = hex.match(/.{1,2}/g);
  return chunks ? chunks.join(':') : hex;
}

/**
 * Common Bluetooth Device Presets & Catalog to assist quick selection
 */
export interface BluetoothDevicePreset {
  id: string;
  name: string;
  macAddress: string;
  category: 'Factory Car Audio' | 'Infotainment & Hands-Free' | 'OBD-II & Diagnostics' | 'Aftermarket Head Unit';
  brand: string;
}

export const COMMON_CAR_BLUETOOTH_PRESETS: BluetoothDevicePreset[] = [
  { id: 'toyota-touch', name: 'Toyota Touch 2', macAddress: '00:1A:7D:DA:71:13', category: 'Factory Car Audio', brand: 'Toyota' },
  { id: 'toyota-bt', name: 'Toyota BT', macAddress: '28:56:5A:11:42:F1', category: 'Factory Car Audio', brand: 'Toyota' },
  { id: 'lexus-multi', name: 'Lexus Multimedia', macAddress: '3C:CD:36:99:A1:02', category: 'Factory Car Audio', brand: 'Lexus' },
  { id: 'mazda-connect', name: 'Mazda Connect', macAddress: '40:4E:36:8A:BC:34', category: 'Factory Car Audio', brand: 'Mazda' },
  { id: 'mazda-bt', name: 'Mazda BT', macAddress: '54:B1:21:6E:9A:12', category: 'Factory Car Audio', brand: 'Mazda' },
  { id: 'tesla-m3', name: 'Tesla Model 3', macAddress: '98:ED:5C:32:1B:77', category: 'Infotainment & Hands-Free', brand: 'Tesla' },
  { id: 'tesla-my', name: 'Tesla Model Y', macAddress: '98:ED:5C:77:4F:88', category: 'Infotainment & Hands-Free', brand: 'Tesla' },
  { id: 'ford-sync', name: 'Ford SYNC', macAddress: '04:D3:B0:55:18:9A', category: 'Factory Car Audio', brand: 'Ford' },
  { id: 'ford-audio', name: 'Ford Audio', macAddress: '04:D3:B0:12:34:56', category: 'Factory Car Audio', brand: 'Ford' },
  { id: 'carplay', name: 'CarPlay', macAddress: 'A4:C3:61:98:33:DE', category: 'Infotainment & Hands-Free', brand: 'Apple CarPlay' },
  { id: 'android-auto', name: 'Android Auto', macAddress: '70:BC:10:44:EE:29', category: 'Infotainment & Hands-Free', brand: 'Google' },
  { id: 'hyundai-audio', name: 'Hyundai Audio', macAddress: '10:D0:7A:B2:77:41', category: 'Factory Car Audio', brand: 'Hyundai' },
  { id: 'kia-uvo', name: 'Kia Motors', macAddress: '68:C4:4D:11:A2:33', category: 'Factory Car Audio', brand: 'Kia' },
  { id: 'vw-bt', name: 'VW Phone', macAddress: '00:1E:8C:F9:67:23', category: 'Factory Car Audio', brand: 'Volkswagen' },
  { id: 'audi-mmi', name: 'Audi MMI', macAddress: '78:44:05:8B:2A:41', category: 'Factory Car Audio', brand: 'Audi' },
  { id: 'bmw-bt', name: 'BMW Bluetooth', macAddress: '00:01:A9:6F:42:10', category: 'Factory Car Audio', brand: 'BMW' },
  { id: 'mb-mbux', name: 'MB Bluetooth / MBUX', macAddress: '14:98:77:AA:BB:CC', category: 'Factory Car Audio', brand: 'Mercedes-Benz' },
  { id: 'subaru-bt', name: 'Subaru BT', macAddress: '6C:29:95:43:21:00', category: 'Factory Car Audio', brand: 'Subaru' },
  { id: 'starlink', name: 'SUBARU STARLINK', macAddress: '6C:29:95:99:88:77', category: 'Factory Car Audio', brand: 'Subaru' },
  { id: 'nissan-connect', name: 'NissanConnect', macAddress: '24:62:AB:33:55:77', category: 'Factory Car Audio', brand: 'Nissan' },
  { id: 'honda-hft', name: 'HandsFreeLink', macAddress: '08:70:45:99:12:34', category: 'Factory Car Audio', brand: 'Honda' },
  { id: 'mitsubishi-bt', name: 'Mitsubishi Motors', macAddress: '00:26:E8:11:22:33', category: 'Factory Car Audio', brand: 'Mitsubishi' },
  { id: 'holden-mylink', name: 'Holden MyLink', macAddress: '5C:AA:FD:88:99:00', category: 'Factory Car Audio', brand: 'Holden' },
  { id: 'pioneer-bt', name: 'Pioneer BT Unit', macAddress: '00:02:B3:66:77:88', category: 'Aftermarket Head Unit', brand: 'Pioneer' },
  { id: 'sony-car', name: 'Sony Car Audio', macAddress: 'F0:BF:97:12:45:78', category: 'Aftermarket Head Unit', brand: 'Sony' },
  { id: 'kenwood-bt', name: 'Kenwood BT', macAddress: '00:1B:DC:44:55:66', category: 'Aftermarket Head Unit', brand: 'Kenwood' },
  { id: 'alpine-bt', name: 'Alpine Car Audio', macAddress: '00:05:4F:9A:8B:7C', category: 'Aftermarket Head Unit', brand: 'Alpine' },
  { id: 'obdlink-ble', name: 'OBDLink CX / MX+ BLE', macAddress: '00:04:3E:AA:BB:01', category: 'OBD-II & Diagnostics', brand: 'OBDLink' },
  { id: 'veepeak-ble', name: 'Veepeak OBDCheck BLE', macAddress: '24:0A:C4:00:11:22', category: 'OBD-II & Diagnostics', brand: 'Veepeak' },
  { id: 'carista-ble', name: 'Carista BLE Adapter', macAddress: '08:EB:ED:FF:EE:DD', category: 'OBD-II & Diagnostics', brand: 'Carista' }
];

export function getStoredBluetoothConfig(): BluetoothConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BT_CONFIG) || localStorage.getItem(LEGACY_STORAGE_KEY_BT_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      const config: BluetoothConfig = { ...DEFAULT_BT_CONFIG, ...parsed };

      // Ensure vehicleMappings array is populated
      if (!config.vehicleMappings || !Array.isArray(config.vehicleMappings)) {
        config.vehicleMappings = [];
        if (config.vehicleReg && config.deviceName) {
          config.vehicleMappings.push({
            vehicleReg: config.vehicleReg,
            deviceName: config.deviceName,
            deviceMacAddress: config.deviceMacAddress || '',
            defaultTripType: config.defaultTripType || 'work',
            autoEndTrip: config.autoEndTrip ?? true
          });
        }
      }

      return config;
    }
  } catch (e) {
    console.error('Failed to parse bluetooth config', e);
  }
  return DEFAULT_BT_CONFIG;
}

export function saveBluetoothConfig(config: BluetoothConfig): void {
  try {
    let updatedConfig = { ...config };
    if (updatedConfig.vehicleMappings && updatedConfig.vehicleMappings.length > 0) {
      const activeMapping =
        updatedConfig.vehicleMappings.find((m) => m.vehicleReg === updatedConfig.vehicleReg) ||
        updatedConfig.vehicleMappings[0];

      if (activeMapping) {
        updatedConfig.vehicleReg = activeMapping.vehicleReg;
        updatedConfig.deviceName = activeMapping.deviceName;
        updatedConfig.deviceMacAddress = activeMapping.deviceMacAddress || '';
        if (activeMapping.defaultTripType) {
          updatedConfig.defaultTripType = activeMapping.defaultTripType;
        }
      }
    }

    localStorage.setItem(STORAGE_KEY_BT_CONFIG, JSON.stringify(updatedConfig));
  } catch (e) {
    console.error('Failed to save bluetooth config', e);
  }
}

/**
 * Finds which vehicle is allocated to a specific connected Bluetooth device.
 * Matches on MAC Address (unchanging unique hardware identifier) FIRST, then falls back to friendly name.
 */
export function getVehicleForBluetoothDevice(
  deviceName: string | undefined,
  config: BluetoothConfig,
  deviceMac?: string
): { vehicleReg: string; tripType: 'work' | 'personal'; autoEndTrip: boolean; matchedMapping?: VehicleBluetoothMapping } {
  const cleanMac = normalizeMacAddress(deviceMac);
  const cleanInput = deviceName?.trim().toLowerCase() || '';

  // 1. Check vehicleMappings
  if (config.vehicleMappings && config.vehicleMappings.length > 0) {
    // 1A. High-priority: Match by unchanging MAC address if available
    if (cleanMac) {
      const macMatch = config.vehicleMappings.find(
        (m) => m.deviceMacAddress && normalizeMacAddress(m.deviceMacAddress) === cleanMac
      );
      if (macMatch) {
        return {
          vehicleReg: macMatch.vehicleReg,
          tripType: macMatch.defaultTripType || config.defaultTripType || 'work',
          autoEndTrip: macMatch.autoEndTrip ?? config.autoEndTrip ?? true,
          matchedMapping: macMatch
        };
      }
    }

    // 1B. Check if the deviceName parameter is itself formatted as a MAC address
    if (isValidMacAddress(deviceName)) {
      const inputAsMac = normalizeMacAddress(deviceName);
      const directMacMatch = config.vehicleMappings.find(
        (m) => m.deviceMacAddress && normalizeMacAddress(m.deviceMacAddress) === inputAsMac
      );
      if (directMacMatch) {
        return {
          vehicleReg: directMacMatch.vehicleReg,
          tripType: directMacMatch.defaultTripType || config.defaultTripType || 'work',
          autoEndTrip: directMacMatch.autoEndTrip ?? config.autoEndTrip ?? true,
          matchedMapping: directMacMatch
        };
      }
    }

    // 1C. Match by friendly device name (exact match)
    if (cleanInput) {
      const exactNameMatch = config.vehicleMappings.find(
        (m) => m.deviceName.trim().toLowerCase() === cleanInput
      );
      if (exactNameMatch) {
        return {
          vehicleReg: exactNameMatch.vehicleReg,
          tripType: exactNameMatch.defaultTripType || config.defaultTripType || 'work',
          autoEndTrip: exactNameMatch.autoEndTrip ?? config.autoEndTrip ?? true,
          matchedMapping: exactNameMatch
        };
      }

      // 1D. Match by friendly device name (partial/substring match)
      const partialMatch = config.vehicleMappings.find((m) => {
        const target = m.deviceName.trim().toLowerCase();
        return target.length > 2 && (cleanInput.includes(target) || target.includes(cleanInput));
      });
      if (partialMatch) {
        return {
          vehicleReg: partialMatch.vehicleReg,
          tripType: partialMatch.defaultTripType || config.defaultTripType || 'work',
          autoEndTrip: partialMatch.autoEndTrip ?? config.autoEndTrip ?? true,
          matchedMapping: partialMatch
        };
      }
    }
  }

  // 2. Fall back to primary vehicle and device
  return {
    vehicleReg: config.vehicleReg || '',
    tripType: config.defaultTripType || 'work',
    autoEndTrip: config.autoEndTrip ?? true
  };
}

/**
 * Checks if the Web Bluetooth API is supported in this browser.
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Invokes the browser's Web Bluetooth device scan dialog to discover nearby Bluetooth devices.
 * Extracts both friendly device name and unchanging device ID.
 */
export async function requestWebBluetoothDevice(): Promise<{
  success: boolean;
  device?: { name: string; id: string; macAddress?: string };
  error?: string;
}> {
  if (!isWebBluetoothSupported()) {
    return {
      success: false,
      error: 'Web Bluetooth is not supported in this browser. (Use Chrome, Edge, Opera, or Android Chrome).'
    };
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['generic_access', 'battery_service', 'device_information']
    });

    if (!device) {
      return { success: false, error: 'No device chosen.' };
    }

    // Web Bluetooth device.id is an unchanging unique string per origin/device
    const deviceId = device.id || '';
    // Format id as pseudo-MAC if it is a hash or hex, or keep as unchanging ID
    const pseudoMac = deviceId.length >= 12
      ? normalizeMacAddress(deviceId.slice(0, 12))
      : deviceId;

    return {
      success: true,
      device: {
        name: device.name || 'Bluetooth Device',
        id: deviceId,
        macAddress: pseudoMac
      }
    };
  } catch (err: any) {
    if (err?.name === 'NotFoundError') {
      return { success: false, error: 'Pairing cancelled.' };
    }
    return { success: false, error: err?.message || 'Bluetooth scan failed.' };
  }
}

// Active Web Bluetooth device reference for BLE car dongles
let activeBleDevice: any = null;

export async function connectBleBeacon(
  onDisconnect: () => void
): Promise<{ success: boolean; deviceName?: string; deviceId?: string; error?: string }> {
  if (!isWebBluetoothSupported()) {
    return { success: false, error: 'Web Bluetooth is not supported in this browser.' };
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['generic_access', 'battery_service', 'device_information']
    });

    if (!device) {
      return { success: false, error: 'No device selected' };
    }

    activeBleDevice = device;

    // Listen for disconnect
    const handleGattDisconnect = () => {
      console.log('BLE Car device disconnected:', device.name);
      activeBleDevice = null;
      onDisconnect();
    };
    device.addEventListener('gattserverdisconnected', handleGattDisconnect);

    // Connect to GATT server if possible
    if (device.gatt) {
      try {
        await device.gatt.connect();
      } catch (connectErr) {
        // Undo the selection so a failed pairing cannot leave a listener that ends a trip later
        device.removeEventListener('gattserverdisconnected', handleGattDisconnect);
        activeBleDevice = null;
        throw connectErr;
      }
    }

    return {
      success: true,
      deviceName: device.name || 'Bluetooth Device',
      deviceId: device.id || ''
    };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'Pairing cancelled' };
    }
    return { success: false, error: err.message || 'Failed to connect to Bluetooth device' };
  }
}

export function disconnectBleBeacon(): void {
  if (activeBleDevice) {
    try {
      if (activeBleDevice.gatt && activeBleDevice.gatt.connected) {
        activeBleDevice.gatt.disconnect();
      }
    } catch (e) {
      console.warn('Error disconnecting BLE device', e);
    }
    activeBleDevice = null;
  }
}

export function getActiveBleDeviceName(): string | null {
  return activeBleDevice ? activeBleDevice.name || 'Connected BLE Device' : null;
}

/**
 * Checks if running inside the Native Android Play Store wrapper (WebView / Capacitor)
 */
export function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window as any).isAndroidNativeApp === true ||
    (window as any).AndroidBridge !== undefined ||
    (window as any).Capacitor !== undefined
  );
}

/**
 * Synchronizes car Bluetooth preferences directly with the native Android SharedPreferences
 */
export function syncWithNativeAndroidBridge(config: BluetoothConfig, passengerMode: boolean = false): boolean {
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.syncPreferences) {
    try {
      (window as any).AndroidBridge.syncPreferences(
        config.deviceName || '',
        config.vehicleReg || '',
        passengerMode
      );
      return true;
    } catch (e) {
      console.warn('Failed to sync preferences with AndroidBridge', e);
    }
  }
  return false;
}

/**
 * Simulates an Android OS Bluetooth event in the browser for testing native app behavior
 */
export function simulateNativeBluetoothEvent(
  type: 'connected' | 'disconnected',
  deviceName?: string,
  vehicle?: string,
  macAddress?: string
) {
  if (typeof window === 'undefined') return;
  if (type === 'connected') {
    window.dispatchEvent(
      new CustomEvent('android_bluetooth_connected', {
        detail: {
          device: deviceName || 'Toyota Hands-Free',
          vehicle: vehicle || 'MY-CAR',
          macAddress: macAddress || '00:1A:7D:DA:71:13'
        }
      })
    );
  } else {
    window.dispatchEvent(new CustomEvent('android_bluetooth_disconnected'));
  }
}

/**
 * Generates the automation URL for iOS Shortcuts or Android Routines.
 */
export function generateAutomationUrls(baseUrl?: string, vehicle?: string, deviceName?: string, macAddress?: string) {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://easylog.app/');
  const cleanOrigin = origin.split('?')[0];

  const vehicleParam = vehicle ? `&vehicle=${encodeURIComponent(vehicle)}` : '';
  const deviceParam = deviceName ? `&device=${encodeURIComponent(deviceName)}` : '';
  const macParam = macAddress ? `&mac=${encodeURIComponent(macAddress)}` : '';

  return {
    startUrl: `${cleanOrigin}?action=start_trip&source=bluetooth${vehicleParam}${deviceParam}${macParam}`,
    endUrl: `${cleanOrigin}?action=end_trip&source=bluetooth`
  };
}
