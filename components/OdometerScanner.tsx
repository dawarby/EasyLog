import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Camera, Upload, Check, AlertCircle, Loader2, X, Briefcase, User, Keyboard, RefreshCcw, Car, WifiOff, Image as ImageIcon } from 'lucide-react';
import { extractOdometerReading } from '../services/geminiService';
import { Trip } from '../types';

interface OdometerScannerProps {
  onScanComplete: (value: number, imageUrl: string, notes?: string, clientName?: string, tripType?: 'work' | 'personal', registrationNumber?: string) => void;
  onCancel: () => void;
  mode: 'start' | 'end';
  initialData?: Trip | null;
  vehicles?: string[];
  onAddVehicle?: (reg: string) => void;
  distanceUnit?: 'km' | 'mi';
  prefilledValue?: number | null; // For chain trips
}

// Utility to compress image
export const compressImage = (file: File): Promise<string> => {
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

export const OdometerScanner: React.FC<OdometerScannerProps> = ({ 
  onScanComplete, 
  onCancel, 
  mode, 
  initialData, 
  vehicles = [], 
  onAddVehicle,
  distanceUnit = 'km',
  prefilledValue
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Readings
  const [scannedValue, setScannedValue] = useState<number | null>(prefilledValue || null);
  const [manualOverride, setManualOverride] = useState<string>(prefilledValue ? prefilledValue.toString() : '');
  
  const [notes, setNotes] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [tripType, setTripType] = useState<'work' | 'personal'>('work');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(!!prefilledValue);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // New Vehicle Input State
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicleInput, setNewVehicleInput] = useState('');

  // Detect Locale
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-retry analysis
      if (previewUrl && !scannedValue && (error?.includes('Connection') || error?.includes('internet') || error?.includes('Offline'))) {
         setError(null);
         setTimeout(() => analyzeImage(previewUrl), 500);
      }
    };
    const handleOffline = () => {
        setIsOnline(false);
        if (isProcessing) {
            setIsProcessing(false);
            setError("Connection lost. Analysis paused.");
        }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [previewUrl, scannedValue, error, isProcessing]);

  useEffect(() => {
    if (mode === 'end' && initialData) {
      setClientName(initialData.clientName || '');
      setNotes(initialData.notes || '');
      setTripType(initialData.tripType || 'work');
      setSelectedVehicle(initialData.registrationNumber || '');
    } else if (mode === 'start' && vehicles.length === 1) {
      setSelectedVehicle(vehicles[0]);
    }
  }, [mode, initialData, vehicles]);

  const analyzeImage = async (dataUrl: string) => {
    if (!navigator.onLine) {
        setIsProcessing(false);
        setError("Offline. Photo saved. Will retry automatically when online.");
        return;
    }

    setIsProcessing(true);
    setError(null);
    
    extractOdometerReading(dataUrl)
      .then((reading) => {
          setIsProcessing(false);
          if (reading !== null && reading > 0) {
            setScannedValue(reading);
            setManualOverride(reading.toString());
            setError(null);
          } else {
            if (!manualOverride) setError("Could not detect an odometer reading. Please ensure the numbers are clear and well-lit, or enter manually.");
          }
      })
      .catch((err) => {
          setIsProcessing(false);
          if (!navigator.onLine) {
              setError("Connection lost. Analysis paused.");
          } else {
              setError(err?.message || "Analysis failed. Retry or enter manually.");
          }
      });
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);
    setScannedValue(null);
    if (!prefilledValue) setManualOverride('');
    setIsManualEntry(false);

    try {
      const compressedDataUrl = await compressImage(file);
      setPreviewUrl(compressedDataUrl); 
      analyzeImage(compressedDataUrl);
    } catch (err) {
      setIsProcessing(false);
      setError("Failed to process image file.");
    }
  };
  
  const handleRetryAnalysis = () => {
    if (previewUrl) {
        analyzeImage(previewUrl);
    }
  };

  const handleManualEntryMode = () => {
    setIsManualEntry(true);
    setPreviewUrl(null);
    setScannedValue(null);
    if (!prefilledValue) setManualOverride('');
    setError(null);
  };

  const handleVehicleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__NEW__') {
      setIsAddingVehicle(true);
      setSelectedVehicle('');
    } else {
      setSelectedVehicle(value);
    }
  };

  const saveNewVehicle = () => {
    if (newVehicleInput.trim()) {
      const newReg = newVehicleInput.trim().toUpperCase();
      setSelectedVehicle(newReg);
      if (onAddVehicle) onAddVehicle(newReg);
      setIsAddingVehicle(false);
      setNewVehicleInput('');
    } else {
      setIsAddingVehicle(false);
    }
  };

  const confirmValue = () => {
    const finalValue = parseInt(manualOverride.replace(/[^0-9]/g, ''));
    if (isNaN(finalValue) || finalValue < 0) {
      setError("Please enter a valid reading.");
      return;
    }

    // Standard validation
    if (mode === 'end' && initialData) {
       if (finalValue < initialData.start.value) {
           setError(`Value cannot be less than start (${initialData.start.value})`);
           return;
       }
    }
    
    let finalVehicle = isAddingVehicle ? newVehicleInput.trim().toUpperCase() : selectedVehicle;
    if (isAddingVehicle && finalVehicle && onAddVehicle) onAddVehicle(finalVehicle);

    if (previewUrl || isManualEntry) {
      onScanComplete(
          finalValue, 
          previewUrl || '', 
          notes, 
          clientName, 
          tripType, 
          finalVehicle
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div className="flex flex-col">
             <h2 className="text-xl font-bold text-gray-800">
               {mode === 'start' ? 'Start Trip' : 'End Trip'}
             </h2>
             {!isOnline && (
                <div className="flex items-center text-xs text-orange-600 font-semibold mt-0.5 animate-pulse">
                   <WifiOff size={12} className="mr-1" />
                   Offline Mode
                </div>
             )}
          </div>
          <button 
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          
          {/* Image Area */}
          {!isManualEntry && !isAddingVehicle && (
            <div className="relative aspect-video bg-gray-100 rounded-xl overflow-hidden border-2 border-dashed border-gray-300 flex items-center justify-center group transition-all shrink-0">
              {previewUrl ? (
                <img 
                  src={previewUrl} 
                  alt="Odometer" 
                  className={`w-full h-full object-cover ${isProcessing ? 'opacity-50 blur-sm' : ''}`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full space-y-3">
                  <div className="text-center cursor-pointer p-4" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                      <Camera size={32} />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Take Photo & Analyze</p>
                  </div>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      galleryInputRef.current?.click();
                    }}
                    className="flex items-center text-xs text-indigo-600 font-semibold bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition"
                  >
                    <ImageIcon size={14} className="mr-1.5" />
                    Upload from Gallery
                  </button>
                </div>
              )}
              
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                  <Loader2 className="animate-spin text-blue-600 mb-2 drop-shadow-md" size={40} />
                  <span className="text-sm font-bold text-blue-700 bg-white/80 px-3 py-1 rounded-full backdrop-blur-md shadow-sm">
                    AI Analyzing...
                  </span>
                </div>
              )}

              {!isProcessing && previewUrl && error && (
                 <button 
                   onClick={handleRetryAnalysis}
                   className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center z-10 hover:bg-black/30 transition"
                 >
                    <div className="bg-white px-4 py-2 rounded-full shadow-lg flex items-center text-sm font-bold text-gray-800 hover:scale-105 transform transition">
                       <RefreshCcw size={16} className="mr-2 text-blue-600" />
                       Retry Analysis
                    </div>
                 </button>
              )}
            </div>
          )}

          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
          />
          <input 
            type="file" 
            accept="image/*"
            className="hidden" 
            ref={galleryInputRef} 
            onChange={handleFileChange} 
          />

          {/* Initial View Controls */}
          {!previewUrl && !isManualEntry && !isProcessing && (
             <div className="space-y-4">
                 <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Vehicle</label>
                     <div className="relative">
                         {isAddingVehicle ? (
                            <div className="flex gap-2">
                               <input 
                                  type="text"
                                  value={newVehicleInput}
                                  onChange={(e) => setNewVehicleInput(e.target.value)}
                                  placeholder="Enter Registration"
                                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none uppercase"
                                  autoFocus
                               />
                               <button onClick={saveNewVehicle} className="p-2 bg-indigo-100 text-indigo-600 rounded-md"><Check size={18} /></button>
                               <button onClick={() => setIsAddingVehicle(false)} className="p-2 text-gray-400 rounded-md"><X size={18} /></button>
                            </div>
                         ) : (
                           <>
                             <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                 <Car size={16} />
                             </div>
                             <select
                                 value={selectedVehicle}
                                 onChange={handleVehicleChange}
                                 className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
                             >
                                 <option value="">Select Vehicle...</option>
                                 {vehicles.map(v => (
                                     <option key={v} value={v}>{v}</option>
                                 ))}
                                 <option value="__NEW__" className="font-semibold text-indigo-600">+ Add New Vehicle...</option>
                             </select>
                           </>
                         )}
                     </div>
                 </div>

                 {!isAddingVehicle && (
                   <button
                     onClick={handleManualEntryMode}
                     className="w-full py-3 flex items-center justify-center text-indigo-600 font-medium bg-white border border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200 rounded-xl transition shadow-sm"
                   >
                     <Keyboard size={18} className="mr-2" />
                     Enter Manually
                   </button>
                 )}
             </div>
          )}

          {/* Post-scan OR Manual Mode Controls */}
          {(previewUrl || isManualEntry) && (
            <div className="space-y-4 animate-fade-in pb-2">
              
              {/* Trip Info */}
              {mode === 'end' && initialData && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-1 text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2">
                    <Car size={12} />
                    Trip Started
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 gap-x-4">
                    <div className="flex flex-col">
                       <span className="text-xs text-indigo-400">Time</span>
                       <span className="font-medium text-indigo-900">
                         {new Date(initialData.start.timestamp).toLocaleTimeString(locale, {hour: '2-digit', minute:'2-digit'})}
                       </span>
                    </div>
                    <div className="flex flex-col">
                       <span className="text-xs text-indigo-400">Odometer</span>
                       <span className="font-mono font-medium text-indigo-900">{initialData.start.value.toLocaleString()} {distanceUnit}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vehicle Selection (Confirmation) */}
              <div className="space-y-2">
                 <label className="block text-sm font-semibold text-gray-700">Vehicle</label>
                 <div className="relative">
                   {isAddingVehicle ? (
                      <div className="flex gap-2">
                         <div className="relative grow">
                           <input 
                              type="text"
                              value={newVehicleInput}
                              onChange={(e) => setNewVehicleInput(e.target.value)}
                              placeholder="Enter Registration"
                              className="w-full pl-3 pr-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                              autoFocus
                           />
                         </div>
                         <button onClick={saveNewVehicle} className="p-3 bg-indigo-100 text-indigo-600 rounded-lg"><Check size={18} /></button>
                         <button onClick={() => setIsAddingVehicle(false)} className="p-3 text-gray-400 border border-gray-200 rounded-lg"><X size={18} /></button>
                      </div>
                   ) : (
                      <>
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Car size={16} />
                        </div>
                        <select
                          value={selectedVehicle}
                          onChange={handleVehicleChange}
                          className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                        >
                          <option value="">Select Vehicle...</option>
                          {vehicles.map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                          <option value="__NEW__" className="font-semibold text-indigo-600">+ Add New Vehicle...</option>
                        </select>
                      </>
                   )}
                 </div>
              </div>

              {/* Odometer Input */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  {mode === 'end' ? `End Reading (${distanceUnit})` : `Odometer Reading (${distanceUnit})`}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={manualOverride}
                    onChange={(e) => {
                      setManualOverride(e.target.value);
                      setError(null);
                    }}
                    placeholder={isProcessing ? "Analyzing..." : "Enter reading..."}
                    className={`w-full pl-4 pr-12 py-3 text-lg font-mono bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${isProcessing ? 'animate-pulse' : ''}`}
                    autoFocus={isManualEntry}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                    {distanceUnit}
                  </div>
                </div>
              </div>

              {/* Trip Type Toggle */}
              <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setTripType('work')}
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

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Client Name (Optional)
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Briefcase size={16} />
                  </div>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Enter client name..."
                    className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Reason for Journey <span className="text-xs font-normal text-gray-500">(Required for ATO)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Client meeting..."
                  className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                  rows={2}
                />
              </div>

              {error && (
                <div className="flex items-center text-red-500 text-sm mt-2 font-medium bg-red-50 p-2 rounded-lg">
                  <AlertCircle size={16} className="mr-2 shrink-0" />
                  {error}
                </div>
              )}
              {scannedValue !== null && scannedValue > 0 && !error && (
                  <p className="text-green-600 text-xs flex items-center mt-1">
                    <Check size={12} className="mr-1" />
                    Auto-detected
                  </p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                {!isManualEntry && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center py-3 px-4 border border-gray-200 rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    <Upload size={18} className="mr-2" />
                    Retake
                  </button>
                )}
                
                {isManualEntry && (
                  <button
                    onClick={onCancel}
                    className="flex-1 flex items-center justify-center py-3 px-4 border border-gray-200 rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                )}

                <button
                  onClick={confirmValue}
                  disabled={isProcessing && !manualOverride}
                  className="flex-1 flex items-center justify-center py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-200 transition transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {isProcessing && !manualOverride ? (
                    <Loader2 className="animate-spin mr-2" size={18} />
                  ) : null}
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};