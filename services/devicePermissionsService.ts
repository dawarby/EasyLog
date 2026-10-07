/**
 * Device Permissions Service
 * Manages checking, requesting, and diagnosing device permissions (Camera, Location,
 * Notifications, Wake Lock) especially when installed as a freestanding / standalone PWA or Android Native App.
 */

export type PermissionStateValue = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface DevicePermissionsState {
  camera: PermissionStateValue;
  location: PermissionStateValue;
  notifications: PermissionStateValue;
  wakeLock: boolean;
  isStandalone: boolean;
  isIos: boolean;
  isAndroid: boolean;
}

/**
 * Detects whether the web app is running as an installed freestanding app (PWA or Native)
 */
export const isStandaloneApp = (): boolean => {
  if (typeof window === 'undefined') return false;

  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone = (window.navigator as any).standalone === true;
  const isAndroidReferrer = document.referrer.includes('android-app://');
  const isAndroidNative = (window as any).isAndroidNativeApp === true;

  return isStandaloneMedia || isIosStandalone || isAndroidReferrer || isAndroidNative;
};

/**
 * Detects platform
 */
export const getPlatformInfo = () => {
  if (typeof window === 'undefined') {
    return { isIos: false, isAndroid: false };
  }
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  return { isIos, isAndroid };
};

/**
 * Queries current camera permission state
 */
export const queryCameraPermission = async (): Promise<PermissionStateValue> => {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      // Some browsers support querying 'camera'
      const status = await navigator.permissions.query({ name: 'camera' as any });
      return status.state as PermissionStateValue;
    }
  } catch {
    // navigator.permissions.query for camera is not supported on all browsers (like older Safari)
  }

  return 'prompt';
};

/**
 * Requests camera permission directly by opening and immediately closing a video stream.
 * This triggers the browser / OS native permission prompt.
 */
export const requestCameraPermission = async (): Promise<{
  granted: boolean;
  error?: string;
  errorType?: 'NotAllowedError' | 'NotFoundError' | 'NotReadableError' | 'SecurityError' | 'Unknown';
}> => {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      error: 'Camera is not supported on this device or browser.',
      errorType: 'NotFoundError'
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }
      }
    });

    // Successfully granted! Clean up tracks immediately
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true };
  } catch (err: any) {
    const errorName = err?.name || 'Unknown';
    let errorMessage = err?.message || 'Camera permission was not granted.';

    if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
      errorMessage = 'Camera access was blocked or denied. Please enable camera permission in your phone or browser settings.';
    } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      errorMessage = 'No camera hardware found on this device.';
    } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      errorMessage = 'Camera is currently in use by another application.';
    }

    return {
      granted: false,
      error: errorMessage,
      errorType: errorName as any
    };
  }
};

/**
 * Queries current location permission state
 */
export const queryLocationPermission = async (): Promise<PermissionStateValue> => {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return 'unsupported';
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state as PermissionStateValue;
    }
  } catch {
    // fallback
  }

  return 'prompt';
};

/**
 * Requests location permission directly via getCurrentPosition
 */
export const requestLocationPermission = async (): Promise<{ granted: boolean; error?: string }> => {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return { granted: false, error: 'Geolocation is not supported on this device.' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ granted: true }),
      (err) => {
        let msg = 'Location permission denied.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Please allow location access for GPS tracking.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location position unavailable. Ensure GPS is turned on.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out.';
        }
        resolve({ granted: false, error: msg });
      },
      { timeout: 8000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  });
};

/**
 * Queries current notification permission
 */
export const queryNotificationPermission = (): PermissionStateValue => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PermissionStateValue;
};

/**
 * Queries all permissions at once
 */
export const queryAllPermissions = async (): Promise<DevicePermissionsState> => {
  const { isIos, isAndroid } = getPlatformInfo();
  const isStandalone = isStandaloneApp();

  const [camera, location] = await Promise.all([
    queryCameraPermission(),
    queryLocationPermission()
  ]);

  const notifications = queryNotificationPermission();
  const wakeLock = typeof window !== 'undefined' && 'wakeLock' in navigator;

  return {
    camera,
    location,
    notifications,
    wakeLock,
    isStandalone,
    isIos,
    isAndroid
  };
};

/**
 * Helpful platform-specific troubleshooting text for freestanding / standalone apps
 */
export const getPermissionHelpGuide = (permission: 'camera' | 'location' | 'notifications') => {
  const { isIos, isAndroid } = getPlatformInfo();
  const isStandalone = isStandaloneApp();

  if (permission === 'camera') {
    if (isIos) {
      return {
        title: 'How to Enable Camera on iPhone / iPad',
        steps: [
          'Open your iPhone "Settings" app.',
          isStandalone
            ? 'Scroll down to "Safari" (or your default browser) > "Camera" and choose "Allow".'
            : 'Scroll down to "Safari" > "Camera" and select "Ask" or "Allow".',
          'Alternatively, go to "Privacy & Security" > "Camera" and ensure browser access is turned ON.',
          'Return to EasyLog and tap "Try Camera Again".'
        ]
      };
    } else if (isAndroid) {
      return {
        title: 'How to Enable Camera on Android',
        steps: [
          'Open Android "Settings" > "Apps" > "EasyLog" (or "Chrome").',
          'Tap "Permissions" > "Camera".',
          'Select "Allow only while using the app".',
          'Return to EasyLog and tap "Try Camera Again".'
        ]
      };
    }
    return {
      title: 'How to Enable Camera in your Browser',
      steps: [
        'Click the tune/padlock icon in your browser address bar.',
        'Toggle Camera to "Allow".',
        'Reload the app and try again.'
      ]
    };
  }

  if (permission === 'location') {
    if (isIos) {
      return {
        title: 'How to Enable GPS / Location on iPhone',
        steps: [
          'Open iPhone "Settings" > "Privacy & Security" > "Location Services".',
          'Ensure "Location Services" is toggled ON.',
          'Find "Safari Websites" (or EasyLog) and select "While Using the App" with "Precise Location" ON.',
          'Return to EasyLog to resume GPS tracking.'
        ]
      };
    }
    return {
      title: 'How to Enable GPS / Location on Android',
      steps: [
        'Open Android "Settings" > "Location" and ensure it is turned ON.',
        'Under "App permissions", find "EasyLog" (or Chrome) and select "Allow only while using the app" with "Use precise location" ON.',
        'Return to EasyLog to resume GPS tracking.'
      ]
    };
  }

  return {
    title: 'How to Enable Notifications',
    steps: [
      'In phone Settings, find the browser or EasyLog app.',
      'Tap "Notifications" and switch "Allow Notifications" ON.',
      'For iPhone PWA (iOS 16.4+), ensure EasyLog is added to the Home Screen.'
    ]
  };
};
