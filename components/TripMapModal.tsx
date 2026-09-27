import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  X,
  MapPin,
  Navigation,
  Sparkles,
  Check,
  Layers,
  Car,
  Clock,
  Calendar,
  Briefcase,
  User,
  Zap,
  Tag,
  Share2,
  Maximize2
} from 'lucide-react';
import { Trip, LocationPoint } from '../types';
import { predictTripTag, TripPrediction } from '../services/predictiveTaggingService';
import { formatDuration } from '../services/gpsService';

// Monkeypatch Leaflet DomUtil.getPosition to prevent "Cannot read properties of undefined (reading '_leaflet_pos')"
// when map elements are detached, animated, or cleaned up.
if (typeof window !== 'undefined' && L && L.DomUtil && !((L.DomUtil as any)._safeGetPositionPatched)) {
  const origGetPos = L.DomUtil.getPosition;
  L.DomUtil.getPosition = function (el: HTMLElement) {
    if (!el) {
      return new L.Point(0, 0);
    }
    try {
      return origGetPos.call(this, el) || new L.Point(0, 0);
    } catch {
      return new L.Point(0, 0);
    }
  };
  (L.DomUtil as any)._safeGetPositionPatched = true;
}

interface TripMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  allTrips?: Trip[];
  distanceUnit?: 'km' | 'mi';
  onUpdateTrip?: (updatedTrip: Trip) => void;
  showNotification?: (msg: string, type?: 'success' | 'error') => void;
}

export const TripMapModal: React.FC<TripMapModalProps> = ({
  isOpen,
  onClose,
  trip,
  allTrips = [],
  distanceUnit = 'km',
  onUpdateTrip,
  showNotification
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const resizeTimerRef = useRef<any>(null);

  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite' | 'dark'>('streets');
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [prediction, setPrediction] = useState<TripPrediction | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [appliedPrediction, setAppliedPrediction] = useState(false);

  // Run AI Predictive Tagging on trip load
  useEffect(() => {
    if (!trip || !isOpen) return;
    let isCancelled = false;
    setAppliedPrediction(false);
    setIsPredicting(true);

    predictTripTag(
      {
        startAddress: trip.startLocation?.address,
        endAddress: trip.endLocation?.address,
        distance: trip.distance || 0,
        startTime: trip.start.timestamp,
        vehicle: trip.registrationNumber,
        notes: trip.notes
      },
      allTrips
    ).then((pred) => {
      if (!isCancelled) {
        setPrediction(pred);
        setIsPredicting(false);
      }
    }).catch(() => {
      if (!isCancelled) {
        setIsPredicting(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [trip?.id, isOpen]);

  // Map Initialization & Destruction based on modal open state
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    const container = mapContainerRef.current;

    // Clean up any stale leaflet attributes on the container
    if ((container as any)._leaflet_id && !mapInstanceRef.current) {
      delete (container as any)._leaflet_id;
    }

    const startLat = trip?.startLocation?.latitude || trip?.start?.location?.latitude;
    const startLon = trip?.startLocation?.longitude || trip?.start?.location?.longitude;
    const endLat = trip?.endLocation?.latitude || trip?.end?.location?.latitude;
    const endLon = trip?.endLocation?.longitude || trip?.end?.location?.longitude;

    const initialCenter: [number, number] = [
      startLat || endLat || -33.8688,
      startLon || endLon || 151.2093
    ];

    let map = mapInstanceRef.current;
    if (!map) {
      map = L.map(container, {
        center: initialCenter,
        zoom: 13,
        zoomControl: false
      });
      mapInstanceRef.current = map;

      // Add zoom control
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Create Layer Group for markers/routes
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
    }

    // Delayed size invalidation with safety checks
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = setTimeout(() => {
      if (mapInstanceRef.current && (mapInstanceRef.current as any)._container) {
        try {
          mapInstanceRef.current.invalidateSize({ animate: false });
        } catch {
          // ignore
        }
      }
    }, 250);

    return () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, [isOpen]);

  // Update Tile Layer when mapLayer changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; OpenStreetMap contributors';

    if (mapLayer === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; Esri World Imagery';
    } else if (mapLayer === 'dark') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; CartoDB Dark';
    }

    const newTileLayer = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19
    }).addTo(map);
    tileLayerRef.current = newTileLayer;
  }, [mapLayer, isOpen]);

  // Update markers and routes when trip, viewMode, or allTrips change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer || !trip || !isOpen) return;

    markersLayer.clearLayers();

    // Custom Icon Generator
    const createPin = (color: string, label: string) => {
      return L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div style="
            background: ${color};
            color: white;
            font-size: 11px;
            font-weight: bold;
            padding: 4px 8px;
            border-radius: 9999px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 2px solid white;
            display: flex;
            align-items: center;
            white-space: nowrap;
          ">
            ${label}
          </div>
        `,
        iconSize: [60, 30],
        iconAnchor: [30, 15]
      });
    };

    const startLat = trip.startLocation?.latitude || trip.start?.location?.latitude;
    const startLon = trip.startLocation?.longitude || trip.start?.location?.longitude;
    const endLat = trip.endLocation?.latitude || trip.end?.location?.latitude;
    const endLon = trip.endLocation?.longitude || trip.end?.location?.longitude;

    if (viewMode === 'single') {
      const boundsCoords: [number, number][] = [];

      // Start Marker
      if (startLat && startLon) {
        boundsCoords.push([startLat, startLon]);
        L.marker([startLat, startLon], {
          icon: createPin('#10b981', '🟢 Start')
        })
          .addTo(markersLayer)
          .bindPopup(`<b>Trip Start</b><br>${trip.startLocation?.address || 'Start Location'}<br>Odo: ${trip.start.value} ${distanceUnit}`);
      }

      // End Marker
      if (endLat && endLon) {
        boundsCoords.push([endLat, endLon]);
        L.marker([endLat, endLon], {
          icon: createPin('#f43f5e', '🔴 Destination')
        })
          .addTo(markersLayer)
          .bindPopup(`<b>Destination</b><br>${trip.endLocation?.address || 'End Location'}<br>Odo: ${trip.end?.value || 'N/A'} ${distanceUnit}`);
      }

      // Draw Route Polyline
      if (trip.routeCoordinates && trip.routeCoordinates.length > 1) {
        L.polyline(trip.routeCoordinates, {
          color: '#4f46e5',
          weight: 5,
          opacity: 0.85,
          smoothFactor: 1
        }).addTo(markersLayer);

        trip.routeCoordinates.forEach(coord => boundsCoords.push(coord));
      } else if (startLat && startLon && endLat && endLon) {
        // Direct route representation
        L.polyline([[startLat, startLon], [endLat, endLon]], {
          color: '#6366f1',
          weight: 4,
          dashArray: '6, 8',
          opacity: 0.8
        }).addTo(markersLayer);
      }

      if (boundsCoords.length > 0) {
        try {
          map.fitBounds(L.latLngBounds(boundsCoords), {
            padding: [50, 50],
            maxZoom: 15,
            animate: false
          });
        } catch {
          // ignore bounds errors
        }
      }
    } else {
      // "All Trips" mode - show multi-trip territory
      const allBounds: [number, number][] = [];
      allTrips.forEach((t) => {
        const sLat = t.startLocation?.latitude || t.start?.location?.latitude;
        const sLon = t.startLocation?.longitude || t.start?.location?.longitude;
        const eLat = t.endLocation?.latitude || t.end?.location?.latitude;
        const eLon = t.endLocation?.longitude || t.end?.location?.longitude;

        if (sLat && sLon) {
          allBounds.push([sLat, sLon]);
          L.circleMarker([sLat, sLon], {
            radius: 6,
            color: t.tripType === 'personal' ? '#10b981' : '#4f46e5',
            fillColor: t.tripType === 'personal' ? '#34d399' : '#818cf8',
            fillOpacity: 0.8
          }).addTo(markersLayer).bindPopup(`<b>${(t.tripType || 'work').toUpperCase()} Trip</b><br>${t.startLocation?.address || ''}<br>${t.distance || 0} ${distanceUnit}`);
        }

        if (eLat && eLon) {
          allBounds.push([eLat, eLon]);
          L.circleMarker([eLat, eLon], {
            radius: 6,
            color: '#f43f5e',
            fillColor: '#fb7185',
            fillOpacity: 0.8
          }).addTo(markersLayer).bindPopup(`<b>${t.clientName || 'Destination'}</b><br>${t.endLocation?.address || ''}`);
        }
      });

      if (allBounds.length > 0) {
        try {
          map.fitBounds(L.latLngBounds(allBounds), { padding: [40, 40], animate: false });
        } catch {
          // ignore
        }
      }
    }
  }, [isOpen, trip?.id, trip?.tripType, trip?.startLocation, trip?.endLocation, trip?.routeCoordinates, viewMode, allTrips]);

  if (!isOpen || !trip) return null;

  const handleApplyPrediction = () => {
    if (!prediction || !onUpdateTrip || !trip) return;

    const updated: Trip = {
      ...trip,
      tripType: prediction.predictedTripType,
      clientName: prediction.predictedClient || trip.clientName,
      notes: prediction.predictedReason || trip.notes
    };

    onUpdateTrip(updated);
    setAppliedPrediction(true);
    showNotification?.(`Applied AI Tagging: ${prediction.predictedTripType.toUpperCase()} (${prediction.confidence}% confidence)`, 'success');
  };

  const handleQuickTag = (type: 'work' | 'personal', customTag?: string) => {
    if (!onUpdateTrip || !trip) return;
    const updated: Trip = {
      ...trip,
      tripType: type,
      notes: customTag ? (trip.notes ? `${trip.notes} • ${customTag}` : customTag) : trip.notes
    };
    onUpdateTrip(updated);
    showNotification?.(`Tagged trip as ${type.toUpperCase()}`, 'success');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col border border-gray-100">
        
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-gray-900 via-indigo-950 to-indigo-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Navigation size={18} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold leading-tight">
                  Trip Route Map
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  trip.tripType === 'personal'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                }`}>
                  {trip.tripType || 'work'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {new Date(trip.start.timestamp).toLocaleDateString()} • {trip.registrationNumber || 'Vehicle'} • {trip.distance || 0} {distanceUnit}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex bg-black/40 rounded-xl p-0.5 border border-white/10 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  viewMode === 'single' ? 'bg-indigo-600 text-white font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Route
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  viewMode === 'all' ? 'bg-indigo-600 text-white font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                All Trips
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Map Container Area */}
        <div className="relative h-72 sm:h-80 w-full bg-gray-100 shrink-0">
          <div ref={mapContainerRef} className="h-full w-full z-0" />

          {/* Map Layer Switcher Floating Pill */}
          <div className="absolute bottom-3 left-3 z-10 flex bg-white/90 backdrop-blur-md rounded-xl p-0.5 shadow-md border border-gray-200 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setMapLayer('streets')}
              className={`px-2.5 py-1 rounded-lg transition ${
                mapLayer === 'streets' ? 'bg-gray-900 text-white font-semibold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Streets
            </button>
            <button
              type="button"
              onClick={() => setMapLayer('satellite')}
              className={`px-2.5 py-1 rounded-lg transition ${
                mapLayer === 'satellite' ? 'bg-gray-900 text-white font-semibold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setMapLayer('dark')}
              className={`px-2.5 py-1 rounded-lg transition ${
                mapLayer === 'dark' ? 'bg-gray-900 text-white font-semibold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dark
            </button>
          </div>

          {/* Quick Distance Floating Badge */}
          <div className="absolute top-3 left-3 z-10 bg-black/75 backdrop-blur-md text-white px-3 py-1.5 rounded-xl shadow-lg border border-white/10 text-xs font-mono flex items-center space-x-1.5">
            <span className="text-emerald-400 font-bold text-sm">
              {trip.distance || 0}
            </span>
            <span className="text-gray-300 font-sans uppercase text-[10px]">
              {distanceUnit}
            </span>
          </div>
        </div>

        {/* Predictive Tagging & Trip Details Section */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs text-gray-700">
          
          {/* AI Predictive Tagging Card */}
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50/70 to-blue-50 border border-indigo-100 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-900 font-bold text-xs">
                <div className="p-1 bg-indigo-600 text-white rounded-lg">
                  <Sparkles size={14} className="animate-spin-slow" />
                </div>
                <span>AI Predictive Tagging</span>
              </div>

              {prediction && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                  {prediction.confidence}% Confidence
                </span>
              )}
            </div>

            {isPredicting ? (
              <div className="flex items-center space-x-2 text-gray-500 py-1">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping"></span>
                <span>Analyzing route patterns and destination history...</span>
              </div>
            ) : prediction ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-600 font-medium">Suggested Purpose:</span>
                  <span className={`font-bold px-2.5 py-0.5 rounded-lg uppercase text-xs flex items-center ${
                    prediction.predictedTripType === 'personal'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  }`}>
                    {prediction.predictedTripType === 'personal' ? (
                      <User size={12} className="mr-1" />
                    ) : (
                      <Briefcase size={12} className="mr-1" />
                    )}
                    {prediction.predictedTripType}
                  </span>

                  {prediction.predictedClient && (
                    <span className="font-semibold text-gray-800 bg-white px-2 py-0.5 rounded-lg border border-indigo-100 flex items-center">
                      <Briefcase size={11} className="mr-1 text-gray-400" />
                      Client: {prediction.predictedClient}
                    </span>
                  )}

                  {prediction.predictedCategory && (
                    <span className="text-gray-600 bg-white/70 px-2 py-0.5 rounded-lg border border-gray-200">
                      {prediction.predictedCategory}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-600 leading-snug">
                  💡 <em>{prediction.explanation}</em>
                </p>

                {/* 1-Tap Apply Prediction Button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {prediction.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleQuickTag(prediction.predictedTripType, tag)}
                        className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[10px] font-medium transition"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={appliedPrediction}
                    onClick={handleApplyPrediction}
                    className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-sm transition ${
                      appliedPrediction
                        ? 'bg-emerald-600 text-white cursor-default'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                    }`}
                  >
                    {appliedPrediction ? (
                      <>
                        <Check size={13} />
                        <span>Applied!</span>
                      </>
                    ) : (
                      <>
                        <Zap size={13} className="fill-current" />
                        <span>Apply AI Tag</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Start & End Address Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Start Location Card */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-1">
              <div className="flex items-center text-emerald-700 font-bold text-[11px]">
                <MapPin size={13} className="mr-1" />
                Start Location
              </div>
              <p className="text-gray-900 font-medium truncate text-xs">
                {trip.startLocation?.address || 'Start Coordinates Logged'}
              </p>
              <div className="text-[10px] text-gray-500 font-mono">
                Odometer: {trip.start.value.toLocaleString()} {distanceUnit}
              </div>
            </div>

            {/* Destination Card */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-1">
              <div className="flex items-center text-rose-700 font-bold text-[11px]">
                <MapPin size={13} className="mr-1" />
                Destination / End Location
              </div>
              <p className="text-gray-900 font-medium truncate text-xs">
                {trip.endLocation?.address || 'Destination Coordinates Logged'}
              </p>
              <div className="text-[10px] text-gray-500 font-mono">
                Odometer: {trip.end ? `${trip.end.value.toLocaleString()} ${distanceUnit}` : 'In progress'}
              </div>
            </div>
          </div>

          {/* Manual Quick Tagging Shortcuts */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-semibold text-gray-500">Quick Change:</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleQuickTag('work')}
                className={`px-3 py-1 rounded-xl font-semibold text-xs border transition ${
                  trip.tripType === 'work'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Work
              </button>
              <button
                type="button"
                onClick={() => handleQuickTag('personal')}
                className={`px-3 py-1 rounded-xl font-semibold text-xs border transition ${
                  trip.tripType === 'personal'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Personal
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
