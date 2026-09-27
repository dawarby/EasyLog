import React, { useState, useEffect } from 'react';
import { X, Navigation, Car, Briefcase, User, MapPin, Gauge, AlertCircle, Loader2, Plus, Check } from 'lucide-react';
import { LocationPoint } from '../types';
import { getCurrentPosition, reverseGeocode, playTripStartTone, triggerHaptic } from '../services/gpsService';

interface GpsStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGpsTrip: (data: {
    startOdo: number;
    vehicle: string;
    tripType: 'work' | 'personal';
    clientName: string;
    notes: string;
    startLocation: LocationPoint;
  }) => void;
  vehicles: string[];
  onAddVehicle: (reg: string) => void;
  lastKnownOdoForVehicle: (reg: string) => number | null;
  distanceUnit: 'km' | 'mi';
}

export const GpsStartModal: React.FC<GpsStartModalProps> = ({
  isOpen,
  onClose,
  onStartGpsTrip,
  vehicles,
  onAddVehicle,
  lastKnownOdoForVehicle,
  distanceUnit
}) => {
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [startOdo, setStartOdo] = useState<string>('');
  const [tripType, setTripType] = useState<'work' | 'personal'>('work');
  const [clientName, setClientName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  // GPS State
  const [isLocating, setIsLocating] = useState<boolean>(true);
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  
  // New Vehicle Quick Add
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicleInput, setNewVehicleInput] = useState('');

  // Initial setup when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Pick first vehicle or current
    const defaultVehicle = vehicles.length > 0 ? vehicles[0] : '';
    setSelectedVehicle(defaultVehicle);

    if (defaultVehicle) {
      const lastOdo = lastKnownOdoForVehicle(defaultVehicle);
      setStartOdo(lastOdo ? lastOdo.toString() : '0');
    } else {
      setStartOdo('0');
    }

    setClientName('');
    setNotes('');
    setGpsError(null);
    setIsLocating(true);

    // Acquire GPS position
    getCurrentPosition(true)
      .then(async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const address = await reverseGeocode(latitude, longitude);
        setCurrentLocation({
          latitude,
          longitude,
          accuracy,
          address,
          timestamp: new Date().toISOString()
        });
        setIsLocating(false);
      })
      .catch((err) => {
        console.warn('GPS location error:', err);
        setGpsError('Unable to acquire high-accuracy GPS. Make sure location permissions are allowed.');
        setIsLocating(false);
        // Fallback default coordinates if in dev/desktop
        setCurrentLocation({
          latitude: 0,
          longitude: 0,
          accuracy: 100,
          address: 'Current Location',
          timestamp: new Date().toISOString()
        });
      });
  }, [isOpen, vehicles]);

  // When vehicle changes, update suggested starting odometer
  const handleVehicleChange = (reg: string) => {
    setSelectedVehicle(reg);
    const lastOdo = lastKnownOdoForVehicle(reg);
    if (lastOdo !== null && lastOdo > 0) {
      setStartOdo(lastOdo.toString());
    }
  };

  const handleAddNewVehicle = () => {
    if (newVehicleInput.trim()) {
      const formatted = newVehicleInput.trim().toUpperCase();
      onAddVehicle(formatted);
      setSelectedVehicle(formatted);
      setNewVehicleInput('');
      setIsAddingVehicle(false);
    }
  };

  const handleStart = () => {
    const odoValue = parseInt(startOdo, 10);
    if (isNaN(odoValue) || odoValue < 0) {
      alert('Please enter a valid starting odometer reading.');
      return;
    }

    const loc: LocationPoint = currentLocation || {
      latitude: 0,
      longitude: 0,
      address: 'GPS Trip Start',
      timestamp: new Date().toISOString()
    };

    playTripStartTone();
    triggerHaptic('start');

    onStartGpsTrip({
      startOdo: odoValue,
      vehicle: selectedVehicle,
      tripType,
      clientName: clientName.trim(),
      notes: notes.trim(),
      startLocation: loc
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shrink-0">
          <div className="flex items-center space-x-2">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
              <Navigation size={20} className="text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Start GPS Trip</h2>
              <p className="text-xs text-indigo-100">Live distance tracking</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* GPS Status Box */}
          <div className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/60 flex items-start space-x-3">
            <div className="mt-0.5 text-indigo-600 shrink-0">
              {isLocating ? (
                <Loader2 size={18} className="animate-spin text-indigo-600" />
              ) : (
                <MapPin size={18} className="text-green-600" />
              )}
            </div>
            <div className="flex-1 text-xs">
              <div className="font-semibold text-gray-800 flex items-center justify-between">
                <span>Start Location</span>
                {currentLocation?.accuracy && (
                  <span className="text-[10px] font-mono font-normal text-indigo-600 bg-white px-1.5 py-0.5 rounded border border-indigo-100">
                    ±{Math.round(currentLocation.accuracy)}m accuracy
                  </span>
                )}
              </div>
              <p className="text-gray-600 mt-0.5 truncate">
                {isLocating
                  ? 'Acquiring GPS satellite fix...'
                  : currentLocation?.address || 'GPS coordinates locked'}
              </p>
              {gpsError && (
                <p className="text-[11px] text-amber-700 mt-1 flex items-center">
                  <AlertCircle size={12} className="mr-1 shrink-0" />
                  {gpsError}
                </p>
              )}
            </div>
          </div>

          {/* Vehicle Selection */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
                <Car size={14} className="mr-1.5 text-indigo-600" />
                Vehicle
              </label>
              {!isAddingVehicle && (
                <button
                  type="button"
                  onClick={() => setIsAddingVehicle(true)}
                  className="text-xs text-indigo-600 font-semibold hover:underline flex items-center"
                >
                  <Plus size={12} className="mr-0.5" /> Add
                </button>
              )}
            </div>

            {isAddingVehicle ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. ABC-123"
                  value={newVehicleInput}
                  onChange={(e) => setNewVehicleInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-indigo-300 rounded-xl uppercase font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddNewVehicle}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingVehicle(false)}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <select
                value={selectedVehicle}
                onChange={(e) => handleVehicleChange(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-mono font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {vehicles.length === 0 ? (
                  <option value="">No vehicles configured</option>
                ) : (
                  vehicles.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Starting Odometer */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
                <Gauge size={14} className="mr-1.5 text-indigo-600" />
                Starting Odometer ({distanceUnit})
              </label>
              <span className="text-[10px] text-gray-400">From vehicle history</span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={startOdo}
                onChange={(e) => setStartOdo(e.target.value)}
                placeholder="45200"
                className="w-full px-3 py-2.5 text-base font-mono font-semibold bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 uppercase">
                {distanceUnit}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              GPS will automatically calculate ending odometer when you complete the trip.
            </p>
          </div>

          {/* Trip Type Segmented Button */}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 block">
              Trip Purpose
            </label>
            <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setTripType('work')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center ${
                  tripType === 'work'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Briefcase size={14} className="mr-1.5" />
                Business / Work
              </button>
              <button
                type="button"
                onClick={() => setTripType('personal')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center ${
                  tripType === 'personal'
                    ? 'bg-white text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <User size={14} className="mr-1.5" />
                Personal
              </button>
            </div>
          </div>

          {/* Client & Purpose (Optional) */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Client / Destination Name (optional)
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Corp / Airport"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Trip Notes / Reason (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Client consultation & site survey"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-2 shrink-0">
          <button
            type="button"
            onClick={handleStart}
            className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center justify-center space-x-2"
          >
            <Navigation size={18} />
            <span>Start Live GPS Tracking</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-xs text-gray-500 font-semibold hover:text-gray-700 text-center"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
