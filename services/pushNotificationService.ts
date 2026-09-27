import { Trip } from '../types';

const STORAGE_KEY_PUSH_ENABLED = 'easylog_push_enabled';

export interface NotificationStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  enabled: boolean;
}

/**
 * Checks if Web Notifications API is supported in current environment
 */
export const isNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/**
 * Gets current notification status
 */
export const getNotificationStatus = (): NotificationStatus => {
  if (!isNotificationSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      enabled: false
    };
  }

  const permission = Notification.permission;
  const storedPref = localStorage.getItem(STORAGE_KEY_PUSH_ENABLED);
  const enabled = permission === 'granted' && storedPref !== 'false';

  return {
    supported: true,
    permission,
    enabled
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
      localStorage.setItem(STORAGE_KEY_PUSH_ENABLED, 'true');
      return true;
    } else {
      localStorage.setItem(STORAGE_KEY_PUSH_ENABLED, 'false');
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
  localStorage.setItem(STORAGE_KEY_PUSH_ENABLED, enabled ? 'true' : 'false');
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
 * Sends a push notification alerting the user that a new trip has been added to the verification list
 */
export const sendTripVerificationNotification = async (
  trip: Trip,
  distanceUnit: 'km' | 'mi' = 'km',
  pendingCount?: number
): Promise<boolean> => {
  const status = getNotificationStatus();
  if (!status.supported || !status.enabled || status.permission !== 'granted') {
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

  try {
    // Try via Service Worker if available (standard for PWAs and background)
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

    // Direct Notification fallback
    const notification = new Notification(title, options);
    notification.onclick = (event) => {
      event.preventDefault();
      triggerOpenVerificationQueue(trip.id);
      notification.close();
    };

    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};

/**
 * Sends a test push notification to verify setup
 */
export const sendTestVerificationNotification = async (
  distanceUnit: 'km' | 'mi' = 'km'
): Promise<boolean> => {
  const mockTrip: Trip = {
    id: 'test-trip',
    start: { value: 50000, timestamp: new Date().toISOString() },
    end: { value: 50015, timestamp: new Date().toISOString() },
    distance: 15,
    status: 'completed',
    verificationStatus: 'pending',
    registrationNumber: 'TEST-CAR'
  };

  return sendTripVerificationNotification(mockTrip, distanceUnit, 1);
};
