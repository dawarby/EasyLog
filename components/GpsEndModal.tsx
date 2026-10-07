import React, { useState, useEffect } from 'react';
import { Check, X, MapPin, Gauge, Clock, Briefcase, User, Car, ArrowRight, Edit3, Sparkles, Zap, Navigation } from 'lucide-react';
import { Trip, LocationPoint } from '../types';
import { formatDuration, reverseGeocode, isPlaceholderAddress } from '../services/gpsService';
import { predictTripTag, TripPrediction } from '../services/predictiveTaggingService';

interface GpsEndModalProps {
  isOpen: boolean;
  trip: Trip;
  trackedDistance: number;
  durationSeconds: number;
  endLocation: LocationPoint | null;
  distanceUnit: 'km' | 'mi';
  allTrips?: Trip[];
  onSave: (completedTrip: Trip) => void;
  onCancel: () => void;
}

export const GpsEndModal: React.FC<GpsEndModalProps> = ({
  isOpen,
  trip,
  trackedDistance,
  durationSeconds,
  endLocation,
  distanceUnit,
  allTrips = [],
  onSave,
  onCancel
}) => {
  // Rounded distance: 1 decimal place or integer
  const roundedDist = Math.max(0.1, Math.round(trackedDistance * 10) / 10);
  const calculatedEndOdo = Math.round(trip.start.value + roundedDist);

  const [endOdo, setEndOdo] = useState<string>(calculatedEndOdo.toString());
  const [distance, setDistance] = useState<string>(roundedDist.toString());
  const [clientName, setClientName] = useState<string>(trip.clientName || '');
  const [notes, setNotes] = useState<string>(trip.notes || '');
  const [tripType, setTripType] = useState<'work' | 'personal'>(trip.tripType || 'work');
  const [isEditingOdo, setIsEditingOdo] = useState<boolean>(false);
  const [startAddress, setStartAddress] = useState<string>(trip.startLocation?.address || trip.start?.location?.address || '');
  const [endAddress, setEndAddress] = useState<string>(endLocation?.address || '');
  const [isEditingAddresses, setIsEditingAddresses] = useState<boolean>(false);
  const [prediction, setPrediction] = useState<TripPrediction | null>(null);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [appliedPrediction, setAppliedPrediction] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Resolve start address if it was missing or still placeholder
    const currentStart = trip.startLocation?.address || trip.start?.location?.address || '';
    const startLat = trip.startLocation?.latitude || trip.start?.location?.latitude;
    const startLon = trip.startLocation?.longitude || trip.start?.location?.longitude;

    if (isPlaceholderAddress(currentStart) && startLat && startLon && startLat !== 0 && startLon !== 0) {
      reverseGeocode(startLat, startLon).then((addr) => {
        if (addr && !isPlaceholderAddress(addr)) {
          setStartAddress(addr);
        }
      });
    } else if (currentStart) {
      setStartAddress(currentStart);
    }

    // 2. Resolve end address if missing or placeholder
    const currentEnd = endLocation?.address || '';
    if (isPlaceholderAddress(currentEnd) && endLocation?.latitude && endLocation?.longitude && endLocation.latitude !== 0) {
      reverseGeocode(endLocation.latitude, endLocation.longitude).then((addr) => {
        if (addr && !isPlaceholderAddress(addr)) {
          setEndAddress(addr);
        }
      });
    } else if (currentEnd) {
      setEndAddress(currentEnd);
    }

    setIsPredicting(true);
    predictTripTag(
      {
        startAddress: trip.startLocation?.address,
        endAddress: endLocation?.address,
        startLocation: trip.startLocation,
        endLocation: endLocation || undefined,
        distance: roundedDist,
        startTime: trip.start.timestamp,
        vehicle: trip.registrationNumber,
        notes: trip.notes
      },
      allTrips
    ).then((pred) => {
      setPrediction(pred);
      setIsPredicting(false);
      // If trip had no client or notes, auto-suggest prefilled values
      if (!trip.clientName && pred.predictedClient) {
        setClientName(pred.predictedClient);
      }
      if (!trip.notes && pred.predictedReason) {
        setNotes(pred.predictedReason);
      }
      if (pred.predictedTripType) {
        setTripType(pred.predictedTripType);
      }
    });
  }, [isOpen]);

  const handleDistanceChange = (val: string) => {
    setDistance(val);
    const numDist = parseFloat(val);
    if (!isNaN(numDist)) {
      setEndOdo(Math.round(trip.start.value + numDist).toString());
    }
  };

  const handleEndOdoChange = (val: string) => {
    setEndOdo(val);
    const numOdo = parseInt(val, 10);
    if (!isNaN(numOdo) && numOdo >= trip.start.value) {
      setDistance((numOdo - trip.start.value).toString());
    }
  };

  const handleConfirmSave = () => {
    const finalEndOdo = parseInt(endOdo, 10) || calculatedEndOdo;
    const finalDist = parseFloat(distance) || roundedDist;

    const resolvedStartPoint: LocationPoint | undefined = trip.startLocation ? {
      ...trip.startLocation,
      address: startAddress.trim() || trip.startLocation.address
    } : (trip.start?.location ? {
      ...trip.start.location,
      address: startAddress.trim() || trip.start.location.address
    } : undefined);

    const resolvedEndPoint: LocationPoint | undefined = endLocation ? {
      ...endLocation,
      address: endAddress.trim() || endLocation.address
    } : undefined;

    const completed: Trip = {
      ...trip,
      status: 'completed',
      distance: finalDist,
      tripType,
      clientName: clientName.trim(),
      notes: notes.trim(),
      start: {
        ...trip.start,
        location: resolvedStartPoint
      },
      startLocation: resolvedStartPoint,
      end: {
        value: finalEndOdo,
        timestamp: new Date().toISOString(),
        location: resolvedEndPoint
      },
      endLocation: resolvedEndPoint
    };

    onSave(completed);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2">
            <div className="bg-white/20 p-2 rounded-xl">
              <Check size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Trip Completed</h2>
              <p className="text-xs text-emerald-100">Review GPS tracking summary</p>
            </div>
          </div>
          <button 
            onClick={onCancel} 
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Highlight Distance & Duration Banner */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
              GPS Distance Tracked
            </span>
            <div className="text-4xl font-extrabold text-emerald-700 font-mono tracking-tight">
              {distance}{' '}
              <span className="text-lg font-bold text-emerald-600 uppercase font-sans">
                {distanceUnit}
              </span>
            </div>
            <div className="flex justify-center items-center gap-4 mt-2 text-xs text-emerald-800">
              <span className="flex items-center">
                <Clock size={13} className="mr-1 opacity-70" />
                {formatDuration(durationSeconds)}
              </span>
              <span className="text-emerald-300">•</span>
              <span className="font-medium">
                {trip.registrationNumber || 'Vehicle'}
              </span>
            </div>
          </div>

          {/* Odometer Calculation Card */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
                <Gauge size={14} className="mr-1.5 text-indigo-600" />
                Odometer Calculation
              </span>
              <button
                type="button"
                onClick={() => setIsEditingOdo(!isEditingOdo)}
                className="text-[11px] text-indigo-600 font-medium hover:underline flex items-center"
              >
                <Edit3 size={11} className="mr-1" />
                {isEditingOdo ? 'Done' : 'Adjust'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                <div className="text-[10px] text-gray-400 uppercase font-semibold">Start</div>
                <div className="text-base font-mono font-bold text-gray-800">
                  {trip.start.value.toLocaleString()}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-indigo-200 shadow-xs">
                <div className="text-[10px] text-indigo-600 uppercase font-bold">Finish (Auto)</div>
                {isEditingOdo ? (
                  <input
                    type="number"
                    value={endOdo}
                    onChange={(e) => handleEndOdoChange(e.target.value)}
                    className="w-full text-center font-mono font-bold text-base border-b border-indigo-500 outline-none text-indigo-700 bg-transparent"
                    autoFocus
                  />
                ) : (
                  <div className="text-base font-mono font-bold text-indigo-700">
                    {parseInt(endOdo, 10).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Route Locations */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
                <MapPin size={14} className="mr-1.5 text-emerald-600" />
                Route Addresses
              </span>
              <button
                type="button"
                onClick={() => setIsEditingAddresses(!isEditingAddresses)}
                className="text-[11px] text-indigo-600 font-medium hover:underline flex items-center"
              >
                <Edit3 size={11} className="mr-1" />
                {isEditingAddresses ? 'Done' : 'Edit'}
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-start space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">Started at</div>
                  {isEditingAddresses ? (
                    <input
                      type="text"
                      value={startAddress}
                      onChange={(e) => setStartAddress(e.target.value)}
                      placeholder="Start address..."
                      className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  ) : (
                    <div className="text-gray-800 font-medium truncate">
                      {startAddress || trip.startLocation?.address || 'Start Location'}
                    </div>
                  )}
                </div>
              </div>
              <div className="w-0.5 h-3 bg-gray-300 ml-1" />
              <div className="flex items-start space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1 shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">Finished at</div>
                  {isEditingAddresses ? (
                    <input
                      type="text"
                      value={endAddress}
                      onChange={(e) => setEndAddress(e.target.value)}
                      placeholder="Destination address..."
                      className="w-full mt-0.5 px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  ) : (
                    <div className="text-gray-800 font-medium truncate">
                      {endAddress || endLocation?.address || 'Current Destination'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* AI Predictive Tagging Banner */}
          {prediction && (
            <div className="bg-gradient-to-r from-purple-50 via-indigo-50/70 to-blue-50 border border-indigo-200/80 rounded-xl p-3 space-y-1.5 text-xs animate-fade-in shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-950 flex items-center text-[11px]">
                  <Sparkles size={12} className="mr-1.5 text-indigo-600" />
                  AI Suggested Classification
                </span>
                <span className="text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-full border border-indigo-100">
                  {prediction.confidence}% Match
                </span>
              </div>
              <div className="text-[11px] text-gray-700 leading-snug">
                <span>Predicted: </span>
                <strong className={`uppercase ${prediction.predictedTripType === 'personal' ? 'text-emerald-700' : 'text-indigo-700'}`}>
                  {prediction.predictedTripType}
                </strong>
                {prediction.predictedClient && <span> • Client: <strong>{prediction.predictedClient}</strong></span>}
                {prediction.predictedCategory && <span> • {prediction.predictedCategory}</span>}
              </div>
              <p className="text-[10px] text-gray-500 italic">
                {prediction.explanation}
              </p>
            </div>
          )}

          {/* Purpose & Notes */}
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                  Trip Purpose
                </label>
                {(prediction?.tags?.includes('ATO Commute') || prediction?.tags?.includes('Home')) && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    🏠 Home Commute: Personal
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTripType('work')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition ${
                    tripType === 'work' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  <Briefcase size={12} className="inline mr-1" /> Business
                </button>
                <button
                  type="button"
                  onClick={() => setTripType('personal')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition ${
                    tripType === 'personal' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  <User size={12} className="inline mr-1" /> Personal
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Client / Destination Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Trip Notes / Reason
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Client visit and site inspection"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-2 shrink-0">
          <button
            type="button"
            onClick={handleConfirmSave}
            className="w-full py-3.5 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition flex items-center justify-center space-x-2"
          >
            <Check size={18} />
            <span>Save to Logbook</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 text-xs text-gray-500 font-semibold hover:text-gray-700 text-center"
          >
            Resume Driving
          </button>
        </div>
      </div>
    </div>
  );
};
