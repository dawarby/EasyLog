import React, { useState, useEffect } from 'react';
import { Navigation, Square, Clock, Gauge, MapPin, Sun, AlertCircle, X, User, Briefcase, Car, ShieldCheck, Bluetooth } from 'lucide-react';
import { Trip, LocationPoint } from '../types';
import { formatDuration } from '../services/gpsService';

interface GpsDriveHudProps {
  trip: Trip;
  currentSpeed: number; // in km/h or mph
  trackedDistance: number;
  durationSeconds: number;
  currentLocation: LocationPoint | null;
  gpsAccuracy: number | null;
  isWakeLockActive: boolean;
  distanceUnit: 'km' | 'mi';
  isStationary: boolean;
  onEndTrip: () => void;
  onAbortTrip: () => void;
  onOpenMap?: () => void;
}

export const GpsDriveHud: React.FC<GpsDriveHudProps> = ({
  trip,
  currentSpeed,
  trackedDistance,
  durationSeconds,
  currentLocation,
  gpsAccuracy,
  isWakeLockActive,
  distanceUnit,
  isStationary,
  onEndTrip,
  onAbortTrip,
  onOpenMap
}) => {
  const displayDist = (Math.round(trackedDistance * 10) / 10).toFixed(1);
  const displaySpeed = Math.round(currentSpeed);
  const speedUnit = distanceUnit === 'mi' ? 'mph' : 'km/h';

  return (
    <div className="relative bg-gradient-to-b from-gray-900 via-gray-900 to-indigo-950 text-white rounded-3xl shadow-xl overflow-hidden border border-indigo-900/60 p-5 space-y-5">
      {/* Top Bar: Discard, Satellite Status, Screen Wake */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold tracking-wide text-emerald-400 uppercase">
            Live GPS Tracking
          </span>
          {gpsAccuracy !== null && (
            <span className="text-[10px] text-gray-400 font-mono">
              ±{Math.round(gpsAccuracy)}m
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {isWakeLockActive && (
            <span
              className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center"
              title="Screen stays on while driving"
            >
              <Sun size={11} className="mr-1 text-amber-400" />
              Awake
            </span>
          )}
          <button
            onClick={onAbortTrip}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-full transition"
            title="Discard Trip"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Distance HUD */}
      <div className="text-center py-2">
        <div className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">
          Distance Travelled
        </div>
        <div className="flex items-baseline justify-center space-x-2">
          <span className="text-5xl font-black font-mono tracking-tight text-white drop-shadow-md">
            {displayDist}
          </span>
          <span className="text-xl font-bold uppercase text-indigo-400">
            {distanceUnit}
          </span>
        </div>
      </div>

      {/* Speed & Duration Metrics Dashboard */}
      <div className="grid grid-cols-2 gap-3 bg-black/30 backdrop-blur-md rounded-2xl p-3 border border-white/5">
        {/* Live Speed */}
        <div className="flex items-center space-x-3 px-2">
          <div className={`p-2.5 rounded-xl ${displaySpeed > 5 ? 'bg-indigo-600/30 text-indigo-300' : 'bg-gray-800 text-gray-400'}`}>
            <Gauge size={22} />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold">Speed</div>
            <div className="text-lg font-mono font-bold text-white flex items-baseline space-x-1">
              <span>{displaySpeed}</span>
              <span className="text-xs text-gray-400 font-sans">{speedUnit}</span>
            </div>
          </div>
        </div>

        {/* Elapsed Duration */}
        <div className="flex items-center space-x-3 px-2 border-l border-white/10">
          <div className="p-2.5 rounded-xl bg-purple-600/30 text-purple-300">
            <Clock size={22} />
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold">Duration</div>
            <div className="text-lg font-mono font-bold text-white">
              {formatDuration(durationSeconds)}
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle & Trip Details Chips */}
      <div className="flex flex-wrap items-center gap-2">
        {trip.tripType && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center ${
            trip.tripType === 'personal'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
              : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800'
          }`}>
            {trip.tripType === 'personal' ? <User size={12} className="mr-1.5" /> : <Briefcase size={12} className="mr-1.5" />}
            {trip.tripType === 'personal' ? 'Personal' : 'Work'}
          </span>
        )}

        {trip.registrationNumber && (
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-gray-800 text-gray-200 border border-gray-700 flex items-center">
            <Car size={12} className="mr-1.5 text-gray-400" />
            {trip.registrationNumber}
          </span>
        )}

        {trip.triggerSource === 'bluetooth' && (
          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-blue-950/90 text-blue-300 border border-blue-700 flex items-center shadow-xs">
            <Bluetooth size={12} className="mr-1 text-blue-400 animate-pulse" />
            Car BT
          </span>
        )}

        <span className="text-xs font-mono text-gray-300 bg-gray-800/80 px-2.5 py-1 rounded-lg border border-gray-700 ml-auto">
          Start Odo: {trip.start.value.toLocaleString()} {distanceUnit}
        </span>
      </div>

      {/* Current Location Road / Destination with Map View button */}
      <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex items-center justify-between">
        <div className="flex items-start text-xs text-gray-300 overflow-hidden pr-2">
          <MapPin size={14} className="mr-2 text-indigo-400 shrink-0 mt-0.5" />
          <div className="overflow-hidden">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">
              Current Location
            </span>
            <p className="truncate font-medium text-white">
              {currentLocation?.address || 'Tracking GPS route...'}
            </p>
          </div>
        </div>

        {onOpenMap && (
          <button
            type="button"
            onClick={onOpenMap}
            className="px-2.5 py-1.5 bg-indigo-600/50 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 hover:text-white rounded-xl text-xs font-semibold flex items-center space-x-1 shrink-0 transition"
          >
            <Navigation size={12} />
            <span>Map</span>
          </button>
        )}
      </div>

      {/* Stationary Reminder Notice */}
      {isStationary && durationSeconds > 120 && (
        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 flex items-center space-x-2.5 text-amber-200 text-xs animate-pulse">
          <AlertCircle size={16} className="text-amber-400 shrink-0" />
          <span>Vehicle appears stopped. Tap End Trip when you have arrived.</span>
        </div>
      )}

      {/* End Trip Button */}
      <button
        type="button"
        onClick={onEndTrip}
        className="w-full py-4 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold rounded-2xl shadow-lg shadow-red-900/50 flex items-center justify-center space-x-2 text-base transition-all active:scale-[0.99]"
      >
        <Square size={20} className="fill-current" />
        <span>End Trip & Save Logbook</span>
      </button>
    </div>
  );
};
