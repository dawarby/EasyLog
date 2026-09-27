import { Trip } from '../types';

export interface TripPrediction {
  predictedTripType: 'work' | 'personal';
  confidence: number; // 0 to 100
  predictedClient: string;
  predictedCategory: string;
  predictedReason: string;
  tags: string[];
  explanation: string;
}

export interface PlaceRule {
  id: string;
  name: string;
  addressSnippet: string;
  tripType: 'work' | 'personal';
  clientName?: string;
  category?: string;
}

const STORAGE_KEY_PLACE_RULES = 'easylog_place_rules';
const LEGACY_STORAGE_KEY_PLACE_RULES = 'snaplog_place_rules';

export function getSavedPlaceRules(): PlaceRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLACE_RULES) || localStorage.getItem(LEGACY_STORAGE_KEY_PLACE_RULES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load place rules', e);
  }
  return [
    { id: '1', name: 'Home', addressSnippet: 'home', tripType: 'personal', category: 'Personal' },
    { id: '2', name: 'Office / HQ', addressSnippet: 'office', tripType: 'work', category: 'General Business' },
    { id: '3', name: 'Hardware & Supplies', addressSnippet: 'bunnings', tripType: 'work', category: 'Supplies' }
  ];
}

export function savePlaceRule(rule: PlaceRule): void {
  try {
    const existing = getSavedPlaceRules().filter(r => r.id !== rule.id);
    localStorage.setItem(STORAGE_KEY_PLACE_RULES, JSON.stringify([rule, ...existing]));
  } catch (e) {}
}

/**
 * Predicts trip tags using server Gemini API, with instant local heuristic fallback.
 */
export async function predictTripTag(
  tripData: {
    startAddress?: string;
    endAddress?: string;
    distance?: number;
    startTime?: string;
    vehicle?: string;
    notes?: string;
  },
  recentTrips: Trip[] = []
): Promise<TripPrediction> {
  const { startAddress = '', endAddress = '', distance = 0, startTime = new Date().toISOString(), vehicle = '', notes = '' } = tripData;

  // 1. Check local place rules first for instant high-confidence match
  const rules = getSavedPlaceRules();
  const fullText = `${startAddress} ${endAddress} ${notes}`.toLowerCase();
  for (const rule of rules) {
    if (rule.addressSnippet && fullText.includes(rule.addressSnippet.toLowerCase())) {
      return {
        predictedTripType: rule.tripType,
        confidence: 96,
        predictedClient: rule.clientName || '',
        predictedCategory: rule.category || (rule.tripType === 'work' ? 'Client / Business' : 'Personal'),
        predictedReason: `Auto-matched known place: ${rule.name}`,
        tags: [rule.tripType === 'work' ? 'Work' : 'Personal', rule.name],
        explanation: `Matches your saved rule for "${rule.name}".`
      };
    }
  }

  // 2. Query Gemini AI Predictive Tagging Endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch('/api/predict-trip-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startAddress,
        endAddress,
        distance,
        startTime,
        vehicle,
        notes,
        recentTrips: recentTrips.map(t => ({
          startAddress: t.startLocation?.address,
          endAddress: t.endLocation?.address,
          tripType: t.tripType,
          clientName: t.clientName,
          notes: t.notes
        }))
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.prediction) {
        return data.prediction;
      }
    }
  } catch (err) {
    // Network offline or timeout - fallback to local heuristic
  }

  // 3. Smart Local Heuristic Fallback
  const hour = new Date(startTime).getHours();
  const day = new Date(startTime).getDay();
  const isWeekend = day === 0 || day === 6;
  const isWorkHours = !isWeekend && hour >= 8 && hour <= 18;

  // Search recent trips for similar destination
  if (endAddress) {
    const endSnippet = endAddress.split(',')[0].trim().toLowerCase();
    const match = recentTrips.find(t =>
      t.endLocation?.address && t.endLocation.address.toLowerCase().includes(endSnippet)
    );
    if (match) {
      return {
        predictedTripType: match.tripType || 'work',
        confidence: 90,
        predictedClient: match.clientName || '',
        predictedCategory: match.tripType === 'personal' ? 'Personal' : 'Repeat Client',
        predictedReason: match.notes || 'Trip to recurring destination',
        tags: [match.tripType === 'personal' ? 'Personal' : 'Work', 'Repeat Visit'],
        explanation: `Destination matches previous trip to ${match.clientName || endSnippet}.`
      };
    }
  }

  const isPersonal = /home|gym|supermarket|woolworths|coles|cinema|cafe|beach|mall|park/i.test(fullText);
  const tripType = isPersonal ? 'personal' : (isWorkHours ? 'work' : 'personal');

  return {
    predictedTripType: tripType,
    confidence: isWorkHours ? 84 : 76,
    predictedClient: '',
    predictedCategory: tripType === 'work' ? 'Client Visit' : 'Personal',
    predictedReason: tripType === 'work' ? 'Business meeting / site travel' : 'Personal errand',
    tags: [tripType === 'work' ? 'Work' : 'Personal'],
    explanation: isPersonal
      ? 'Detected personal location keywords.'
      : (isWorkHours ? 'Standard business hours weekday travel.' : 'After-hours / weekend travel.')
  };
}
