import React, { useState, useEffect, useRef } from 'react';
import { Trip } from '../types';
import { X, Save, Trash2, Hash, Briefcase, FileText, AlertCircle, Lock, User, Car, Image as ImageIcon, Upload, Sparkles, Check, MapPin } from 'lucide-react';
import { predictTripTag, TripPrediction } from '../services/predictiveTaggingService';

interface TripEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (trip: Trip) => void;
  onDelete: (tripId: string) => void;
  initialTrip: Trip | null;
  vehicles?: string[];
  distanceUnit?: 'km' | 'mi';
  allTrips?: Trip[];
}

// Simple image compression utility (duplicated from Scanner to avoid external dependency issues in this context)
const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;
  
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
};

export const TripEditor: React.FC<TripEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialTrip,
  vehicles = [],
  distanceUnit = 'km',
  allTrips = []
}) => {
  const [clientName, setClientName] = useState('');
  const [startOdo, setStartOdo] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [startImage, setStartImage] = useState<string | undefined>(undefined);
  
  const [endOdo, setEndOdo] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [endImage, setEndImage] = useState<string | undefined>(undefined);

  const [notes, setNotes] = useState('');
  const [tripType, setTripType] = useState<'work' | 'personal'>('work');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [isCommitted, setIsCommitted] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Predictive Tagging State
  const [prediction, setPrediction] = useState<TripPrediction | null>(null);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [appliedPrediction, setAppliedPrediction] = useState<boolean>(false);

  // File Input Refs
  const startFileRef = useRef<HTMLInputElement>(null);
  const endFileRef = useRef<HTMLInputElement>(null);

  // Delete protection state
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialTrip) {
        setClientName(initialTrip.clientName || '');
        setStartOdo(initialTrip.start.value.toString());
        setStartDate(formatDateForInput(initialTrip.start.timestamp));
        setStartImage(initialTrip.start.imageUrl);
        
        setEndOdo(initialTrip.end?.value.toString() || '');
        setEndDate(initialTrip.end ? formatDateForInput(initialTrip.end.timestamp) : formatDateForInput(new Date().toISOString()));
        setEndImage(initialTrip.end?.imageUrl);

        setNotes(initialTrip.notes || '');
        setTripType(initialTrip.tripType || 'work');
        setRegistrationNumber(initialTrip.registrationNumber || '');
        setStartAddress(initialTrip.startLocation?.address || initialTrip.start?.location?.address || '');
        setEndAddress(initialTrip.endLocation?.address || initialTrip.end?.location?.address || '');
        setIsCommitted(initialTrip.verificationStatus !== 'pending');
      } else {
        // New trip defaults
        setClientName('');
        setStartOdo('');
        setStartDate(formatDateForInput(new Date().toISOString()));
        setStartImage(undefined);
        
        setEndOdo('');
        setEndDate(formatDateForInput(new Date().toISOString()));
        setEndImage(undefined);

        setNotes('');
        setTripType('work');
        setRegistrationNumber(vehicles.length === 1 ? vehicles[0] : '');
        setStartAddress('');
        setEndAddress('');
        setIsCommitted(true);
      }
      setError(null);
      setIsDeleteMode(false);
      setDeletePin('');
      setDeleteError(null);
      setPrediction(null);
      setAppliedPrediction(false);
    }
  }, [isOpen, initialTrip, vehicles]);

  const handlePredictTags = async () => {
    setIsPredicting(true);
    setAppliedPrediction(false);
    try {
      const sVal = parseInt(startOdo, 10);
      const eVal = endOdo ? parseInt(endOdo, 10) : undefined;
      const dist = (eVal && sVal && eVal >= sVal) ? (eVal - sVal) : (initialTrip?.distance || 0);

      const pred = await predictTripTag(
        {
          startAddress: initialTrip?.startLocation?.address,
          endAddress: initialTrip?.endLocation?.address,
          distance: dist,
          startTime: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
          vehicle: registrationNumber,
          notes: notes
        },
        allTrips
      );
      setPrediction(pred);
    } catch (e) {
      console.error("Prediction error in TripEditor", e);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleApplyPrediction = () => {
    if (!prediction) return;
    if (prediction.predictedTripType) setTripType(prediction.predictedTripType);
    if (prediction.predictedClient) setClientName(prediction.predictedClient);
    if (prediction.predictedReason && !notes) setNotes(prediction.predictedReason);
    setAppliedPrediction(true);
  };

  const formatDateForInput = (isoString: string) => {
    try {
      // Create date object and adjust for timezone offset to show local time in input
      const date = new Date(isoString);
      const offset = date.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
      return localISOTime;
    } catch (e) {
      return '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, isStart: boolean) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const compressed = await compressImage(file);
              if (isStart) setStartImage(compressed);
              else setEndImage(compressed);
          } catch (err) {
              alert("Failed to process image");
          }
      }
      // Reset input
      e.target.value = '';
  };

  const handleSave = () => {
    setError(null);
    const startVal = parseInt(startOdo);
    const endVal = endOdo ? parseInt(endOdo) : undefined;
    
    if (isNaN(startVal)) {
      setError("Start odometer value is required.");
      return;
    }

    if (endVal !== undefined && endVal < startVal) {
      setError("End odometer cannot be less than start odometer.");
      return;
    }
    
    // Construct Trip object
    const startTimestamp = startDate ? new Date(startDate).toISOString() : new Date().toISOString();
    const endTimestamp = endDate ? new Date(endDate).toISOString() : undefined;
    
    const resolvedStartLocation = startAddress.trim()
      ? {
          ...(initialTrip?.startLocation || initialTrip?.start?.location || { latitude: 0, longitude: 0 }),
          address: startAddress.trim(),
          timestamp: startTimestamp
        }
      : initialTrip?.startLocation;

    const resolvedEndLocation = endAddress.trim()
      ? {
          ...(initialTrip?.endLocation || initialTrip?.end?.location || { latitude: 0, longitude: 0 }),
          address: endAddress.trim(),
          timestamp: endTimestamp || new Date().toISOString()
        }
      : initialTrip?.endLocation;

    const tripData: Trip = {
      id: initialTrip?.id || crypto.randomUUID(),
      status: endVal ? 'completed' : 'active',
      verificationStatus: endVal ? (isCommitted ? 'verified' : 'pending') : undefined,
      start: {
        value: startVal,
        timestamp: startTimestamp,
        imageUrl: startImage,
        location: resolvedStartLocation || initialTrip?.start?.location
      },
      end: endVal ? {
        value: endVal,
        timestamp: endTimestamp || new Date().toISOString(),
        imageUrl: endImage,
        location: resolvedEndLocation || initialTrip?.end?.location
      } : undefined,
      distance: endVal ? (endVal - startVal) : undefined,
      clientName: clientName,
      notes: notes,
      tripType: tripType,
      registrationNumber: registrationNumber,
      trackingMode: initialTrip?.trackingMode,
      startLocation: resolvedStartLocation,
      endLocation: resolvedEndLocation,
      routeCoordinates: initialTrip?.routeCoordinates,
      triggerSource: initialTrip?.triggerSource
    };

    onSave(tripData);
    onClose();
  };

  const handleDeleteClick = () => {
    setIsDeleteMode(true);
    setDeletePin('');
    setDeleteError(null);
  };

  const handleConfirmDelete = () => {
    if (deletePin === '0000') {
      if (initialTrip) {
        onDelete(initialTrip.id);
        onClose();
      }
    } else {
      setDeleteError("Incorrect PIN");
    }
  };

  const handleCancelDelete = () => {
    setIsDeleteMode(false);
    setDeletePin('');
    setDeleteError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">
            {initialTrip ? 'Edit Trip' : 'Add Manual Trip'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center">
              <AlertCircle size={16} className="mr-2" />
              {error}
            </div>
          )}

          {/* AI Predictive Tagging Assistant */}
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-100 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-900">
                <Sparkles size={14} className="text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} />
                <span>AI Predictive Tagging</span>
              </div>
              <button
                type="button"
                onClick={handlePredictTags}
                disabled={isPredicting || isDeleteMode}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center space-x-1 transition"
              >
                <Sparkles size={12} />
                <span>{isPredicting ? 'Analyzing...' : 'Predict Tags'}</span>
              </button>
            </div>

            {prediction && (
              <div className="mt-2 pt-2 border-t border-indigo-200/60 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700">
                    Suggested: <span className={prediction.predictedTripType === 'work' ? 'text-indigo-700 font-bold' : 'text-emerald-700 font-bold'}>{prediction.predictedTripType.toUpperCase()}</span>
                    {prediction.predictedClient ? ` • ${prediction.predictedClient}` : ''}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700">
                    {prediction.confidence}% confidence
                  </span>
                </div>
                <p className="text-gray-500 text-[11px] italic">
                  "{prediction.explanation || prediction.predictedReason}"
                </p>
                <div className="pt-1 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleApplyPrediction}
                    disabled={appliedPrediction}
                    className="w-full py-1.5 bg-white border border-indigo-300 hover:border-indigo-400 text-indigo-700 font-semibold rounded-lg shadow-xs flex items-center justify-center space-x-1.5 transition text-xs"
                  >
                    {appliedPrediction ? (
                      <>
                        <Check size={13} className="text-emerald-600" />
                        <span>Applied!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} className="text-indigo-600" />
                        <span>Apply Suggestion</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Trip Type */}
          <div className="space-y-1">
             <label className="text-sm font-semibold text-gray-700">Trip Type</label>
             <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setTripType('work')}
                  disabled={isDeleteMode}
                  className={`flex items-center justify-center py-2 text-sm font-medium rounded-md transition ${
                    tripType === 'work' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Briefcase size={16} className="mr-2" />
                  Work
                </button>
                <button
                  onClick={() => setTripType('personal')}
                  disabled={isDeleteMode}
                  className={`flex items-center justify-center py-2 text-sm font-medium rounded-md transition ${
                    tripType === 'personal' 
                      ? 'bg-white text-green-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <User size={16} className="mr-2" />
                  Personal
                </button>
              </div>
          </div>
          
          {/* Vehicle Selection */}
          <div className="space-y-1">
             <label className="text-sm font-semibold text-gray-700 flex items-center">
               <Car size={14} className="mr-1.5 text-gray-400" />
               Vehicle
             </label>
             <select
               value={registrationNumber}
               onChange={(e) => setRegistrationNumber(e.target.value)}
               className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
               disabled={isDeleteMode}
             >
               <option value="">Select Vehicle...</option>
               {vehicles.map(v => (
                 <option key={v} value={v}>{v}</option>
               ))}
               {vehicles.length === 0 && <option value="" disabled>Add vehicles in Settings</option>}
             </select>
          </div>

          {/* Client Name */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700 flex items-center">
              <Briefcase size={14} className="mr-1.5 text-gray-400" />
              Client Name
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isDeleteMode}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Start Odometer */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 flex items-center">
                <Hash size={14} className="mr-1.5 text-gray-400" />
                Start Odo ({distanceUnit})
              </label>
              <div className="flex gap-2">
                 <input
                    type="number"
                    value={startOdo}
                    onChange={(e) => setStartOdo(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    disabled={isDeleteMode}
                 />
                 <button 
                    onClick={() => startFileRef.current?.click()}
                    disabled={isDeleteMode}
                    className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center shrink-0 w-12"
                    title="Add Photo"
                 >
                    {startImage ? (
                        <img src={startImage} alt="Start" className="w-8 h-8 object-cover rounded" />
                    ) : (
                        <ImageIcon size={20} className="text-gray-400" />
                    )}
                 </button>
                 <input type="file" ref={startFileRef} className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, true)} />
              </div>
            </div>
             {/* Start Date */}
             <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Start Time</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                disabled={isDeleteMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* End Odometer */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 flex items-center">
                <Hash size={14} className="mr-1.5 text-gray-400" />
                End Odo ({distanceUnit})
              </label>
              <div className="flex gap-2">
                 <input
                    type="number"
                    value={endOdo}
                    onChange={(e) => setEndOdo(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    disabled={isDeleteMode}
                 />
                 <button 
                    onClick={() => endFileRef.current?.click()}
                    disabled={isDeleteMode}
                    className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center shrink-0 w-12"
                    title="Add Photo"
                 >
                    {endImage ? (
                        <img src={endImage} alt="End" className="w-8 h-8 object-cover rounded" />
                    ) : (
                        <ImageIcon size={20} className="text-gray-400" />
                    )}
                 </button>
                 <input type="file" ref={endFileRef} className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, false)} />
              </div>
            </div>
            {/* End Date */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">End Time</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                disabled={isDeleteMode}
              />
            </div>
          </div>

          {/* Notes / Reason */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700 flex items-center">
              <FileText size={14} className="mr-1.5 text-gray-400" />
              Reason for Journey <span className="text-xs font-normal text-gray-500 ml-1">(Required for ATO)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Client Meeting with XYZ, Site Inspection, Stock Pickup"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              disabled={isDeleteMode}
            />
          </div>

          {/* Verification Status Checkbox */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-start space-x-3">
            <input
              type="checkbox"
              id="isCommitted"
              checked={isCommitted}
              onChange={(e) => setIsCommitted(e.target.checked)}
              className="mt-0.5 h-4 w-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="isCommitted" className="text-xs text-gray-700 cursor-pointer select-none">
              <span className="font-semibold block text-gray-900">
                {isCommitted ? '✓ Verified & Committed to Official Logbook' : '⏳ Keep in Verification Queue'}
              </span>
              <span className="text-gray-500 text-[11px] block mt-0.5">
                {isCommitted 
                  ? 'This trip is verified and committed to your final record.' 
                  : 'Trip will remain in the verification queue so you can review details before committing.'}
              </span>
            </label>
          </div>
        </div>

        {/* Footer Area */}
        <div className={`px-6 py-4 border-t border-gray-100 transition-colors duration-300 ${isDeleteMode ? 'bg-red-50' : 'bg-gray-50'}`}>
          {isDeleteMode ? (
             <div className="flex flex-col space-y-3">
               <div className="flex items-center justify-between">
                  <div className="flex items-center text-red-700 font-semibold text-sm">
                    <Lock size={16} className="mr-2" />
                    Security Check
                  </div>
                  {deleteError && (
                    <span className="text-xs text-red-600 font-bold bg-red-100 px-2 py-0.5 rounded animate-pulse">
                      {deleteError}
                    </span>
                  )}
               </div>
               <div className="flex flex-col sm:flex-row gap-3">
                 <div className="relative grow w-full sm:w-auto">
                   <input 
                      type="password" 
                      value={deletePin}
                      onChange={(e) => setDeletePin(e.target.value)}
                      placeholder="PIN: 0000"
                      className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                      autoFocus
                    />
                 </div>
                 <div className="flex gap-3 justify-end">
                    <button 
                        onClick={handleConfirmDelete}
                        className="flex-1 sm:flex-none px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 shadow-sm whitespace-nowrap"
                    >
                        Confirm Delete
                    </button>
                    <button 
                        onClick={handleCancelDelete}
                        className="flex-1 sm:flex-none px-4 py-2 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                 </div>
               </div>
             </div>
          ) : (
            <div className="flex justify-between items-center">
              {initialTrip ? (
                <button 
                  onClick={handleDeleteClick}
                  className="text-red-500 hover:text-red-700 flex items-center px-3 py-2 rounded hover:bg-red-50 transition"
                  title="Delete Trip"
                >
                  <Trash2 size={18} className="mr-2" />
                  Delete
                </button>
              ) : (
                <div></div> // Spacer
              )}
            
              <div className="flex space-x-3">
                <button 
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-md transition flex items-center"
                >
                  <Save size={18} className="mr-2" />
                  Save Trip
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
