import { Trip } from '../types';

const STORAGE_KEY_PUSH_ENABLED = 'easylog_push_enabled';
const STORAGE_KEY_PUSH_PREFERENCES = 'easylog_push_preferences';

export interface NotificationPreferences {
  enabled: boolean;
  notifyTripStarted: boolean;
  notifyTripEnded: boolean;
  notifyAwaitingVerification: boolean;
  notifyCalibrationDue: boolean;
}

export interface NotificationStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  enabled: boolean;
  preferences: NotificationPreferences;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  notifyTripStarted: true,
  notifyTripEnded: true,
  notifyAwaitingVerification: true,
  notifyCalibrationDue: true,
};

/**
 * Checks if Web Notifications API is supported in current environment
 */
export const isNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/**
 * Gets stored notification preferences
 */
export const getNotificationPreferences = (): NotificationPreferences => {
  if (typeof window === 'undefined') {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY_PUSH_PREFERENCES);
    const legacyEnabled = localStorage.getItem(STORAGE_KEY_PUSH_ENABLED);

    let prefs = stored ? JSON.parse(stored) : { ...DEFAULT_NOTIFICATION_PREFERENCES };

    if (legacyEnabled !== null && !stored) {
      prefs.enabled = legacyEnabled !== 'false';
    }

    return {
      enabled: prefs.enabled ?? true,
      notifyTripStarted: prefs.notifyTripStarted ?? true,
      notifyTripEnded: prefs.notifyTripEnded ?? true,
      notifyAwaitingVerification: prefs.notifyAwaitingVerification ?? true,
      notifyCalibrationDue: prefs.notifyCalibrationDue ?? true,
    };
  } catch (e) {
    console.warn('Failed to parse stored notification preferences', e);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
};

/**
 * Saves updated notification preferences to localStorage
 */
export const saveNotificationPreferences = (
  updates: Partial<NotificationPreferences>
): NotificationPreferences => {
  const current = getNotificationPreferences();
  const next: NotificationPreferences = {
    ...current,
    ...updates,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_PUSH_PREFERENCES, JSON.stringify(next));
      localStorage.setItem(STORAGE_KEY_PUSH_ENABLED, next.enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to persist notification preferences', e);
    }
  }

  return next;
};

/**
 * Gets current notification status
 */
export const getNotificationStatus = (): NotificationStatus => {
  const prefs = getNotificationPreferences();

  if (!isNotificationSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      enabled: false,
      preferences: prefs,
    };
  }

  const permission = Notification.permission;
  const enabled = permission === 'granted' && prefs.enabled;

  return {
    supported: true,
    permission,
    enabled,
    preferences: prefs,
  };
};

/**
 * Requests push notification permission from the user
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isNotificationSupported()) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      saveNotificationPreferences({ enabled: true });
      return true;
    } else {
      saveNotificationPreferences({ enabled: false });
      return false;
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

/**
 * Enables or disables notification preference
 */
export const setPushNotificationsEnabled = (enabled: boolean): void => {
  saveNotificationPreferences({ enabled });
};

/**
 * Dispatches a custom event to open the verification queue when a notification is clicked
 */
const triggerOpenVerificationQueue = (tripId?: string) => {
  if (typeof window !== 'undefined') {
    window.focus();
    window.dispatchEvent(
      new CustomEvent('open-verification-queue', {
        detail: { tripId }
      })
    );
  }
};

/**
 * Sends a generic notification with Service Worker fallback
 */
async function showSystemNotification(
  title: string,
  options: NotificationOptions & { renotify?: boolean; data?: any },
  onClick?: () => void
): Promise<boolean> {
  const status = getNotificationStatus();
  if (!status.supported || !status.enabled || status.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, options);
          return true;
        }
      } catch (swErr) {
        console.warn('Service worker showNotification failed, using fallback:', swErr);
      }
    }

    const notification = new Notification(title, options);
    notification.onclick = (event) => {
      event.preventDefault();
      if (onClick) {
        onClick();
      } else {
        triggerOpenVerificationQueue(options.data?.tripId);
      }
      notification.close();
    };

    return true;
  } catch (error) {
    console.error('Error displaying notification:', error);
    return false;
  }
}

/**
 * Sends a push notification alerting the user that a new trip has been added to the verification list
 */
export const sendTripVerificationNotification = async (
  trip: Trip,
  distanceUnit: 'km' | 'mi' = 'km',
  pendingCount?: number
): Promise<boolean> => {
  const prefs = getNotificationPreferences();
  if (!prefs.notifyAwaitingVerification) {
    return false;
  }

  const dist = trip.distance ? `${trip.distance} ${distanceUnit}` : `Trip`;
  const vehicle = trip.registrationNumber ? ` (${trip.registrationNumber})` : '';
  const countNotice = pendingCount && pendingCount > 1 ? ` • ${pendingCount} trips awaiting review` : '';

  const title = `🚗 Trip Logged: Needs Verification`;
  const body = `${dist}${vehicle} completed. Tap to review Work vs Personal and add reason.${countNotice}`;

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/apple-touch-icon.png',
    tag: 'easylog-trip-verification',
    renotify: true,
    silent: false,
    data: {
      url: '/',
      action: 'open_verification',
      tripId: trip.id
    }
  };

  return showSystemNotification(title, options, () => triggerOpenVerificationQueue(trip.id));
};

/**
 * Sends a notification when a trip begins
 */
export const sendTripStartedNotification = async (
  vehicle?: string,
  trackingMode: 'gps' | 'camera' = 'gps'
): Promise<boolean> => {
  const prefs = getNotificationPreferences();
  if (!prefs.notifyTripStarted) {
    return false;
  }

  const vehicleLabel = vehicle ? ` for ${vehicle}` : '';
  const modeLabel = trackingMode === 'gps' ? 'GPS Drive Tracking active' : 'Odometer Log started';
  const title = `🚗 Trip Started${vehicleLabel}`;
  const body = `${modeLabel}. Keeping accurate records for your tax logbook.`;

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/apple-touch-icon.png',
    tag: 'easylog-trip-started',
    renotify: true,
    silent: false,
    data: { url: '/', action: 'active_trip' }
  };

  return showSystemNotification(title, options);
};

/**
 * Sends a notification when a trip ends
 */
export const sendTripEndedNotification = async (
  distance: number,
  distanceUnit: 'km' | 'mi' = 'km',
  vehicle?: string
): Promise<boolean> => {
  const prefs = getNotificationPreferences();
  if (!prefs.notifyTripEnded) {
    return false;
  }

  const vehicleLabel = vehicle ? ` (${vehicle})` : '';
  const title = `🛑 Trip Completed: ${distance} ${distanceUnit}`;
  const body = `Vehicle${vehicleLabel} drive finished. Recorded into your logbook.`;

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/apple-touch-icon.png',
    tag: 'easylog-trip-ended',
    renotify: true,
    silent: false,
    data: { url: '/', action: 'review_trip' }
  };

  return showSystemNotification(title, options);
};

/**
 * Dispatches a custom event to open the calibration modal when a notification is clicked
 */
export const triggerOpenCalibrationDialog = (vehicleReg?: string) => {
  if (typeof window !== 'undefined') {
    window.focus();
    window.dispatchEvent(
      new CustomEvent('open-calibration-dialog', {
        detail: { vehicleReg }
      })
    );
  }
};

/**
 * Sends an ATO monthly odometer calibration reminder notification
 */
export const sendCalibrationReminderNotification = async (
  vehicleReg: string,
  daysOverdue?: number
): Promise<boolean> => {
  const prefs = getNotificationPreferences();
  if (!prefs.notifyCalibrationDue) {
    return false;
  }

  const overdueNotice = daysOverdue && daysOverdue > 30 ? ` (${daysOverdue} days since last sync)` : '';
  const title = `⚠️ ATO Odometer Calibration Due`;
  const body = `${vehicleReg.toUpperCase()}: Monthly calibration required to maintain compliant logbook records. Tap to verify dashboard odometer.${overdueNotice}`;

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/apple-touch-icon.png',
    tag: `easylog-calibration-${vehicleReg.toLowerCase()}`,
    renotify: true,
    silent: false,
    data: {
      url: '/',
      action: 'open_calibration',
      vehicleReg
    }
  };

  return showSystemNotification(title, options, () => triggerOpenCalibrationDialog(vehicleReg));
};

/**
 * Sends a test notification of the specified type
 */
export const sendTestNotification = async (
  type: 'started' | 'ended' | 'verification' | 'calibration',
  distanceUnit: 'km' | 'mi' = 'km'
): Promise<boolean> => {
  if (type === 'started') {
    const title = `🚗 Test: Trip Started`;
    const body = `GPS drive tracking is active for Toyota Hilux. Safe driving!`;
    return showSystemNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/apple-touch-icon.png',
      tag: 'easylog-test-started',
      renotify: true
    });
  }

  if (type === 'ended') {
    const title = `🛑 Test: Trip Ended (28.4 ${distanceUnit})`;
    const body = `Drive finished and saved. Destination: 100 George St, Sydney CBD.`;
    return showSystemNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/apple-touch-icon.png',
      tag: 'easylog-test-ended',
      renotify: true
    });
  }

  if (type === 'calibration') {
    const title = `⚠️ Test: ATO Calibration Reminder`;
    const body = `ABC-123: Monthly odometer calibration is due. Tap to align physical dashboard with logbook.`;
    return showSystemNotification(
      title,
      {
        body,
        icon: '/pwa-192x192.png',
        badge: '/apple-touch-icon.png',
        tag: 'easylog-test-calibration',
        renotify: true,
        data: { vehicleReg: 'ABC-123' }
      },
      () => triggerOpenCalibrationDialog('ABC-123')
    );
  }

  const mockTrip: Trip = {
    id: 'test-trip',
    start: { value: 50000, timestamp: new Date().toISOString() },
    end: { value: 50015, timestamp: new Date().toISOString() },
    distance: 15,
    status: 'completed',
    verificationStatus: 'pending',
    registrationNumber: 'TEST-CAR'
  };

  const title = `🚗 Test: Trip Logged (Needs Verification)`;
  const body = `15.0 ${distanceUnit} (TEST-CAR) completed. Tap to review Work vs Personal and add reason.`;

  return showSystemNotification(
    title,
    {
      body,
      icon: '/pwa-192x192.png',
      badge: '/apple-touch-icon.png',
      tag: 'easylog-test-verification',
      renotify: true,
      data: { tripId: mockTrip.id }
    },
    () => triggerOpenVerificationQueue(mockTrip.id)
  );
};

/**
 * Sends a test push notification to verify setup (backward compatibility)
 */
export const sendTestVerificationNotification = async (
  distanceUnit: 'km' | 'mi' = 'km'
): Promise<boolean> => {
  return sendTestNotification('verification', distanceUnit);
};
