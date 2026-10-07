import React, { useState, useEffect } from 'react';
import {
  Home,
  Briefcase,
  MapPin,
  Search,
  Navigation,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Compass,
  Trash2,
  Sparkles,
  Info,
  Sliders,
  ChevronRight
} from 'lucide-react';
import { HomeWorkConfig, SavedLocation } from '../types';
import {
  getStoredHomeWorkConfig,
  saveHomeWorkConfig,
  searchAddressGeocode,
  calculateDistanceMeters,
  GeocodeSearchResult,
  DEFAULT_HOME_WORK_CONFIG
} from '../services/locationConfigService';
import { getCurrentPosition, reverseGeocode } from '../services/gpsService';

interface HomeWorkLocationSettingsProps {
  onSaved?: (config: HomeWorkConfig) => void;
  showNotification?: (msg: string, type?: 'success' | 'error') => void;
}

export const HomeWorkLocationSettings: React.FC<HomeWorkLocationSettingsProps> = ({
  onSaved,
  showNotification
}) => {
  const [config, setConfig] = useState<HomeWorkConfig>(getStoredHomeWorkConfig());
  const [homeSearchQuery, setHomeSearchQuery] = useState(config.home.address || '');
  const [workSearchQuery, setWorkSearchQuery] = useState(config.work.address || '');
  const [homeResults, setHomeResults] = useState<GeocodeSearchResult[]>([]);
  const [workResults, setWorkResults] = useState<GeocodeSearchResult[]>([]);
  const [isSearchingHome, setIsSearchingHome] = useState(false);
  const [isSearchingWork, setIsSearchingWork] = useState(false);
  const [isLocatingHome, setIsLocatingHome] = useState(false);
  const [isLocatingWork, setIsLocatingWork] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Load current device position to show proximity indicator
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentCoords({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, []);

  const handleSearchHome = async () => {
    if (!homeSearchQuery.trim()) return;
    setIsSearchingHome(true);
    const results = await searchAddressGeocode(homeSearchQuery);
    setHomeResults(results);
    setIsSearchingHome(false);
    if (results.length === 0) {
      showNotification?.('No matching addresses found. Try adding street number or suburb.', 'error');
    }
  };

  const handleSearchWork = async () => {
    if (!workSearchQuery.trim()) return;
    setIsSearchingWork(true);
    const results = await searchAddressGeocode(workSearchQuery);
    setWorkResults(results);
    setIsSearchingWork(false);
    if (results.length === 0) {
      showNotification?.('No matching addresses found. Try adding street number or suburb.', 'error');
    }
  };

  const handleSelectHome = (res: GeocodeSearchResult) => {
    const updated: SavedLocation = {
      ...config.home,
      name: 'Home',
      address: res.displayName || res.fullAddress,
      latitude: res.lat,
      longitude: res.lon
    };
    const newConfig = { ...config, home: updated };
    setConfig(newConfig);
    setHomeSearchQuery(res.displayName || res.fullAddress);
    setHomeResults([]);
    saveHomeWorkConfig(newConfig);
    showNotification?.('🏠 Home location updated & geocoded!', 'success');
    onSaved?.(newConfig);
  };

  const handleSelectWork = (res: GeocodeSearchResult) => {
    const updated: SavedLocation = {
      ...config.work,
      name: config.work.name || 'Office / Work',
      address: res.displayName || res.fullAddress,
      latitude: res.lat,
      longitude: res.lon
    };
    const newConfig = { ...config, work: updated };
    setConfig(newConfig);
    setWorkSearchQuery(res.displayName || res.fullAddress);
    setWorkResults([]);
    saveHomeWorkConfig(newConfig);
    showNotification?.('🏢 Work / Office location updated & geocoded!', 'success');
    onSaved?.(newConfig);
  };

  const handleUseCurrentLocationForHome = async () => {
    setIsLocatingHome(true);
    try {
      const pos = await getCurrentPosition(true);
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const addr = await reverseGeocode(lat, lon);
      const formattedAddr = addr || `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;

      const updated: SavedLocation = {
        ...config.home,
        name: 'Home',
        address: formattedAddr,
        latitude: lat,
        longitude: lon
      };
      const newConfig = { ...config, home: updated };
      setConfig(newConfig);
      setHomeSearchQuery(formattedAddr);
      setHomeResults([]);
      saveHomeWorkConfig(newConfig);
      showNotification?.('🏠 Home set to your current GPS position!', 'success');
      onSaved?.(newConfig);
    } catch (e: any) {
      showNotification?.('Could not get current GPS coordinates. Please check location permissions.', 'error');
    } finally {
      setIsLocatingHome(false);
    }
  };

  const handleUseCurrentLocationForWork = async () => {
    setIsLocatingWork(true);
    try {
      const pos = await getCurrentPosition(true);
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const addr = await reverseGeocode(lat, lon);
      const formattedAddr = addr || `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;

      const updated: SavedLocation = {
        ...config.work,
        name: config.work.name || 'Office / Work',
        address: formattedAddr,
        latitude: lat,
        longitude: lon
      };
      const newConfig = { ...config, work: updated };
      setConfig(newConfig);
      setWorkSearchQuery(formattedAddr);
      setWorkResults([]);
      saveHomeWorkConfig(newConfig);
      showNotification?.('🏢 Work set to your current GPS position!', 'success');
      onSaved?.(newConfig);
    } catch (e: any) {
      showNotification?.('Could not get current GPS coordinates. Please check location permissions.', 'error');
    } finally {
      setIsLocatingWork(false);
    }
  };

  const handleClearHome = () => {
    const updated: SavedLocation = {
      ...config.home,
      address: '',
      latitude: null,
      longitude: null
    };
    const newConfig = { ...config, home: updated };
    setConfig(newConfig);
    setHomeSearchQuery('');
    setHomeResults([]);
    saveHomeWorkConfig(newConfig);
    showNotification?.('Home location cleared', 'success');
    onSaved?.(newConfig);
  };

  const handleClearWork = () => {
    const updated: SavedLocation = {
      ...config.work,
      address: '',
      latitude: null,
      longitude: null
    };
    const newConfig = { ...config, work: updated };
    setConfig(newConfig);
    setWorkSearchQuery('');
    setWorkResults([]);
    saveHomeWorkConfig(newConfig);
    showNotification?.('Work location cleared', 'success');
    onSaved?.(newConfig);
  };

  const handleRadiusChange = (target: 'home' | 'work', radius: number) => {
    const newConfig = {
      ...config,
      [target]: {
        ...config[target],
        radiusMeters: radius
      }
    };
    setConfig(newConfig);
    saveHomeWorkConfig(newConfig);
    onSaved?.(newConfig);
  };

  const handleToggleAutoHome = (checked: boolean) => {
    const newConfig = {
      ...config,
      autoDetectHomeAsPersonal: checked
    };
    setConfig(newConfig);
    saveHomeWorkConfig(newConfig);
    showNotification?.(
      checked
        ? '✅ Trips to/from Home will auto-classify as Personal (ATO rule)'
        : 'Trips to/from Home will not auto-classify',
      'success'
    );
    onSaved?.(newConfig);
  };

  const handleToggleAutoWork = (checked: boolean) => {
    const newConfig = {
      ...config,
      autoDetectWorkAsBusiness: checked
    };
    setConfig(newConfig);
    saveHomeWorkConfig(newConfig);
    onSaved?.(newConfig);
  };

  // Proximity calculations
  const homeDist =
    currentCoords && config.home.latitude && config.home.longitude
      ? calculateDistanceMeters(currentCoords.lat, currentCoords.lon, config.home.latitude, config.home.longitude)
      : null;

  const workDist =
    currentCoords && config.work.latitude && config.work.longitude
      ? calculateDistanceMeters(currentCoords.lat, currentCoords.lon, config.work.latitude, config.work.longitude)
      : null;

  return (
    <div className="space-y-6 animate-fade-in text-gray-800">
      {/* ATO Compliance Header Banner */}
      <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white rounded-2xl p-4 shadow-md border border-emerald-800/40 space-y-2">
        <div className="flex items-center space-x-2">
          <div className="bg-emerald-500/20 p-2 rounded-xl text-emerald-300">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">ATO Commute & Frequent Places</h3>
            <p className="text-[11px] text-emerald-200">
              Auto-classify trips to protect business percentage under Division 28
            </p>
          </div>
        </div>
        <p className="text-xs text-emerald-100/90 leading-relaxed bg-black/20 p-2.5 rounded-xl border border-white/5">
          <strong>ATO Rule:</strong> Normal daily travel between your home and a regular place of employment is
          considered <em>private commute</em> and cannot be claimed as tax-deductible travel. By setting your Home and Work
          geocodes, EasyLog will automatically flag Home trips as <strong>Personal</strong> so you never overclaim.
        </p>
      </div>

      {/* Main Switch: Auto-Detect Home Trips as Personal */}
      <div className="bg-white border-2 border-emerald-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 pr-4">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-gray-900">Auto-Detect Home Trips as Personal</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Recommended
              </span>
            </div>
            <p className="text-xs text-gray-600 leading-normal">
              Trips starting from or arriving at Home will be automatically classified as <strong>Personal</strong> (ATO
              non-deductible commute). You can always override individual trips when carrying bulky tools or for
              itinerant work.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input
              type="checkbox"
              checked={config.autoDetectHomeAsPersonal}
              onChange={(e) => handleToggleAutoHome(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-gray-700">
            <span>Auto-detect trips to Work/Office as Business:</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={config.autoDetectWorkAsBusiness}
              onChange={(e) => handleToggleAutoWork(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>
      </div>

      {/* 1. Home Location Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Home size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-gray-900">Home Address & Coordinates</h4>
              <p className="text-[11px] text-gray-500">Your primary residence for commute detection</p>
            </div>
          </div>
          {config.home.latitude && config.home.longitude && (
            <span className="flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 size={12} className="mr-1" />
              GPS Linked
            </span>
          )}
        </div>

        {/* Address Input & Actions */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-700">Home Street Address</label>
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={homeSearchQuery}
                onChange={(e) => setHomeSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchHome()}
                placeholder="e.g. 14 King Street, Sydney NSW"
                className="w-full text-xs px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-gray-900 pr-8"
              />
              {homeSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setHomeSearchQuery('');
                    setHomeResults([]);
                  }}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSearchHome}
              disabled={isSearchingHome || !homeSearchQuery.trim()}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1 shrink-0 transition disabled:opacity-50"
            >
              <Search size={14} />
              <span>{isSearchingHome ? 'Searching...' : 'Geocode'}</span>
            </button>
          </div>

          {/* Quick GPS Geocode Button */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleUseCurrentLocationForHome}
              disabled={isLocatingHome}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 transition hover:underline"
            >
              <Navigation size={13} className={isLocatingHome ? 'animate-spin' : ''} />
              <span>{isLocatingHome ? 'Getting GPS fix...' : 'Use My Current GPS Location'}</span>
            </button>
            {config.home.address && (
              <button
                type="button"
                onClick={handleClearHome}
                className="text-xs text-red-500 hover:text-red-700 flex items-center space-x-1"
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Autocomplete / Search Candidates dropdown */}
          {homeResults.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg mt-2 overflow-hidden divide-y divide-gray-100 z-10">
              <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Select matching address:
              </div>
              {homeResults.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectHome(r)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 transition flex items-start space-x-2"
                >
                  <MapPin size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="overflow-hidden">
                    <div className="font-semibold text-gray-900 truncate">{r.displayName}</div>
                    <div className="text-[10px] text-gray-500 truncate">{r.fullAddress}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Home Geofence Details */}
        {config.home.latitude && config.home.longitude ? (
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center text-emerald-900">
              <span className="font-mono text-[11px] font-semibold">
                Lat: {config.home.latitude.toFixed(5)} • Lon: {config.home.longitude.toFixed(5)}
              </span>
              {homeDist !== null && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  homeDist <= (config.home.radiusMeters || 250)
                    ? 'bg-emerald-600 text-white animate-pulse'
                    : 'bg-emerald-200/80 text-emerald-800'
                }`}>
                  {homeDist <= (config.home.radiusMeters || 250)
                    ? 'Currently at Home'
                    : `${(homeDist / 1000).toFixed(1)} km away`}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 text-xs">
              <span className="text-gray-600 font-medium">Detection Geofence Radius:</span>
              <div className="flex items-center space-x-1">
                {[150, 250, 400, 600].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRadiusChange('home', r)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                      (config.home.radiusMeters || 250) === r
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-white text-gray-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    {r}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 flex items-start space-x-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              Home is not yet geocoded. Enter your address above and tap <strong>Geocode</strong>, or tap{' '}
              <strong>Use Current Location</strong> while at home.
            </span>
          </div>
        )}
      </div>

      {/* 2. Work / Office Location Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Briefcase size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-gray-900">Workplace / Office</h4>
              <p className="text-[11px] text-gray-500">Office, depot, or primary work location</p>
            </div>
          </div>
          {config.work.latitude && config.work.longitude && (
            <span className="flex items-center text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
              <CheckCircle2 size={12} className="mr-1" />
              GPS Linked
            </span>
          )}
        </div>

        {/* Workplace Name */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-gray-700">Location Name / Label</label>
          <input
            type="text"
            value={config.work.name || ''}
            onChange={(e) => {
              const updated = { ...config, work: { ...config.work, name: e.target.value } };
              setConfig(updated);
              saveHomeWorkConfig(updated);
            }}
            placeholder="e.g. Head Office, CBD Depot, Warehouse"
            className="w-full text-xs px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-900"
          />
        </div>

        {/* Work Address Input & Actions */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-700">Workplace Street Address</label>
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={workSearchQuery}
                onChange={(e) => setWorkSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchWork()}
                placeholder="e.g. 100 Miller St, North Sydney NSW"
                className="w-full text-xs px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-900 pr-8"
              />
              {workSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setWorkSearchQuery('');
                    setWorkResults([]);
                  }}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSearchWork}
              disabled={isSearchingWork || !workSearchQuery.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1 shrink-0 transition disabled:opacity-50"
            >
              <Search size={14} />
              <span>{isSearchingWork ? 'Searching...' : 'Geocode'}</span>
            </button>
          </div>

          {/* Quick GPS Geocode Button for Work */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleUseCurrentLocationForWork}
              disabled={isLocatingWork}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 flex items-center space-x-1 transition hover:underline"
            >
              <Navigation size={13} className={isLocatingWork ? 'animate-spin' : ''} />
              <span>{isLocatingWork ? 'Getting GPS fix...' : 'Use My Current GPS Location'}</span>
            </button>
            {config.work.address && (
              <button
                type="button"
                onClick={handleClearWork}
                className="text-xs text-red-500 hover:text-red-700 flex items-center space-x-1"
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Autocomplete / Search Candidates dropdown */}
          {workResults.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg mt-2 overflow-hidden divide-y divide-gray-100 z-10">
              <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Select matching address:
              </div>
              {workResults.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectWork(r)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 transition flex items-start space-x-2"
                >
                  <MapPin size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div className="overflow-hidden">
                    <div className="font-semibold text-gray-900 truncate">{r.displayName}</div>
                    <div className="text-[10px] text-gray-500 truncate">{r.fullAddress}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Work Geofence Details */}
        {config.work.latitude && config.work.longitude ? (
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center text-indigo-900">
              <span className="font-mono text-[11px] font-semibold">
                Lat: {config.work.latitude.toFixed(5)} • Lon: {config.work.longitude.toFixed(5)}
              </span>
              {workDist !== null && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  workDist <= (config.work.radiusMeters || 250)
                    ? 'bg-indigo-600 text-white animate-pulse'
                    : 'bg-indigo-200/80 text-indigo-800'
                }`}>
                  {workDist <= (config.work.radiusMeters || 250)
                    ? 'Currently at Work'
                    : `${(workDist / 1000).toFixed(1)} km away`}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-indigo-200/60 text-xs">
              <span className="text-gray-600 font-medium">Detection Geofence Radius:</span>
              <div className="flex items-center space-x-1">
                {[150, 250, 400, 600].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRadiusChange('work', r)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                      (config.work.radiusMeters || 250) === r
                        ? 'bg-indigo-700 text-white shadow-xs'
                        : 'bg-white text-gray-700 hover:bg-indigo-100 border border-indigo-200'
                    }`}
                  >
                    {r}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 flex items-start space-x-2">
            <Info size={15} className="shrink-0 mt-0.5 text-gray-500" />
            <span>
              Work location is optional. When configured, trips between work and client sites will auto-classify as Work.
            </span>
          </div>
        )}
      </div>

      {/* Tax Law Reference Note */}
      <div className="p-3.5 bg-gray-50 border border-gray-200/90 rounded-2xl text-[11px] text-gray-600 space-y-1.5 leading-relaxed">
        <div className="flex items-center space-x-1.5 font-bold text-gray-800">
          <HelpCircle size={13} className="text-indigo-600" />
          <span>ATO Commute Reference (ITAA 1997 Division 28 & MT 2027)</span>
        </div>
        <p>
          Travel from home to a normal work base is considered personal by default. Exceptions exist if you are
          required to transport bulky work tools with no secure storage at work, or perform truly itinerant work
          across variable job sites. You can change any individual trip classification during verification.
        </p>
      </div>
    </div>
  );
};
