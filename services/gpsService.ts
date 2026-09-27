import { LocationPoint } from '../types';

/**
 * Calculates distance between two GPS coordinates using the Haversine formula.
 * @param lat1 Latitude 1
 * @param lon1 Longitude 1
 * @param lat2 Latitude 2
 * @param lon2 Longitude 2
 * @param unit 'km' or 'mi'
 * @returns distance in specified unit
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'km' | 'mi' = 'km'
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = unit === 'mi' ? 3958.8 : 6371.0; // Earth's radius in miles or km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Gets current location with promise and timeout.
 */
export function getCurrentPosition(highAccuracy = true): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      {
        enableHighAccuracy: highAccuracy,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  });
}

/**
 * Cached reverse geocoding to prevent excessive network requests.
 */
const geocodeCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'EasyLogApp/1.8 (trip-tracker)'
        }
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address;
      let label = '';
      if (addr) {
        const road = addr.road || addr.street || addr.pedestrian || addr.suburb || '';
        const city = addr.city || addr.town || addr.village || addr.city_district || addr.county || '';
        const state = addr.state ? addr.state.substring(0, 3).toUpperCase() : '';
        if (road && city) {
          label = `${road}, ${city}`;
        } else if (road) {
          label = road;
        } else if (city) {
          label = state ? `${city}, ${state}` : city;
        }
      }

      if (!label && data.display_name) {
        // take first 2 parts of display name
        label = data.display_name.split(',').slice(0, 2).join(',').trim();
      }

      if (label) {
        geocodeCache.set(cacheKey, label);
        return label;
      }
    }
  } catch (e) {
    // Offline or network error - fallback to formatted coordinates
  }

  const fallback = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  geocodeCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Screen Wake Lock Manager
 */
let wakeLockSentinel: any = null;

export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
      return false;
    }
  }
  return false;
}

export async function releaseScreenWakeLock(): Promise<void> {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    } catch (err) {
      console.warn('Wake Lock release error:', err);
    }
  }
}

/**
 * Audio Chime via Web Audio API (Zero external assets needed)
 */
function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      return new AudioContextClass();
    }
  } catch (e) {
    // AudioContext not supported
  }
  return null;
}

export function playTripStartTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Arpeggio up: 440Hz (A4) -> 554Hz (C#5) -> 659Hz (E5)
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.1);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.2);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch (e) {
    console.debug('Audio tone error', e);
  }
}

export function playTripEndTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Two-tone chime down: 659Hz (E5) -> 523Hz (C5)
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.setValueAtTime(523.25, now + 0.15);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.46);
  } catch (e) {
    console.debug('Audio tone error', e);
  }
}

export function triggerHaptic(type: 'start' | 'stop' | 'success' = 'start'): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'start') {
        navigator.vibrate([80, 40, 100]);
      } else if (type === 'stop') {
        navigator.vibrate([120, 60, 120]);
      } else {
        navigator.vibrate(80);
      }
    } catch (e) {
      // Ignore vibration error
    }
  }
}

/**
 * Format elapsed time (seconds) to mm:ss or hh:mm:ss
 */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
