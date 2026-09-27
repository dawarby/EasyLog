import { BluetoothConfig } from '../types';

export const STORAGE_KEY_BT_CONFIG = 'easylog_bt_config';
export const STORAGE_KEY_PASSENGER_MODE = 'easylog_passenger_mode';
const LEGACY_STORAGE_KEY_BT_CONFIG = 'snaplog_bt_config';
const LEGACY_STORAGE_KEY_PASSENGER_MODE = 'snaplog_passenger_mode';

export const DEFAULT_BT_CONFIG: BluetoothConfig = {
  enabled: false,
  deviceName: '',
  vehicleReg: '',
  defaultTripType: 'work',
  autoEndTrip: false
};

export function getStoredBluetoothConfig(): BluetoothConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BT_CONFIG) || localStorage.getItem(LEGACY_STORAGE_KEY_BT_CONFIG);
    if (raw) {
      return { ...DEFAULT_BT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to parse bluetooth config', e);
  }
  return DEFAULT_BT_CONFIG;
}

export function saveBluetoothConfig(config: BluetoothConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_BT_CONFIG, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save bluetooth config', e);
  }
}

/**
 * Checks if the Web Bluetooth API is supported in this browser.
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

// Active Web Bluetooth device reference for BLE car dongles
let activeBleDevice: any = null;

export async function connectBleBeacon(
  onDisconnect: () => void
): Promise<{ success: boolean; deviceName?: string; error?: string }> {
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
    device.addEventListener('gattserverdisconnected', () => {
      console.log('BLE Car device disconnected:', device.name);
      activeBleDevice = null;
      onDisconnect();
    });

    // Connect to GATT server if possible
    if (device.gatt) {
      await device.gatt.connect();
    }

    return { success: true, deviceName: device.name || 'Bluetooth Device' };
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
export function simulateNativeBluetoothEvent(type: 'connected' | 'disconnected', deviceName?: string, vehicle?: string) {
  if (typeof window === 'undefined') return;
  if (type === 'connected') {
    window.dispatchEvent(
      new CustomEvent('android_bluetooth_connected', {
        detail: {
          device: deviceName || 'Toyota Hands-Free',
          vehicle: vehicle || 'MY-CAR'
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
export function generateAutomationUrls(baseUrl?: string, vehicle?: string) {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://easylog.app/');
  const cleanOrigin = origin.split('?')[0];

  const vehicleParam = vehicle ? `&vehicle=${encodeURIComponent(vehicle)}` : '';

  return {
    startUrl: `${cleanOrigin}?action=start_trip&source=bluetooth${vehicleParam}`,
    endUrl: `${cleanOrigin}?action=end_trip&source=bluetooth`
  };
}
