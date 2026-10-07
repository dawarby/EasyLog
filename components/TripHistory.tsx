import React, { useMemo } from 'react';
import { Trip } from '../types';
import { Calendar, Download, FileText, Briefcase, Plus, Pencil, User, XCircle, Filter, Car, Calculator, History, Navigation, MapPin, Bluetooth, Clock, FileCheck, Gauge } from 'lucide-react';

interface TripHistoryProps {
  trips: Trip[];
  onExport: () => void;
  onEdit: (trip: Trip) => void;
  onAddManual: () => void;
  filterType: 'all' | 'work' | 'personal' | 'unverified';
  onFilterTypeChange: (type: 'all' | 'work' | 'personal' | 'unverified') => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;
  vehicles: string[];
  filterRego: string;
  onFilterRegoChange: (reg: string) => void;
  distanceUnit?: 'km' | 'mi';
  onViewMap?: (trip: Trip) => void;
  onViewAllMap?: () => void;
  onOpenVerificationQueue?: () => void;
}

export const TripHistory: React.FC<TripHistoryProps> = ({ 
  trips, 
  onExport, 
  onEdit, 
  onAddManual,
  filterType,
  onFilterTypeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  vehicles,
  filterRego,
  onFilterRegoChange,
  distanceUnit = 'km',
  onViewMap,
  onViewAllMap,
  onOpenVerificationQueue
}) => {
  
  // Combine configured vehicles with those found in history
  const allVehicles = useMemo(() => {
    const historyVehicles = trips
      .map(t => t.registrationNumber)
      .filter((r): r is string => !!r && r.trim() !== '');
    
    return Array.from(new Set([...vehicles, ...historyVehicles])).sort();
  }, [trips, vehicles]);

  // First Level Filter: Date & Rego (Used for Stats Calculation)
  // We calculate stats BEFORE filtering by 'Type' so we see the correct Business % vs Total
  const dateRangeTrips = useMemo(() => {
    return trips.filter(trip => {
       // Filter by Rego
       if (filterRego && trip.registrationNumber !== filterRego) return false;

       // Filter by Date Range
       if (!startDate && !endDate) return true;
       const tripDate = new Date(trip.start.timestamp);
       if (startDate) {
         const start = new Date(startDate);
         start.setHours(0, 0, 0, 0);
         if (tripDate < start) return false;
       }
       if (endDate) {
         const end = new Date(endDate);
         end.setHours(23, 59, 59, 999);
         if (tripDate > end) return false;
       }
       return true;
    });
  }, [trips, filterRego, startDate, endDate]);

  // Calculate ATO Stats based on Date Range
  const stats = useMemo(() => {
    const totalDist = dateRangeTrips.reduce((acc, t) => acc + (t.distance || 0), 0);
    const workDist = dateRangeTrips
      .filter(t => (t.tripType || 'work') === 'work')
      .reduce((acc, t) => acc + (t.distance || 0), 0);
    
    const businessPercent = totalDist > 0 ? (workDist / totalDist) * 100 : 0;
    const totalTrips = dateRangeTrips.length;
    const pendingCount = dateRangeTrips.filter(t => t.verificationStatus === 'pending').length;
    const pendingDist = dateRangeTrips
      .filter(t => t.verificationStatus === 'pending')
      .reduce((acc, t) => acc + (t.distance || 0), 0);
    
    return { totalDist, workDist, businessPercent, totalTrips, pendingCount, pendingDist };
  }, [dateRangeTrips]);

  // Second Level Filter: Type (for display list)
  const displayTrips = dateRangeTrips.filter(trip => {
    if (filterType === 'unverified') return trip.verificationStatus === 'pending';
    return filterType === 'all' || (trip.tripType || 'work') === filterType;
  });

  // Sort by newest first
  const sortedTrips = [...displayTrips].sort((a, b) => 
    new Date(b.start.timestamp).getTime() - new Date(a.start.timestamp).getTime()
  );

  const clearDates = () => {
    onStartDateChange('');
    onEndDateChange('');
  };

  const clearAllFilters = () => {
    onFilterTypeChange('all');
    onFilterRegoChange('');
    clearDates();
  };

  const unitLabel = distanceUnit === 'km' ? 'Km' : 'Mi';

  // Detect Device Locale
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  
  // Helper to format YYYY-MM-DD input strings to Local Display Date
  const formatRangeDate = (d: string) => {
    if(!d) return '';
    const [y, m, dNum] = d.split('-').map(Number);
    return new Date(y, m-1, dNum).toLocaleDateString(locale);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        {/* Header and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <h3 className="text-lg font-semibold text-gray-800">Trip History</h3>
          <div className="flex flex-wrap gap-2">
            {onOpenVerificationQueue && (
              <button
                type="button"
                onClick={onOpenVerificationQueue}
                className={`flex items-center text-sm font-medium transition-colors px-3 py-1.5 rounded-lg border shadow-xs ${
                  stats.pendingCount > 0 
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 font-bold' 
                    : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                }`}
                title="Review uncommitted trips before final logbook commit"
              >
                <FileCheck size={14} className="mr-1.5" />
                <span>Verification ({stats.pendingCount})</span>
              </button>
            )}
            {onViewAllMap && (
              <button
                type="button"
                onClick={onViewAllMap}
                disabled={trips.length === 0}
                className="flex items-center text-sm text-emerald-700 hover:text-emerald-800 font-medium transition-colors bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-xs"
              >
                <Navigation size={14} className="mr-1.5 text-emerald-600" />
                Map View
              </button>
            )}
            <button 
              onClick={onAddManual}
              className="flex items-center text-sm text-gray-700 hover:text-indigo-600 font-medium transition-colors bg-white border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg shadow-sm"
            >
              <Plus size={14} className="mr-1.5" />
              Add Trip
            </button>
            <button 
              onClick={onExport}
              disabled={displayTrips.length === 0}
              className="flex items-center text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg"
            >
              <Download size={14} className="mr-1.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* ATO Logbook Calculator Card */}
        {startDate && endDate && (
           <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4 text-white shadow-lg border border-gray-700">
              <div className="flex items-center justify-between mb-3 border-b border-gray-700 pb-2">
                 <div className="flex items-center text-sm font-semibold text-gray-300">
                    <Calculator size={16} className="mr-2 text-green-400" />
                    Logbook Summary
                 </div>
                 <div className="flex items-center space-x-2">
                    {stats.pendingCount > 0 && onOpenVerificationQueue && (
                      <button
                        type="button"
                        onClick={onOpenVerificationQueue}
                        className="text-[10px] bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 px-2 py-0.5 rounded-full font-bold transition flex items-center"
                        title="Trips requiring verification"
                      >
                        ● {stats.pendingCount} unverified
                      </button>
                    )}
                    <div className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
                       {formatRangeDate(startDate)} - {formatRangeDate(endDate)}
                    </div>
                 </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center divide-x divide-gray-700">
                 <div>
                    <div className="text-xl font-bold">{stats.totalTrips}</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Trips</div>
                 </div>
                 <div>
                    <div className="text-xl font-bold">{stats.totalDist.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Total {unitLabel}</div>
                 </div>
                 <div>
                    <div className="text-xl font-bold text-indigo-400">{stats.workDist.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Work {unitLabel}</div>
                 </div>
                 <div>
                    <div className="text-xl font-bold text-green-400">{stats.businessPercent.toFixed(0)}%</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Biz Use</div>
                 </div>
              </div>

              {/* Live Calculation Note for Unverified Queue */}
              {stats.pendingCount > 0 && (
                <div className="mt-3 pt-2.5 border-t border-gray-700/80 flex items-center justify-between text-[11px] text-amber-300/95">
                  <div className="flex items-center space-x-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
                    <span>Live total includes <strong>{stats.pendingCount} unverified trip{stats.pendingCount === 1 ? '' : 's'}</strong> ({stats.pendingDist.toLocaleString()} {unitLabel})</span>
                  </div>
                  {onOpenVerificationQueue && (
                    <button
                      type="button"
                      onClick={onOpenVerificationQueue}
                      className="font-bold underline text-amber-200 hover:text-white transition shrink-0 ml-2"
                    >
                      Review Queue →
                    </button>
                  )}
                </div>
              )}
           </div>
        )}

        {/* Unified Filter Section */}
        <div className="bg-white border border-gray-200 p-3 rounded-xl shadow-sm flex flex-col gap-3">
            <div className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                <Filter size={12} className="mr-1.5" />
                Filters
            </div>
            
            <div className="flex flex-col md:flex-row gap-3">
                {/* Type Filter */}
                <div className="flex p-1 bg-gray-100 rounded-lg shrink-0 overflow-x-auto gap-0.5">
                  <button 
                      onClick={() => onFilterTypeChange('all')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                        filterType === 'all' 
                          ? 'bg-white text-gray-800 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                      All
                  </button>
                  {stats.pendingCount > 0 && (
                    <button 
                        onClick={() => onFilterTypeChange('unverified')}
                        className={`px-2.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center space-x-1 ${
                          filterType === 'unverified' 
                            ? 'bg-amber-500 text-white shadow-sm' 
                            : 'text-amber-800 bg-amber-100 hover:bg-amber-200'
                        }`}
                        title="View trips requiring verification"
                    >
                        <Clock size={11} />
                        <span>Needs Review ({stats.pendingCount})</span>
                    </button>
                  )}
                  <button 
                      onClick={() => onFilterTypeChange('work')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center ${
                        filterType === 'work' 
                          ? 'bg-white text-indigo-600 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                      <Briefcase size={12} className="mr-1.5" />
                      Work
                  </button>
                  <button 
                      onClick={() => onFilterTypeChange('personal')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center ${
                        filterType === 'personal' 
                          ? 'bg-white text-green-600 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                      <User size={12} className="mr-1.5" />
                      Personal
                  </button>
                </div>

                {/* Rego Filter */}
                <div className="relative shrink-0 md:min-w-[140px]">
                   <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <Car size={14} />
                   </div>
                   <select
                      value={filterRego}
                      onChange={(e) => onFilterRegoChange(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-indigo-500 outline-none h-full appearance-none font-medium"
                   >
                      <option value="">All Vehicles</option>
                      {allVehicles.map(v => (
                         <option key={v} value={v}>{v}</option>
                      ))}
                   </select>
                </div>

                {/* Date Filter */}
                <div className="flex items-center gap-2 grow overflow-x-auto">
                    <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => onStartDateChange(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-indigo-500 outline-none w-full sm:w-auto"
                        placeholder="Start Date"
                    />
                    <span className="text-gray-400 font-light">-</span>
                    <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => onEndDateChange(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-indigo-500 outline-none w-full sm:w-auto"
                        placeholder="End Date"
                    />
                    {(startDate || endDate || filterType !== 'all' || filterRego) && (
                        <button 
                            onClick={clearAllFilters}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            title="Clear All Filters"
                        >
                            <XCircle size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* Empty State for No Trips at all (when no filter is applied) */}
      {trips.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
          <FileText size={48} className="mb-4 opacity-20" />
          <p>No completed trips yet.</p>
          <button onClick={onAddManual} className="mt-4 text-indigo-600 text-sm font-semibold hover:underline">
            Add a trip manually
          </button>
        </div>
      )}

      {/* Empty State for No Matches in Filter */}
      {trips.length > 0 && displayTrips.length === 0 && (
         <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
          <Filter size={32} className="mb-3 opacity-20" />
          <p className="text-sm">No trips found matching filters.</p>
          <button onClick={clearAllFilters} className="mt-2 text-indigo-600 text-xs font-semibold hover:underline">
              Clear all filters
          </button>
        </div>
      )}

      {sortedTrips.map((trip) => {
        const isPending = trip.verificationStatus === 'pending';
        return (
        <div key={trip.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden group transition ${
          isPending ? 'border-amber-300 border-l-4 border-l-amber-500 bg-amber-50/15' : 'border-gray-100'
        }`}>
          <div className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                   {/* Verification Status Badge */}
                   {isPending && (
                     <button
                       type="button"
                       onClick={() => onOpenVerificationQueue?.()}
                       className="flex items-center text-[10px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300 transition shadow-2xs"
                       title="Requires verification before final logbook commit"
                     >
                       <Clock size={10} className="mr-1 text-amber-700" />
                       Awaiting Verification
                     </button>
                   )}

                   {/* ATO Calibration Entry Badge */}
                   {trip.isCalibration && (
                     <span
                       className="flex items-center text-[10px] font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-300 shadow-2xs"
                       title="ATO Odometer Calibration & Baseline Sync"
                     >
                       <Gauge size={10} className="mr-1 text-amber-700" />
                       ATO Calibration Sync
                     </span>
                   )}

                   {/* Trip Type Badge */}
                   <span className={`flex items-center text-xs font-semibold px-2 py-1 rounded ${
                      trip.tripType === 'personal' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-indigo-100 text-indigo-700'
                   }`}>
                      {trip.tripType === 'personal' ? <User size={12} className="mr-1" /> : <Briefcase size={12} className="mr-1" />}
                      {trip.tripType === 'personal' ? 'Personal' : 'Work'}
                   </span>

                   {/* Tracking Mode Badge */}
                   {trip.trackingMode === 'gps' && (
                     <span className="flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                       <Navigation size={10} className="mr-1 text-emerald-600" />
                       GPS
                     </span>
                   )}

                   {/* Car Bluetooth Badge */}
                   {trip.triggerSource === 'bluetooth' && (
                     <span className="flex items-center text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                       <Bluetooth size={10} className="mr-1 text-blue-600" />
                       Car BT
                     </span>
                   )}

                   {/* Registration Badge */}
                   {trip.registrationNumber && (
                     <span className="flex items-center text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded border border-gray-200">
                        {trip.registrationNumber}
                     </span>
                   )}

                   <div className="flex items-center text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded w-fit">
                    <Calendar size={12} className="mr-1" />
                    {new Date(trip.start.timestamp).toLocaleDateString(locale)}
                  </div>
                </div>
                
                {trip.clientName && (
                  <div className="flex items-center text-xs font-semibold text-gray-700 mt-1 ml-1">
                    <Briefcase size={12} className="mr-1.5 text-gray-400" />
                    {trip.clientName}
                  </div>
                )}

                {(trip.startLocation?.address || trip.endLocation?.address) && (
                  <button
                    type="button"
                    onClick={() => onViewMap?.(trip)}
                    className="flex items-center text-xs text-gray-500 hover:text-indigo-600 mt-1 ml-1 max-w-[260px] truncate text-left transition"
                    title="View Route Map"
                  >
                    <MapPin size={11} className="mr-1 text-indigo-500 shrink-0" />
                    <span className="truncate hover:underline">
                      {trip.startLocation?.address || 'Start'} → {trip.endLocation?.address || 'End'}
                    </span>
                  </button>
                )}
              </div>
              <div className="text-right">
                <div className="flex flex-col items-end">
                  <div className="text-xl font-bold text-indigo-600">
                    {trip.distance?.toLocaleString()} <span className="text-sm font-normal text-gray-500">{distanceUnit}</span>
                  </div>
                  <div className={`flex gap-1 mt-1 ${isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                    {isPending && onOpenVerificationQueue && (
                      <button
                        type="button"
                        onClick={onOpenVerificationQueue}
                        className="px-2 py-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md transition shadow-2xs flex items-center space-x-1"
                        title="Review and verify this trip"
                      >
                        <Clock size={11} />
                        <span>Verify</span>
                      </button>
                    )}
                    {onViewMap && (
                      <button
                        onClick={() => onViewMap(trip)}
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition"
                        title="View Route Map & AI Tags"
                      >
                        <Navigation size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => onEdit(trip)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                      title="Edit Trip"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Start</div>
                <div className="font-medium text-gray-800">{trip.start.value.toLocaleString()}</div>
                <div className="text-xs text-gray-400">
                  {new Date(trip.start.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              
              <div className="space-y-1 text-right border-l pl-4 border-gray-100">
                <div className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Finish</div>
                <div className="font-medium text-gray-800">{trip.end?.value.toLocaleString() || '-'}</div>
                 <div className="text-xs text-gray-400">
                  {trip.end ? new Date(trip.end.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '-'}
                </div>
              </div>
            </div>
          </div>
          
          {trip.notes && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-sm text-gray-600 flex items-start">
              <FileText size={14} className="mr-2 mt-0.5 text-gray-400 shrink-0" />
              <p>{trip.notes}</p>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
};