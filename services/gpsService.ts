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
 * Gets current location with multi-stage fallback:
 * 1. High accuracy GPS (satellites) with 6s timeout
 * 2. Medium/low accuracy (cellular/Wi-Fi positioning) with 8s timeout
 * 3. IP-based coarse fallback so the app NEVER hangs on "Acquiring GPS..."
 */
export async function getCurrentPosition(highAccuracy = true): Promise<GeolocationPosition> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser or environment.');
  }

  // Helper for single navigator.geolocation attempt
  const attemptGeo = (enableHighAccuracy: boolean, timeoutMs: number): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        {
          enableHighAccuracy,
          timeout: timeoutMs,
          maximumAge: 15000,
        }
      );
    });
  };

  // Stage 1: Try high accuracy if requested
  if (highAccuracy) {
    try {
      const pos = await attemptGeo(true, 7000);
      return pos;
    } catch (err: any) {
      console.warn('High-accuracy GPS fix timed out or failed, falling back to network positioning...', err);
    }
  }

  // Stage 2: Try network/cell tower coarse geolocation
  try {
    const pos = await attemptGeo(false, 9000);
    return pos;
  } catch (err: any) {
    console.warn('Standard geolocation failed, attempting IP-based coarse coordinates...', err);
  }

  // Stage 3: IP Geolocation fallback (works indoors, on desktops, or in emulators)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        const syntheticPos: GeolocationPosition = {
          coords: {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: 2500, // Coarse IP accuracy
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({})
          } as GeolocationCoordinates,
          timestamp: Date.now(),
          toJSON: () => ({})
        } as GeolocationPosition;
        return syntheticPos;
      }
    }
  } catch (ipErr) {
    console.warn('IP geolocation fallback failed:', ipErr);
  }

  throw new Error('GPS coordinates unavailable. Check browser site permissions or enable phone location.');
}

/**
 * Cached reverse geocoding to prevent excessive network requests.
 */
const geocodeCache = new Map<string, string>();

export function isPlaceholderAddress(address?: string): boolean {
  if (!address || !address.trim()) return true;
  const lower = address.toLowerCase();
  return (
    lower.includes('locating') ||
    lower.includes('getting gps') ||
    lower.includes('acquiring') ||
    lower.includes('resolving') ||
    lower.includes('pending') ||
    lower === 'current location' ||
    lower === 'start location'
  );
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  if ((!lat && !lon) || (lat === 0 && lon === 0)) return '';
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  // Strategy 1: Server-side proxy (fastest, unblocked, avoids client CORS/User-Agent policy)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.address && !data.address.includes('°')) {
        geocodeCache.set(cacheKey, data.address);
        return data.address;
      }
      if (data.address) {
        geocodeCache.set(cacheKey, data.address);
        return data.address;
      }
    }
  } catch (err) {
    // Continue to direct fallbacks
  }

  // Strategy 2: Direct BigDataCloud free client reverse geocoding API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (bdcRes.ok) {
      const bdc = await bdcRes.json();
      const locality = bdc.locality || bdc.city || '';
      const principalSubdiv = bdc.principalSubdivision || '';
      const street = bdc.localityInfo?.administrative?.[bdc.localityInfo.administrative.length - 1]?.name || '';

      let formatted = '';
      if (street && locality && street !== locality) {
        formatted = `${street}, ${locality}`;
      } else if (locality) {
        formatted = principalSubdiv ? `${locality}, ${principalSubdiv}` : locality;
      }

      if (formatted) {
        geocodeCache.set(cacheKey, formatted);
        return formatted;
      }
    }
  } catch (bdcErr) {
    // Continue to nominatim
  }

  // Strategy 3: Direct Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
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
        label = data.display_name.split(',').slice(0, 2).join(',').trim();
      }

      if (label) {
        geocodeCache.set(cacheKey, label);
        return label;
      }
    }
  } catch (e) {
    // Offline or network error
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
