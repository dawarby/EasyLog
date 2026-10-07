import { HomeWorkConfig, SavedLocation, LocationPoint } from '../types';

export const STORAGE_KEY_HOME_WORK = 'easylog_home_work_config';
export const LEGACY_STORAGE_KEY_HOME_WORK = 'snaplog_home_work_config';

export const DEFAULT_HOME_WORK_CONFIG: HomeWorkConfig = {
  home: {
    name: 'Home',
    address: '',
    latitude: null,
    longitude: null,
    radiusMeters: 250
  },
  work: {
    name: 'Office / Work',
    address: '',
    latitude: null,
    longitude: null,
    radiusMeters: 250
  },
  autoDetectHomeAsPersonal: true,
  autoDetectWorkAsBusiness: true
};

export function getStoredHomeWorkConfig(): HomeWorkConfig {
  if (typeof window === 'undefined') return DEFAULT_HOME_WORK_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HOME_WORK) || localStorage.getItem(LEGACY_STORAGE_KEY_HOME_WORK);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_HOME_WORK_CONFIG,
        ...parsed,
        home: {
          ...DEFAULT_HOME_WORK_CONFIG.home,
          ...(parsed.home || {})
        },
        work: {
          ...DEFAULT_HOME_WORK_CONFIG.work,
          ...(parsed.work || {})
        }
      };
    }
  } catch (e) {
    console.warn('Failed to parse home/work config from localStorage', e);
  }
  return DEFAULT_HOME_WORK_CONFIG;
}

export function saveHomeWorkConfig(config: HomeWorkConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_HOME_WORK, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('easylog_homework_updated', { detail: config }));
  } catch (e) {
    console.error('Failed to save home/work config', e);
  }
}

/**
 * Calculates straight-line distance in meters between two coordinate points
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === 0 && lon1 === 0) return Infinity;
  if (lat2 === 0 && lon2 === 0) return Infinity;

  const R = 6371000; // Earth radius in meters
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
 * Checks whether a given location point (coordinates or address text) matches a saved location
 */
export function isLocationMatch(
  point?: LocationPoint | null,
  target?: SavedLocation | null
): boolean {
  if (!point || !target) return false;

  // 1. Geofence radius check (highest precision)
  if (
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    point.latitude !== 0 &&
    point.longitude !== 0 &&
    typeof target.latitude === 'number' &&
    typeof target.longitude === 'number' &&
    target.latitude !== 0 &&
    target.longitude !== 0
  ) {
    const distMeters = calculateDistanceMeters(
      point.latitude,
      point.longitude,
      target.latitude,
      target.longitude
    );
    const threshold = target.radiusMeters || 250;
    if (distMeters <= threshold) {
      return true;
    }
  }

  // 2. Address text / snippet comparison
  if (point.address && target.address) {
    const cleanPoint = point.address.toLowerCase().trim();
    const cleanTarget = target.address.toLowerCase().trim();

    // Exact or direct substring match
    if (cleanPoint.includes(cleanTarget) || cleanTarget.includes(cleanPoint)) {
      return true;
    }

    // Street token overlap (e.g. "12 Elm St" in "12 Elm Street, Richmond VIC 3121")
    const targetTokens = cleanTarget
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['street', 'road', 'avenue', 'drive', 'lane', 'close', 'court', 'drive'].includes(w));
    
    if (targetTokens.length > 0) {
      const matchCount = targetTokens.filter((token) => cleanPoint.includes(token)).length;
      if (matchCount >= Math.min(2, targetTokens.length)) {
        return true;
      }
    }
  }

  // 3. Name keyword heuristic (e.g. point address literally contains "Home" or "Office")
  if (point.address && target.name) {
    const lowerAddr = point.address.toLowerCase();
    const lowerName = target.name.toLowerCase();
    if (lowerName === 'home' && (lowerAddr.includes('home') || lowerAddr.includes('residence'))) {
      return true;
    }
    if ((lowerName.includes('work') || lowerName.includes('office')) && (lowerAddr.includes('office') || lowerAddr.includes('hq') || lowerAddr.includes('workplace'))) {
      return true;
    }
  }

  return false;
}

export interface TripPurposeEvaluation {
  isHomeTrip: boolean;
  isWorkTrip: boolean;
  isCommute: boolean;
  recommendedType: 'work' | 'personal' | null;
  reason: string | null;
  ruleExplanation: string | null;
}

/**
 * Automatically evaluates whether a trip should be classified as Personal or Work
 * based on Home and Work configuration and ATO Division 28 rules.
 */
export function evaluateTripPurpose(
  startLoc?: LocationPoint | null,
  endLoc?: LocationPoint | null,
  config: HomeWorkConfig = getStoredHomeWorkConfig()
): TripPurposeEvaluation {
  const { home, work, autoDetectHomeAsPersonal, autoDetectWorkAsBusiness } = config;

  const startIsHome = isLocationMatch(startLoc, home);
  const endIsHome = isLocationMatch(endLoc, home);
  const startIsWork = isLocationMatch(startLoc, work);
  const endIsWork = isLocationMatch(endLoc, work);

  const isHomeTrip = startIsHome || endIsHome;
  const isWorkTrip = startIsWork || endIsWork;
  const isCommute = (startIsHome && endIsWork) || (startIsWork && endIsHome);

  // ATO Rule 1: Trips from or to Home are Personal (Commute between home and place of work is private)
  if (isHomeTrip && autoDetectHomeAsPersonal) {
    let reason = 'Personal: Trip to or from Home';
    let explanation = 'ATO Rule: Travel between home and a normal workplace is private commute travel and cannot be claimed.';

    if (isCommute) {
      reason = 'Personal: Home ↔ Work Commute';
      explanation = 'ATO Division 28: Daily commuting between your home and work base is classified as non-deductible private travel.';
    } else if (startIsHome && endIsHome) {
      reason = 'Personal: Round-trip from Home';
      explanation = 'Trip commenced and finished at home.';
    } else if (startIsHome) {
      reason = 'Personal: Originating from Home';
      explanation = 'Commencing travel from home is classified as personal by default under ATO record-keeping guidelines.';
    } else if (endIsHome) {
      reason = 'Personal: Returning to Home';
      explanation = 'Returning home after work is classified as private commute.';
    }

    return {
      isHomeTrip: true,
      isWorkTrip,
      isCommute,
      recommendedType: 'personal',
      reason,
      ruleExplanation: explanation
    };
  }

  // Rule 2: Travel to or from configured Work/Office (not involving Home) is Work
  if (isWorkTrip && !isHomeTrip && autoDetectWorkAsBusiness) {
    const workName = work.name || 'Office';
    return {
      isHomeTrip: false,
      isWorkTrip: true,
      isCommute: false,
      recommendedType: 'work',
      reason: `Work: Travel to/from ${workName}`,
      ruleExplanation: `Travel between business locations or client sites and ${workName} is deductible business travel.`
    };
  }

  return {
    isHomeTrip,
    isWorkTrip,
    isCommute,
    recommendedType: null,
    reason: null,
    ruleExplanation: null
  };
}

export interface GeocodeSearchResult {
  displayName: string;
  fullAddress: string;
  lat: number;
  lon: number;
}

/**
 * Searches and forward geocodes an address string to get coordinates
 */
export async function searchAddressGeocode(query: string): Promise<GeocodeSearchResult[]> {
  const cleanQ = query.trim();
  if (!cleanQ || cleanQ.length < 3) return [];

  // Strategy 1: Server-side proxy
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(cleanQ)}`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      }
    }
  } catch (err) {
    // Continue to client direct fallback
  }

  // Strategy 2: Direct Nominatim fallback
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(cleanQ)}&limit=5&addressdetails=1`,
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
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          displayName: item.display_name.split(',').slice(0, 3).join(',').trim(),
          fullAddress: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon)
        }));
      }
    }
  } catch (e) {
    console.warn('Direct geocoding fallback failed', e);
  }

  return [];
}
