import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import {
  Camera,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  X,
  Briefcase,
  User,
  Keyboard,
  RefreshCcw,
  Car,
  WifiOff,
  Image as ImageIcon,
  RotateCw,
  Zap,
  ZapOff,
  ShieldAlert,
  HelpCircle,
  CheckCircle2
} from 'lucide-react';
import { extractOdometerReading } from '../services/geminiService';
import { Trip } from '../types';
import {
  requestCameraPermission,
  isStandaloneApp,
  getPermissionHelpGuide
} from '../services/devicePermissionsService';

// Digital zoom is used when the camera hardware does not expose a zoom capability
const DIGITAL_MAX_ZOOM = 4;
const DIGITAL_ZOOM_STEP = 0.5;

interface ZoomRange {
  min: number;
  max: number;
  step: number;
  hardware: boolean;
}

interface OdometerScannerProps {
  onScanComplete: (
    value: number,
    imageUrl: string,
    notes?: string,
    clientName?: string,
    tripType?: 'work' | 'personal',
    registrationNumber?: string
  ) => void;
  onCancel: () => void;
  mode: 'start' | 'end';
  title?: string;
  initialData?: Trip | null;
  vehicles?: string[];
  onAddVehicle?: (reg: string) => void;
  distanceUnit?: 'km' | 'mi';
  prefilledValue?: number | null; // For chain trips or calibration
  autoStartCamera?: boolean;
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
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 1280;
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
        resolve(canvas.toDataURL('image/jpeg', 0.8));
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
  title,
  initialData,
  vehicles = [],
  onAddVehicle,
  distanceUnit = 'km',
  prefilledValue,
  autoStartCamera = true
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Live Camera Stream State
  const [isLiveCameraActive, setIsLiveCameraActive] = useState<boolean>(false);
  const [isCameraStarting, setIsCameraStarting] = useState<boolean>(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState<boolean>(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [showPermissionGuide, setShowPermissionGuide] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Readings & Form State
  const [scannedValue, setScannedValue] = useState<number | null>(prefilledValue || null);
  const [manualOverride, setManualOverride] = useState<string>(prefilledValue ? prefilledValue.toString() : '');
  const [notes, setNotes] = useState<string>(initialData?.notes || '');
  const [clientName, setClientName] = useState<string>(initialData?.clientName || '');
  const [tripType, setTripType] = useState<'work' | 'personal'>(initialData?.tripType || 'work');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // New Vehicle Input State
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicleInput, setNewVehicleInput] = useState('');

  // Detect Locale & Standalone
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  const isStandalone = isStandaloneApp();

  // Stop camera tracks helper
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLiveCameraActive(false);
    setIsTorchOn(false);
    setZoomRange(null);
    setZoomLevel(1);
  };

  // Start Live Camera Function
  const startLiveCamera = async (preferredFacingMode = facingMode) => {
    setError(null);
    setCameraErrorMessage(null);
    setCameraPermissionDenied(false);
    setIsCameraStarting(true);

    // Stop any existing stream
    stopCameraStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      setIsCameraStarting(false);
      setCameraPermissionDenied(true);
      setCameraErrorMessage('Live camera is not supported in this browser environment. Use the system camera button below.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: preferredFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => console.warn('Video play interrupted:', e));
      }

      setIsLiveCameraActive(true);
      setIsCameraStarting(false);

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      const capabilities: any = track.getCapabilities?.() || {};
      setHasTorch(Boolean(capabilities.torch));

      // Prefer hardware zoom; otherwise fall back to digital zoom
      if (capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min) {
        const { min, max, step } = capabilities.zoom;
        setZoomRange({ min, max, step: step || 0.1, hardware: true });
        setZoomLevel(Math.min(Math.max(1, min), max));
      } else {
        setZoomRange({ min: 1, max: DIGITAL_MAX_ZOOM, step: DIGITAL_ZOOM_STEP, hardware: false });
        setZoomLevel(1);
      }
    } catch (err: any) {
      setIsCameraStarting(false);
      setIsLiveCameraActive(false);

      const errorName = err?.name || '';
      console.warn('Camera getUserMedia error:', errorName, err);

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setCameraPermissionDenied(true);
        setCameraErrorMessage(
          isStandalone
            ? 'Camera permission was not granted in this installed app. Tap "Grant Camera Permission" or use the direct camera button below.'
            : 'Camera permission denied. Allow camera access to scan your dashboard odometer.'
        );
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        setCameraErrorMessage('No camera device found on this system.');
      } else {
        setCameraErrorMessage(err?.message || 'Unable to open camera stream. Try using the system camera button below.');
      }
    }
  };

  // Toggle Torch/Flash
  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const newTorchState = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: newTorchState }]
      });
      setIsTorchOn(newTorchState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Change zoom (hardware via track constraints, digital via CSS scale + crop on capture)
  const applyZoom = async (next: number) => {
    if (!zoomRange) return;
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, Math.round(next * 10) / 10));
    setZoomLevel(clamped);

    if (zoomRange.hardware && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      try {
        await (track as any).applyConstraints({ advanced: [{ zoom: clamped }] });
      } catch (err) {
        console.warn('Zoom change failed:', err);
      }
    }
  };

  // Flip Camera (Front / Rear)
  const flipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startLiveCamera(nextMode);
  };

  // Capture frame from live video
  const captureFrameFromLiveVideo = () => {
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    // With digital zoom, capture only the centre region that is currently on screen
    const digitalZoom = zoomRange && !zoomRange.hardware ? zoomLevel : 1;
    const cropWidth = Math.round(width / digitalZoom);
    const cropHeight = Math.round(height / digitalZoom);
    const sx = Math.round((width - cropWidth) / 2);
    const sy = Math.round((height - cropHeight) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Stop camera stream once frame is snapped
    stopCameraStream();

    setPreviewUrl(dataUrl);
    setIsManualEntry(false);
    analyzeImage(dataUrl);
  };

  // Auto-start camera when modal opens (unless manual mode)
  useEffect(() => {
    if (autoStartCamera && !previewUrl && !isManualEntry) {
      startLiveCamera('environment');
    }

    return () => {
      stopCameraStream();
    };
  }, [autoStartCamera]);

  // Online / Offline tracking
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (previewUrl && !scannedValue && error?.includes('Offline')) {
        setError(null);
        setTimeout(() => analyzeImage(previewUrl), 500);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (isProcessing) {
        setIsProcessing(false);
        setError('Connection lost. Analysis paused.');
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [previewUrl, scannedValue, error, isProcessing]);

  // Initialize vehicle info
  useEffect(() => {
    if (mode === 'end' && initialData) {
      setClientName(initialData.clientName || '');
      setNotes(initialData.notes || '');
      setTripType(initialData.tripType || 'work');
      setSelectedVehicle(initialData.registrationNumber || '');
    } else if (mode === 'start' && vehicles.length === 1) {
      setSelectedVehicle(vehicles[0]);
    } else if (vehicles.length > 0 && !selectedVehicle) {
      setSelectedVehicle(vehicles[0]);
    }
  }, [mode, initialData, vehicles]);

  // AI Odometer Extraction
  const analyzeImage = async (dataUrl: string) => {
    if (!navigator.onLine) {
      setIsProcessing(false);
      setError('Offline. Photo saved. Will retry automatically when online.');
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
          if (!manualOverride) {
            setError('Could not detect an odometer reading. Please ensure the numbers are clear and well-lit, or enter manually below.');
          }
        }
      })
      .catch((err) => {
        setIsProcessing(false);
        if (!navigator.onLine) {
          setError('Connection lost. Analysis paused.');
        } else {
          setError(err?.message || 'Analysis failed. Retry or enter manually.');
        }
      });
  };

  // Handle standard file selection (from gallery or native camera)
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCameraStream();
    setError(null);
    setIsProcessing(true);
    setScannedValue(null);
    if (!prefilledValue) setManualOverride('');
    setIsManualEntry(false);

    try {
      const compressedDataUrl = await compressImage(file);
      setPreviewUrl(compressedDataUrl);
      analyzeImage(compressedDataUrl);
    } catch {
      setIsProcessing(false);
      setError('Failed to process image file.');
    }
  };

  const handleRetryAnalysis = () => {
    if (previewUrl) {
      analyzeImage(previewUrl);
    }
  };

  const handleManualEntryMode = () => {
    stopCameraStream();
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
    const finalValue = parseInt(manualOverride.replace(/[^0-9]/g, ''), 10);
    if (isNaN(finalValue) || finalValue < 0) {
      setError('Please enter a valid reading.');
      return;
    }

    if (mode === 'end' && initialData) {
      if (finalValue < initialData.start.value) {
        setError(`Value cannot be less than start (${initialData.start.value.toLocaleString()} ${distanceUnit})`);
        return;
      }
    }

    const finalVehicle = isAddingVehicle ? newVehicleInput.trim().toUpperCase() : selectedVehicle;
    if (isAddingVehicle && finalVehicle && onAddVehicle) onAddVehicle(finalVehicle);

    if (previewUrl || isManualEntry || isValidOdo) {
      stopCameraStream();
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

  const isValidOdo = !isNaN(parseInt(manualOverride, 10)) && parseInt(manualOverride, 10) > 0;
  const permissionGuide = getPermissionHelpGuide('camera');

  const modalTitle = title || (mode === 'start' ? 'Start Trip — Scan Odometer' : 'End Trip — Scan Odometer');

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-5 py-3.5 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Camera size={18} className="text-indigo-600" />
              <span>{modalTitle}</span>
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              {!isOnline && (
                <div className="flex items-center text-[11px] text-orange-600 font-semibold animate-pulse">
                  <WifiOff size={11} className="mr-1" />
                  Offline Mode
                </div>
              )}
              {isStandalone && (
                <span className="text-[10px] text-indigo-700 bg-indigo-50 font-semibold px-2 py-0.2 rounded-full border border-indigo-200/60">
                  Installed App
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              stopCameraStream();
              onCancel();
            }}
            className="text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-200 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Main Camera / Preview / Permission Viewport */}
          {!isManualEntry && (
            <div className="relative aspect-4/3 sm:aspect-16/10 bg-slate-950 rounded-2xl overflow-hidden border border-gray-800 flex items-center justify-center shadow-inner shrink-0">
              {/* 1. Captured Image Preview */}
              {previewUrl && (
                <div className="relative w-full h-full">
                  <img
                    src={previewUrl}
                    alt="Odometer Preview"
                    className={`w-full h-full object-contain bg-black ${isProcessing ? 'opacity-40 blur-xs' : ''}`}
                  />
                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewUrl(null);
                        startLiveCamera();
                      }}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/75 hover:bg-black/90 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full backdrop-blur-md flex items-center gap-1.5 border border-white/20 transition"
                    >
                      <RotateCw size={13} />
                      <span>Retake Photo</span>
                    </button>
                  )}
                </div>
              )}

              {/* 2. Live Camera Viewfinder */}
              {!previewUrl && isLiveCameraActive && (
                <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={zoomRange && !zoomRange.hardware ? { transform: `scale(${zoomLevel})` } : undefined}
                  />

                  {/* Viewfinder Alignment Guide */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                    <div className="w-[85%] max-w-xs h-28 border-2 border-dashed border-white/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                      {/* Corner Accents */}
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-indigo-400 rounded-tl-sm"></div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-indigo-400 rounded-tr-sm"></div>
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-indigo-400 rounded-bl-sm"></div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-indigo-400 rounded-br-sm"></div>

                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/70 px-2 py-0.5 rounded text-[10px] font-bold text-white tracking-wide uppercase whitespace-nowrap">
                        Align Odometer Numbers
                      </div>
                    </div>
                  </div>

                  {/* Top Live Camera Controls */}
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2 rounded-full backdrop-blur-md border transition ${
                          isTorchOn
                            ? 'bg-amber-400 text-black border-amber-300'
                            : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
                        }`}
                        title={isTorchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                      >
                        {isTorchOn ? <Zap size={15} /> : <ZapOff size={15} />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={flipCamera}
                      className="p-2 rounded-full bg-black/60 text-white border border-white/20 hover:bg-black/80 backdrop-blur-md transition"
                      title="Switch Camera (Front/Back)"
                    >
                      <RotateCw size={15} />
                    </button>
                  </div>

                  {/* Zoom Control */}
                  {zoomRange && (
                    <div className="absolute bottom-3 left-3 z-20 flex items-center bg-black/60 backdrop-blur-md border border-white/20 rounded-full text-white text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => applyZoom(zoomLevel - zoomRange.step)}
                        disabled={zoomLevel <= zoomRange.min}
                        className="px-3 py-1.5 disabled:opacity-40"
                        title="Zoom out"
                        aria-label="Zoom out"
                      >
                        −
                      </button>
                      <span className="min-w-[2.75rem] text-center tabular-nums">{zoomLevel.toFixed(1)}x</span>
                      <button
                        type="button"
                        onClick={() => applyZoom(zoomLevel + zoomRange.step)}
                        disabled={zoomLevel >= zoomRange.max}
                        className="px-3 py-1.5 disabled:opacity-40"
                        title="Zoom in"
                        aria-label="Zoom in"
                      >
                        +
                      </button>
                    </div>
                  )}

                  {/* Bottom Camera Action Bar */}
                  <div className="absolute bottom-3 inset-x-0 flex items-center justify-center px-4 z-20">
                    <button
                      type="button"
                      onClick={captureFrameFromLiveVideo}
                      className="w-16 h-16 rounded-full bg-white p-1 shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition"
                      title="Capture Photo"
                    >
                      <div className="w-13 h-13 rounded-full border-2 border-slate-900 bg-indigo-600 flex items-center justify-center text-white">
                        <Camera size={24} />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Starting Camera Loader */}
              {!previewUrl && !isLiveCameraActive && isCameraStarting && (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Loader2 className="animate-spin text-indigo-400" size={36} />
                  <p className="text-xs text-gray-200 font-medium">Opening Camera...</p>
                </div>
              )}

              {/* 4. Camera Permission Denied or Not Started Fallback */}
              {!previewUrl && !isLiveCameraActive && !isCameraStarting && (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3.5 max-w-sm text-white">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center">
                    {cameraPermissionDenied ? <ShieldAlert size={26} /> : <Camera size={26} />}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {cameraPermissionDenied ? 'Camera Access Blocked' : 'Camera Ready to Open'}
                    </h3>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                      {cameraErrorMessage || 'Allow camera permission to photograph your car dashboard odometer.'}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 w-full pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await requestCameraPermission();
                        if (res.granted) {
                          startLiveCamera();
                        } else {
                          setCameraPermissionDenied(true);
                          setCameraErrorMessage(res.error || 'Permission was denied.');
                        }
                      }}
                      className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <Camera size={14} />
                      <span>{cameraPermissionDenied ? 'Grant Camera Permission' : 'Open Camera'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPermissionGuide(!showPermissionGuide)}
                      className="py-2.5 px-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1"
                    >
                      <HelpCircle size={14} />
                      <span>{showPermissionGuide ? 'Hide Help' : 'Help'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Processing Spinner Overlay */}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center z-30">
                  <Loader2 className="animate-spin text-white mb-2" size={36} />
                  <span className="text-xs font-bold text-white bg-indigo-600/90 px-3.5 py-1 rounded-full shadow-lg">
                    AI Reading Odometer...
                  </span>
                </div>
              )}

              {/* Retry Analysis Button */}
              {!isProcessing && previewUrl && error && (
                <button
                  type="button"
                  onClick={handleRetryAnalysis}
                  className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center z-30 hover:bg-black/40 transition"
                >
                  <div className="bg-white px-4 py-2 rounded-full shadow-xl flex items-center text-xs font-bold text-gray-800 hover:scale-105 transition">
                    <RefreshCcw size={14} className="mr-1.5 text-indigo-600" />
                    Retry Analysis
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Permission Troubleshooting Guide Accordion */}
          {showPermissionGuide && (
            <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-950 space-y-2 animate-fade-in">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <ShieldAlert size={15} className="text-amber-700" />
                <span>{permissionGuide.title}</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-900/90 pl-1 leading-relaxed">
                {permissionGuide.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
              {isStandalone && (
                <div className="mt-2 pt-2 border-t border-amber-200 text-[10.5px] text-amber-800">
                  <strong>Tip for Standalone Apps:</strong> If the live camera feed is blocked by your OS, you can also use the <em>"Take Photo via System Camera"</em> button below, which invokes your phone's native camera directly.
                </div>
              )}
            </div>
          )}

          {/* Direct File Inputs (Accessible & Reliable for Standalone PWA / WebViews) */}
          <input
            id="scanner-camera-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleFileChange}
          />
          <input
            id="scanner-gallery-input"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFileChange}
          />

          {/* Native Alternative Buttons Row */}
          {!previewUrl && !isManualEntry && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label
                htmlFor="scanner-camera-input"
                className="cursor-pointer py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-center border border-gray-200"
              >
                <Camera size={14} className="text-indigo-600 shrink-0" />
                <span className="truncate">System Camera</span>
              </label>

              <label
                htmlFor="scanner-gallery-input"
                className="cursor-pointer py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-center border border-gray-200"
              >
                <ImageIcon size={14} className="text-indigo-600 shrink-0" />
                <span className="truncate">Photo Gallery</span>
              </label>
            </div>
          )}

          {/* Initial Controls (Manual Switch) */}
          {!previewUrl && !isManualEntry && (
            <button
              type="button"
              onClick={handleManualEntryMode}
              className="w-full py-2.5 flex items-center justify-center text-indigo-700 text-xs font-bold bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl transition"
            >
              <Keyboard size={15} className="mr-1.5" />
              <span>Or Enter Odometer Reading Manually</span>
            </button>
          )}

          {/* Form Fields: Displayed in Manual Mode OR After Photo Snapped */}
          {(previewUrl || isManualEntry) && (
            <div className="space-y-4 animate-fade-in pt-1">
              {/* Trip Started Summary if end of trip */}
              {mode === 'end' && initialData && (
                <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl p-3 text-xs">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-800 uppercase tracking-wide mb-1.5">
                    <Car size={12} />
                    <span>Trip Started Baseline</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-indigo-400 block">Departure Time</span>
                      <span className="font-semibold text-indigo-950">
                        {new Date(initialData.start.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-indigo-400 block">Start Odometer</span>
                      <span className="font-mono font-bold text-indigo-950">
                        {initialData.start.value.toLocaleString()} {distanceUnit}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vehicle Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Vehicle
                </label>
                <div className="relative">
                  {isAddingVehicle ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newVehicleInput}
                        onChange={(e) => setNewVehicleInput(e.target.value)}
                        placeholder="Enter Registration"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono font-bold"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={saveNewVehicle}
                        className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingVehicle(false)}
                        className="p-2 text-gray-400 border border-gray-200 rounded-xl"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Car size={15} />
                      </div>
                      <select
                        value={selectedVehicle}
                        onChange={handleVehicleChange}
                        className="w-full pl-9 pr-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-semibold text-gray-800"
                      >
                        <option value="">Select Vehicle...</option>
                        {vehicles.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                        <option value="__NEW__" className="font-semibold text-indigo-600">
                          + Add New Vehicle...
                        </option>
                      </select>
                    </>
                  )}
                </div>
              </div>

              {/* Odometer Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  {mode === 'end' ? `Dashboard Reading (${distanceUnit})` : `Odometer Reading (${distanceUnit})`}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={manualOverride}
                    onChange={(e) => {
                      setManualOverride(e.target.value);
                      setError(null);
                    }}
                    placeholder={isProcessing ? 'Analyzing...' : 'Enter reading...'}
                    className={`w-full pl-4 pr-12 py-3 text-lg font-mono font-bold bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 ${
                      isProcessing ? 'animate-pulse' : ''
                    }`}
                    autoFocus={isManualEntry}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold uppercase">
                    {distanceUnit}
                  </div>
                </div>
                {scannedValue !== null && scannedValue > 0 && !error && (
                  <p className="text-emerald-600 text-[11px] font-semibold flex items-center gap-1 mt-1">
                    <CheckCircle2 size={12} />
                    <span>AI auto-detected from dashboard photo</span>
                  </p>
                )}
              </div>

              {/* Trip Type Toggle (Only if not a calibration-only scan) */}
              {!title?.includes('Calibration') && (
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTripType('work')}
                    className={`flex items-center justify-center py-2 text-xs font-bold rounded-lg transition ${
                      tripType === 'work' ? 'bg-white text-indigo-600 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <Briefcase size={14} className="mr-1.5" />
                    <span>Work</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTripType('personal')}
                    className={`flex items-center justify-center py-2 text-xs font-bold rounded-lg transition ${
                      tripType === 'personal' ? 'bg-white text-emerald-600 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <User size={14} className="mr-1.5" />
                    <span>Personal</span>
                  </button>
                </div>
              )}

              {/* Optional Client Name */}
              {!title?.includes('Calibration') && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-gray-700">Client Name (Optional)</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Enter client name..."
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800"
                  />
                </div>
              )}

              {/* Notes / Reason */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-700">
                  {title?.includes('Calibration') ? 'Calibration Notes' : 'Reason for Journey (ATO requirement)'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={title?.includes('Calibration') ? 'ATO Monthly Calibration & Cluster Sync' : 'e.g. Client meeting / Onsite consultation'}
                  className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-gray-800"
                  rows={2}
                />
              </div>

              {/* Error Box */}
              {error && (
                <div className="flex items-center text-red-600 text-xs font-medium bg-red-50 p-2.5 rounded-xl border border-red-200">
                  <AlertCircle size={15} className="mr-2 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    if (isManualEntry) {
                      onCancel();
                    } else {
                      setPreviewUrl(null);
                      startLiveCamera();
                    }
                  }}
                  disabled={isProcessing}
                  className="py-3 px-4 border border-gray-200 rounded-xl text-gray-700 font-bold hover:bg-gray-50 transition text-xs flex items-center justify-center gap-1.5"
                >
                  {isManualEntry ? 'Cancel' : <><RotateCw size={14} /> Retake</>}
                </button>

                <button
                  type="button"
                  onClick={confirmValue}
                  disabled={isProcessing && !manualOverride}
                  className="py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-200 transition text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isProcessing && !manualOverride && <Loader2 className="animate-spin" size={14} />}
                  <span>Confirm Reading</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
