import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  Settings,
  RotateCcw,
  Folder,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Smartphone,
  Upload,
  Download,
  AlertTriangle,
  Check,
  Car,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Unplug,
  Navigation,
  Camera,
  Sun,
  Bluetooth,
  Shield,
  UserX,
  Info,
  CheckCircle2,
  ExternalLink,
  Zap,
  Sparkles,
  MapPin,
  FileSpreadsheet,
  Play,
  Square,
  Lock,
  Compass,
  ArrowRight,
  Bell,
  BellOff,
  BellRing,
  Clock,
  FileCheck,
  Gauge,
  Home
} from 'lucide-react';
import { Backup, BluetoothConfig } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { HomeWorkLocationSettings } from './HomeWorkLocationSettings';
import { isWebBluetoothSupported } from '../services/bluetoothService';
import {
  getNotificationStatus,
  getNotificationPreferences,
  saveNotificationPreferences,
  requestNotificationPermission,
  sendTestNotification,
  NotificationStatus,
  NotificationPreferences,
} from '../services/pushNotificationService';

export type SettingsTab = 'setup' | 'automation' | 'locations' | 'notifications' | 'data' | 'guide' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  backups: Backup[];
  externalBackups: Backup[];
  hasExternalStorage: boolean;
  connectedFolderName: string | null;
  onConnectFolder: () => Promise<boolean>;
  onRefreshExternal: () => void;
  onRestoreSnapshot: (backup: Backup, isExternal: boolean) => void;
  onDownloadSnapshot: (backup: Backup) => void;
  onRestoreFile: (file: File) => void;
  installPrompt?: any;
  onInstall?: () => void;
  onArchiveAndReset: () => void;
  vehicles: string[];
  onAddVehicle: (reg: string) => void;
  onDeleteVehicle: (reg: string) => void;
  onEditVehicle: (oldReg: string, newReg: string) => void;
  distanceUnit?: 'km' | 'mi';
  onDistanceUnitChange?: (unit: 'km' | 'mi') => void;
  onDisconnectFolder: () => void;
  trackingMode?: 'camera' | 'gps';
  onTrackingModeChange?: (mode: 'camera' | 'gps') => void;
  keepScreenAwake?: boolean;
  onKeepScreenAwakeChange?: (val: boolean) => void;
  highAccuracy?: boolean;
  onHighAccuracyChange?: (val: boolean) => void;
  bluetoothConfig?: BluetoothConfig;
  onSaveBluetoothConfig?: (config: BluetoothConfig) => void;
  onOpenBluetoothSetup?: () => void;
  passengerMode?: boolean;
  onPassengerModeToggle?: (val: boolean) => void;
  isTripActive?: boolean;
  onSimulateConnect?: () => void;
  onSimulateDisconnect?: () => void;
  onOpenCalibration?: (vehicleReg?: string) => void;
  showNotification?: (msg: string, type?: 'success' | 'error') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'setup',
  backups,
  externalBackups,
  hasExternalStorage,
  connectedFolderName,
  onConnectFolder,
  onRefreshExternal,
  onRestoreSnapshot,
  onDownloadSnapshot,
  onRestoreFile,
  installPrompt,
  onInstall,
  onArchiveAndReset,
  vehicles,
  onAddVehicle,
  onDeleteVehicle,
  onEditVehicle,
  distanceUnit = 'km',
  onDistanceUnitChange,
  onDisconnectFolder,
  trackingMode = 'gps',
  onTrackingModeChange,
  keepScreenAwake = true,
  onKeepScreenAwakeChange,
  highAccuracy = true,
  onHighAccuracyChange,
  bluetoothConfig,
  onSaveBluetoothConfig,
  onOpenBluetoothSetup,
  passengerMode = false,
  onPassengerModeToggle,
  isTripActive = false,
  onSimulateConnect,
  onSimulateDisconnect,
  onOpenCalibration,
  showNotification
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<SettingsTab>(initialTab);
  const [snapshotStorageTab, setSnapshotStorageTab] = useState<'external' | 'local'>('external');
  const [isIframe, setIsIframe] = useState(false);
  const [newVehicle, setNewVehicle] = useState('');
  
  // Edit Vehicle State
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editVehicleValue, setEditVehicleValue] = useState('');
  
  // Confirmation states
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [isRestoreConfirming, setIsRestoreConfirming] = useState(false);

  // Guide Accordion State
  const [openGuideSection, setOpenGuideSection] = useState<string>('gps-tracking');

  // App Update Check State
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'update-available' | 'offline'>('idle');
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);

  // App Build Info
  const APP_VERSION = "2.0.0";
  const APP_BUILD_DATE = "2026-09-25";

  // Detect Locale
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;

  // Push Notifications State
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>(getNotificationStatus());
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(getNotificationPreferences());
  const [testNotificationRunning, setTestNotificationRunning] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNotificationStatus(getNotificationStatus());
      setNotificationPrefs(getNotificationPreferences());
    }
  }, [isOpen, activeWorkflowTab]);

  const handleToggleMasterNotifications = async () => {
    if (!notificationStatus.supported) {
      alert("Push notifications are not supported by this browser.");
      return;
    }

    if (notificationStatus.permission !== 'granted') {
      const granted = await requestNotificationPermission();
      const updatedStatus = getNotificationStatus();
      setNotificationStatus(updatedStatus);
      setNotificationPrefs(updatedStatus.preferences);
      if (granted) {
        showNotification?.("Push notifications enabled! You will receive trip alerts.", "success");
        sendTestNotification('started', distanceUnit);
      } else if (Notification.permission === 'denied') {
        showNotification?.("Notifications blocked in browser. Please unblock in browser site settings.", "error");
      }
      return;
    }

    const nextEnabled = !notificationPrefs.enabled;
    const updated = saveNotificationPreferences({ enabled: nextEnabled });
    setNotificationPrefs(updated);
    setNotificationStatus(getNotificationStatus());
    showNotification?.(
      nextEnabled ? "Push notifications enabled!" : "Push notifications paused.",
      nextEnabled ? "success" : "error"
    );
  };

  const handleTogglePref = (key: keyof Omit<NotificationPreferences, 'enabled'>) => {
    const updated = saveNotificationPreferences({ [key]: !notificationPrefs[key] });
    setNotificationPrefs(updated);
    setNotificationStatus(getNotificationStatus());
  };

  const handleRunTestNotification = async (type: 'started' | 'ended' | 'verification' | 'calibration') => {
    if (notificationStatus.permission !== 'granted') {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showNotification?.("Please allow notifications to send a test.", "error");
        return;
      }
      setNotificationStatus(getNotificationStatus());
      setNotificationPrefs(getNotificationPreferences());
    }

    setTestNotificationRunning(type);
    try {
      const ok = await sendTestNotification(type, distanceUnit);
      if (ok) {
        const label = type === 'started'
          ? 'Trip Started'
          : type === 'ended'
          ? 'Trip Ended'
          : type === 'calibration'
          ? 'Monthly Calibration'
          : 'Trips Awaiting Verification';
        showNotification?.(`Sent test ${label} notification!`, "success");
      } else {
        showNotification?.("Could not display notification. Check browser permissions.", "error");
      }
    } finally {
      setTimeout(() => setTestNotificationRunning(null), 1000);
    }
  };

  useEffect(() => {
    try {
      setIsIframe(window.self !== window.top);
    } catch (e) {
      setIsIframe(true);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveWorkflowTab(initialTab);
      setIsResetConfirming(false);
      setIsRestoreConfirming(false);
      setNewVehicle('');
      setEditingVehicleId(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onRestoreFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsRestoreConfirming(false);
  };

  const handleConnectClick = async () => {
    if (isIframe) return;
    const success = await onConnectFolder();
    if (!success) {
      alert("Could not connect folder. Please try opening the app in a full window.");
    }
  };

  const handleAddVehicleClick = () => {
    if (newVehicle.trim()) {
      onAddVehicle(newVehicle.trim().toUpperCase());
      setNewVehicle('');
    }
  };
  
  const startEditingVehicle = (reg: string) => {
    setEditingVehicleId(reg);
    setEditVehicleValue(reg);
  };
  
  const saveEditedVehicle = (oldReg: string) => {
    if (editVehicleValue.trim() && editVehicleValue !== oldReg) {
      onEditVehicle(oldReg, editVehicleValue);
    }
    setEditingVehicleId(null);
  };
  
  const cancelEditVehicle = () => {
    setEditingVehicleId(null);
    setEditVehicleValue('');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Check for app updates
  const handleCheckForUpdates = async () => {
    if (typeof navigator === 'undefined' || !navigator.onLine) {
      setUpdateStatus('offline');
      return;
    }

    setUpdateStatus('checking');

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          // Check if there is a waiting worker
          if (registration.waiting) {
            setUpdateStatus('update-available');
          } else {
            // Emulate quick network handshake check
            await new Promise((res) => setTimeout(res, 900));
            setUpdateStatus('latest');
          }
        } else {
          await new Promise((res) => setTimeout(res, 800));
          setUpdateStatus('latest');
        }
      } else {
        await new Promise((res) => setTimeout(res, 800));
        setUpdateStatus('latest');
      }
    } catch (err) {
      console.warn('Update check failed:', err);
      setUpdateStatus('latest');
    }

    setLastCheckTime(new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
  };

  const handleApplyUpdate = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col border border-gray-100">
        
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-xs">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Settings & Guide
              </h2>
              <p className="text-[11px] text-gray-500 font-medium">
                EasyLogAuto v{APP_VERSION} • Setup, Automation & User Guide
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </div>

        {/* Workflow Tab Bar - Stacked Grid so all options are visible without swiping */}
        <div className="bg-gray-50/95 border-b border-gray-200/80 p-2 shrink-0">
          <div className="grid grid-cols-3 gap-1.5">
            {/* Tab 1: Setup */}
            <button
              type="button"
              onClick={() => setActiveWorkflowTab('setup')}
              className={`flex items-center justify-center space-x-1.5 px-2 py-2 rounded-xl text-xs font-bold transition text-center ${
                activeWorkflowTab === 'setup'
                  ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60 bg-gray-100/50'
              }`}
            >
              <Car size={14} className={activeWorkflowTab === 'setup' ? 'text-indigo-600' : 'text-gray-400'} />
              <span className="truncate">1. Cars</span>
            </button>

            {/* Tab 2: Automation */}
            <button
              type="button"
              onClick={() => setActiveWorkflowTab('automation')}
              className={`flex items-center justify-center space-x-1.5 px-2 py-2 rounded-xl text-xs font-bold transition text-center ${
                activeWorkflowTab === 'automation'
                  ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60 bg-gray-100/50'
              }`}
            >
              <Zap size={14} className={activeWorkflowTab === 'automation' ? 'text-amber-500 fill-amber-500' : 'text-gray-400'} />
              <span className="truncate">2. Auto</span>
            </button>

            {/* Tab 3: Home & Work */}
            <button
              type="button"
              onClick={() => setActiveWorkflowTab('locations')}
              className={`flex items-center justify-center space-x-1.5 px-2 py-2 rounded-xl text-xs font-bold transition text-center ${
                activeWorkflowTab === 'locations'
                  ? 'bg-white text-emerald-700 shadow-sm border border-emerald-300'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60 bg-gray-100/50'
              }`}
            >
              <Home size={14} className={activeWorkflowTab === 'locations' ? 'text-emerald-600' : 'text-gray-400'} />
              <span className="truncate">3. Home & Work</span>
            </button>

            {/* Tab 4: Notifications */}
            <button
              type="button"
              onClick={() => setActiveWorkflowTab('notifications')}
              className={`flex items-center justify-center space-x-1.5 px-2 py-2 rounded-xl text-xs font-bold transition text-center ${
                activeWorkflowTab === 'notifications'
                  ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60 bg-gray-100/50'
              }`}
            >
              <Bell size={14} className={activeWorkflowTab === 'notifications' ? 'text-indigo-600' : 'text-gray-400'} />
              <span className="truncate">4. Alerts</span>
              {notificationStatus.enabled && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              )}
            </button>

            {/* Tab 5: Data */}
            <button
              type="button"
              onClick={() => setActiveWorkflowTab('data')}
              className={`flex items-center justify-center space-x-1.5 px-2 py-2 rounded-xl text-xs font-bold transition text-center ${
                activeWorkflowTab === 'data'
                  ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60 bg-gray-100/50'
              }`}
            >
              <HardDrive size={14} className={activeWorkflowTab === 'data' ? 'text-emerald-600' : 'text-gray-400'} />
              <span className="truncate">5. Backup</span>
            </button>

            {/* Tab 6: Guide */}
            <button
              type="button"
              onClick={() => setActiveWorkflowTab('guide')}
              className={`flex items-center justify-center space-x-1.5 px-2 py-2 rounded-xl text-xs font-bold transition text-center ${
                activeWorkflowTab === 'guide'
                  ? 'bg-white text-indigo-700 shadow-sm border border-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60 bg-gray-100/50'
              }`}
            >
              <BookOpen size={14} className={activeWorkflowTab === 'guide' ? 'text-blue-600' : 'text-gray-400'} />
              <span className="truncate">6. Guide</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 space-y-6 overflow-y-auto text-xs text-gray-700">

          {/* ========================================================================= */}
          {/* TAB 1: INITIAL SETUP & VEHICLES                                            */}
          {/* ========================================================================= */}
          {activeWorkflowTab === 'setup' && (
            <div className="space-y-5 animate-fade-in">
              
              {/* Getting Started Checklist Banner */}
              <div className="bg-gradient-to-r from-indigo-50/80 to-blue-50/60 border border-indigo-200/80 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-900 text-xs flex items-center">
                    <Sparkles size={14} className="mr-1.5 text-indigo-600" />
                    Quick Start Checklist
                  </div>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                    Step 1 of 3
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] text-gray-600">
                  <div className="flex items-center text-gray-800 font-medium">
                    <CheckCircle2 size={13} className="mr-2 text-emerald-600 shrink-0" />
                    <span>Selected Distance Unit: <strong>{distanceUnit === 'km' ? 'Kilometers (km)' : 'Miles (mi)'}</strong></span>
                  </div>
                  <div className="flex items-center text-gray-800 font-medium">
                    {vehicles.length > 0 ? (
                      <CheckCircle2 size={13} className="mr-2 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-500 mr-2 shrink-0"></span>
                    )}
                    <span>
                      {vehicles.length > 0
                        ? `${vehicles.length} vehicle(s) configured (${vehicles.join(', ')})`
                        : 'Add at least one vehicle registration below'}
                    </span>
                  </div>
                  <div className="flex items-center text-gray-800 font-medium">
                    <CheckCircle2 size={13} className="mr-2 text-emerald-600 shrink-0" />
                    <span>Mode: <strong>{trackingMode === 'gps' ? 'Automatic GPS Drive Tracking' : 'Camera Odometer Scanner'}</strong></span>
                  </div>
                </div>
              </div>

              {/* Distance Unit Selector */}
              {onDistanceUnitChange && (
                <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 text-xs flex items-center">
                        <Compass size={14} className="mr-1.5 text-indigo-600" />
                        Distance Units & Formatting
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        Choose your preferred measurement for odometer and GPS trips
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-white rounded-xl p-1 border border-gray-200">
                    <button
                      type="button"
                      onClick={() => onDistanceUnitChange('km')}
                      className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 ${
                        distanceUnit === 'km'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <span>Metric (Kilometers - km)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDistanceUnitChange('mi')}
                      className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 ${
                        distanceUnit === 'mi'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <span>Imperial (Miles - mi)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Vehicle Fleet Management */}
              <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs flex items-center">
                      <Car size={14} className="mr-1.5 text-indigo-600" />
                      Vehicle Registrations & Fleet
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      Add the vehicles you drive. Trips will be tagged automatically.
                    </p>
                  </div>
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 font-bold px-2 py-0.5 rounded-full">
                    {vehicles.length} Vehicle{vehicles.length === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Add Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newVehicle}
                    onChange={(e) => setNewVehicle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddVehicleClick()}
                    placeholder="Enter Rego / License Plate (e.g. ABC-123)"
                    className="flex-1 px-3 py-2 text-xs font-mono font-semibold bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleAddVehicleClick}
                    disabled={!newVehicle.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center space-x-1 shadow-xs"
                  >
                    <Plus size={15} />
                    <span>Add</span>
                  </button>
                </div>

                {/* Vehicle List */}
                {vehicles.length === 0 ? (
                  <div className="text-center py-4 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400 text-xs">
                    No vehicles registered yet. Add your vehicle above.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {vehicles.map((reg, index) => (
                      <div
                        key={reg}
                        className="flex justify-between items-center bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-2xs hover:border-gray-300 transition"
                      >
                        {editingVehicleId === reg ? (
                          <div className="flex gap-2 w-full items-center">
                            <input
                              type="text"
                              value={editVehicleValue}
                              onChange={(e) => setEditVehicleValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditedVehicle(reg);
                                if (e.key === 'Escape') cancelEditVehicle();
                              }}
                              className="flex-1 text-xs font-mono font-bold border border-indigo-300 rounded-lg px-2 py-1 uppercase outline-none focus:ring-1 focus:ring-indigo-500"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => saveEditedVehicle(reg)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                              title="Save"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditVehicle}
                              className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                {reg}
                              </span>
                              {index === 0 && (
                                <span className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-1">
                              {onOpenCalibration && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onOpenCalibration(reg);
                                  }}
                                  className="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 border border-amber-200"
                                  title="Calibrate physical dashboard cluster"
                                >
                                  <Gauge size={11} />
                                  <span>Calibrate</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startEditingVehicle(reg)}
                                className="text-gray-400 hover:text-indigo-600 p-1 rounded-lg hover:bg-gray-50 transition"
                                title="Edit Registration"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteVehicle(reg)}
                                className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition"
                                title="Remove Vehicle"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Install PWA Mobile App Card */}
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center space-x-2 text-indigo-900 font-bold text-xs">
                  <Smartphone size={16} className="text-indigo-600" />
                  <span>Phone App Installation (PWA)</span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Install EasyLog to your phone's home screen for full-screen standalone GPS tracking, offline logging, and instant car launch.
                </p>
                <PWAInstallButton variant="modal" />
                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 pt-1">
                  <div className="bg-white/80 p-2 rounded-xl border border-indigo-100">
                    <strong> iPhone:</strong> Tap Safari <strong>Share</strong> button → <strong>Add to Home Screen</strong>.
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-indigo-100">
                    <strong>🤖 Android:</strong> Tap Chrome <strong>Menu (⋮)</strong> → <strong>Install App</strong>.
                  </div>
                </div>
              </div>

              {/* Next step teaser */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('automation')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Next: Configure Automation</span>
                  <ArrowRight size={13} />
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: GPS & AUTOMATION                                                    */}
          {/* ========================================================================= */}
          {activeWorkflowTab === 'automation' && (
            <div className="space-y-5 animate-fade-in">
              
              {/* Trip Tracking Mode Toggle */}
              {onTrackingModeChange && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 text-xs flex items-center">
                        <Navigation size={14} className="mr-1.5 text-indigo-600" />
                        Trip Tracking Mode
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        Select how trips are recorded when you drive
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      trackingMode === 'gps' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                    }`}>
                      {trackingMode === 'gps' ? 'Automatic GPS' : 'Camera Scanner'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* GPS Mode Card */}
                    <button
                      type="button"
                      onClick={() => onTrackingModeChange('gps')}
                      className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                        trackingMode === 'gps'
                          ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-xl ${trackingMode === 'gps' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600'}`}>
                          <Navigation size={16} />
                        </div>
                        {trackingMode === 'gps' && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-gray-900">
                        Automatic GPS
                      </div>
                      <p className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">
                        Real-time distance tracking, live speedometer HUD, and automatic street addresses.
                      </p>
                    </button>

                    {/* Camera Only Card */}
                    <button
                      type="button"
                      onClick={() => onTrackingModeChange('camera')}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        trackingMode === 'camera'
                          ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-xl ${trackingMode === 'camera' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600'}`}>
                          <Camera size={16} />
                        </div>
                        {trackingMode === 'camera' && (
                          <Check size={16} className="text-indigo-600" />
                        )}
                      </div>
                      <div className="text-xs font-bold text-gray-900">
                        Camera Only
                      </div>
                      <p className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">
                        Snap odometer photos at trip start & end. Gemini AI reads values automatically.
                      </p>
                    </button>
                  </div>

                  {/* GPS Mode Sub-options */}
                  {trackingMode === 'gps' && (
                    <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 space-y-2.5 animate-fade-in text-xs">
                      {onKeepScreenAwakeChange && (
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="pr-2">
                            <span className="font-semibold text-gray-800 flex items-center">
                              <Sun size={13} className="mr-1.5 text-amber-500" />
                              Keep Screen Awake While Driving
                            </span>
                            <p className="text-[10.5px] text-gray-500">Prevents phone display from sleeping while on your car phone mount</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={keepScreenAwake}
                            onChange={(e) => onKeepScreenAwakeChange(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          />
                        </label>
                      )}

                      {onHighAccuracyChange && (
                        <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-emerald-100">
                          <div className="pr-2">
                            <span className="font-semibold text-gray-800 flex items-center">
                              <Navigation size={13} className="mr-1.5 text-emerald-600" />
                              High-Accuracy Mobile GPS
                            </span>
                            <p className="text-[10.5px] text-gray-500">Uses satellite GPS fixes for exact distance and route mapping</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={highAccuracy}
                            onChange={(e) => onHighAccuracyChange(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Car Bluetooth Automation & Passenger Protection */}
              <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white border border-blue-200/80 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-900 text-xs flex items-center">
                    <Bluetooth size={15} className="mr-1.5 text-blue-600" />
                    Car Bluetooth Sync & Passenger Shield
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    bluetoothConfig?.deviceName ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {bluetoothConfig?.deviceName ? 'Configured' : 'Setup Ready'}
                  </span>
                </div>

                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Start tracking automatically when your phone connects to your car stereo, and save the trip when you turn off the engine. Trips in <strong>Ubers, taxis, trains, or friends' cars</strong> are ignored.
                </p>

                {/* Device Status Box */}
                <div className="bg-white rounded-xl p-3 border border-blue-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">
                      Target Car Bluetooth
                    </span>
                    <span className="font-bold text-gray-800 text-xs">
                      {bluetoothConfig?.deviceName || 'Not specified yet'}
                    </span>
                    {bluetoothConfig?.vehicleReg && (
                      <span className="text-[10px] text-indigo-600 font-mono font-semibold ml-2 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {bluetoothConfig.vehicleReg}
                      </span>
                    )}
                  </div>

                  {onOpenBluetoothSetup && (
                    <button
                      type="button"
                      onClick={onOpenBluetoothSetup}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1"
                    >
                      <Zap size={12} className="fill-current" />
                      <span>Tasker & iOS Setup</span>
                    </button>
                  )}
                </div>

                {/* Passenger Mode Toggle */}
                {onPassengerModeToggle && (
                  <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-center justify-between">
                    <div className="pr-2">
                      <span className="font-bold text-amber-950 text-xs flex items-center">
                        <UserX size={13} className="mr-1.5 text-amber-600" />
                        Passenger Mode Quick-Toggle
                      </span>
                      <p className="text-[10.5px] text-amber-800">
                        Temporarily suspend auto-tracking while riding as a passenger
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={passengerMode}
                      onChange={(e) => onPassengerModeToggle(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                    />
                  </div>
                )}
              </div>

              {/* Simulation Sandbox */}
              {(onSimulateConnect || onSimulateDisconnect) && (
                <div className="bg-gray-900 text-white rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center text-indigo-300">
                      <Sparkles size={14} className="mr-1.5 text-indigo-400" />
                      Live Drive Simulation
                    </span>
                    <span className="text-[10px] text-gray-400">Test right now</span>
                  </div>
                  <p className="text-[11px] text-gray-300">
                    Verify audio chimes, notifications, and GPS tracking HUD without being in your car:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isTripActive}
                      onClick={() => {
                        onSimulateConnect?.();
                        onClose();
                      }}
                      className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                        isTripActive
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                      }`}
                    >
                      <Play size={12} className="fill-current" />
                      <span>Simulate Connect</span>
                    </button>
                    <button
                      type="button"
                      disabled={!isTripActive}
                      onClick={() => {
                        onSimulateDisconnect?.();
                        onClose();
                      }}
                      className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                        !isTripActive
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs'
                      }`}
                    >
                      <Square size={12} className="fill-current" />
                      <span>Simulate Disconnect</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('setup')}
                  className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-xs font-semibold"
                >
                  ← Back to Setup
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('locations')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Next: Home & Work</span>
                  <ArrowRight size={13} />
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: HOME & WORK LOCATIONS (ATO COMMUTE RULES)                          */}
          {/* ========================================================================= */}
          {activeWorkflowTab === 'locations' && (
            <div className="space-y-5 animate-fade-in">
              <HomeWorkLocationSettings showNotification={showNotification} />

              {/* Navigation buttons */}
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('automation')}
                  className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-xs font-semibold"
                >
                  ← Back to GPS & Auto
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('notifications')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Next: Notifications</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: NOTIFICATIONS & DRIVE ALERTS                                       */}
          {/* ========================================================================= */}
          {activeWorkflowTab === 'notifications' && (
            <div className="space-y-5 animate-fade-in">
              
              {/* Status Header Banner */}
              <div className="bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-white border border-indigo-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                      <BellRing size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-xs">
                        Push Notifications & Alerts
                      </h3>
                      <p className="text-[11px] text-gray-500">
                        Stay informed when drives start, end, or await verification
                      </p>
                    </div>
                  </div>
                  <div>
                    {!notificationStatus.supported ? (
                      <span className="text-[10px] bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-full">
                        Unsupported
                      </span>
                    ) : notificationStatus.permission === 'denied' ? (
                      <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                        Blocked
                      </span>
                    ) : notificationStatus.permission === 'default' ? (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                        Needs Permission
                      </span>
                    ) : notificationStatus.enabled ? (
                      <span className="flex items-center text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] bg-gray-100 text-gray-700 font-bold px-2 py-0.5 rounded-full">
                        Paused
                      </span>
                    )}
                  </div>
                </div>

                {/* Master Push Toggle Card */}
                <div className="bg-white rounded-xl p-3.5 border border-indigo-100 shadow-2xs flex items-center justify-between">
                  <div className="pr-3">
                    <span className="font-bold text-gray-900 text-xs flex items-center">
                      <Bell size={13} className="mr-1.5 text-indigo-600" />
                      Allow Push Notifications
                    </span>
                    <p className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">
                      Receive lock-screen alerts when car trips begin, complete, or require verification.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleMasterNotifications}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      notificationStatus.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={notificationStatus.enabled}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        notificationStatus.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {notificationStatus.permission === 'denied' && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start space-x-2 text-[11px] text-rose-800">
                    <AlertTriangle size={15} className="text-rose-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">Notifications are blocked in your browser</p>
                      <p className="text-[10.5px] text-rose-700 mt-0.5">
                        To enable alerts, tap the lock/tune icon near the address bar at the top of your browser and select "Allow" for Notifications.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Individual Trigger Options */}
              <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3.5">
                <div>
                  <h3 className="font-bold text-gray-900 text-xs">
                    Notification Types & Triggers
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Choose which vehicle events trigger an instant notification
                  </p>
                </div>

                {/* Trigger 1: Trip Started */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200/90 shadow-2xs space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5 pr-2">
                      <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg mt-0.5 shrink-0">
                        <Play size={13} className="fill-current" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-xs">
                          Trip Started Alert
                        </div>
                        <p className="text-[10.5px] text-gray-500 leading-snug mt-0.5">
                          Alerts immediately when GPS tracking begins or your phone connects to car Bluetooth.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.notifyTripStarted}
                        onChange={() => handleTogglePref('notifyTripStarted')}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  <div className="flex justify-end pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      disabled={testNotificationRunning === 'started'}
                      onClick={() => handleRunTestNotification('started')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition flex items-center space-x-1"
                    >
                      <Bell size={11} />
                      <span>{testNotificationRunning === 'started' ? 'Sending...' : 'Test Started Alert'}</span>
                    </button>
                  </div>
                </div>

                {/* Trigger 2: Trip Ended */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200/90 shadow-2xs space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5 pr-2">
                      <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg mt-0.5 shrink-0">
                        <Square size={13} className="fill-current" />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-xs">
                          Trip Ended Alert
                        </div>
                        <p className="text-[10.5px] text-gray-500 leading-snug mt-0.5">
                          Shows completed distance, driving duration, and destination address when engine turns off.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.notifyTripEnded}
                        onChange={() => handleTogglePref('notifyTripEnded')}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  <div className="flex justify-end pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      disabled={testNotificationRunning === 'ended'}
                      onClick={() => handleRunTestNotification('ended')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition flex items-center space-x-1"
                    >
                      <Bell size={11} />
                      <span>{testNotificationRunning === 'ended' ? 'Sending...' : 'Test Ended Alert'}</span>
                    </button>
                  </div>
                </div>

                {/* Trigger 3: Trips Awaiting Verification */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200/90 shadow-2xs space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5 pr-2">
                      <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg mt-0.5 shrink-0">
                        <FileCheck size={13} />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-xs">
                          Trips Awaiting Verification
                        </div>
                        <p className="text-[10.5px] text-gray-500 leading-snug mt-0.5">
                          Reminds you to review pending trips, select Work vs Personal, and add business reason for ATO logbook compliance.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.notifyAwaitingVerification}
                        onChange={() => handleTogglePref('notifyAwaitingVerification')}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>

                  <div className="flex justify-end pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      disabled={testNotificationRunning === 'verification'}
                      onClick={() => handleRunTestNotification('verification')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition flex items-center space-x-1"
                    >
                      <Bell size={11} />
                      <span>{testNotificationRunning === 'verification' ? 'Sending...' : 'Test Verification Alert'}</span>
                    </button>
                  </div>
                </div>

                {/* Trigger 4: Monthly Odometer Calibration */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200/90 shadow-2xs space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5 pr-2">
                      <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg mt-0.5 shrink-0">
                        <Gauge size={13} />
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                          <span>Monthly Odometer Calibration Due</span>
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                            ATO Compliance
                          </span>
                        </div>
                        <p className="text-[10.5px] text-gray-500 leading-snug mt-0.5">
                          Alerts automatically when your phone disconnects from car Bluetooth or every 30 days until your physical dashboard cluster is synchronized.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.notifyCalibrationDue}
                        onChange={() => handleTogglePref('notifyCalibrationDue')}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>

                  <div className="flex justify-end pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      disabled={testNotificationRunning === 'calibration'}
                      onClick={() => handleRunTestNotification('calibration')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition flex items-center space-x-1"
                    >
                      <Bell size={11} />
                      <span>{testNotificationRunning === 'calibration' ? 'Sending...' : 'Test Calibration Alert'}</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Mobile PWA & iOS Tips Banner */}
              <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-200/80 rounded-2xl p-4 space-y-2">
                <div className="font-bold text-blue-950 text-xs flex items-center">
                  <Smartphone size={14} className="mr-1.5 text-blue-600" />
                  Mobile Device Compatibility
                </div>
                <div className="space-y-1 text-[10.5px] text-gray-600 leading-relaxed">
                  <p>
                    <strong>📱 iOS (iPhone / iPad):</strong> Apple Web Push requires iOS 16.4 or higher and adding EasyLogAuto to your Home Screen via Safari Share → Add to Home Screen.
                  </p>
                  <p>
                    <strong>🤖 Android:</strong> Works in Google Chrome, Samsung Internet, and when installed as a standalone PWA.
                  </p>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('automation')}
                  className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-xs font-semibold"
                >
                  ← Back to Automation
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('data')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Next: Backup & Storage</span>
                  <ArrowRight size={13} />
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: BACKUP & DATA STORAGE                                              */}
          {/* ========================================================================= */}
          {activeWorkflowTab === 'data' && (
            <div className="space-y-5 animate-fade-in">

              {/* Device Folder Connection (FileSystem Access API) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs flex items-center">
                      <Folder size={14} className="mr-1.5 text-indigo-600" />
                      Device Folder Backup Sync
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      Save JSON snapshots directly into a folder on your phone or computer
                    </p>
                  </div>
                </div>

                {!hasExternalStorage ? (
                  <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-2xl space-y-3">
                    <div className="flex items-start">
                      <AlertCircle size={16} className="text-amber-600 mt-0.5 mr-2 shrink-0" />
                      <div className="text-[11px] text-amber-900 leading-relaxed">
                        {isIframe ? (
                          <p className="font-semibold">
                            Folder selection is disabled inside preview iframe. Open EasyLog in a dedicated window or install as PWA.
                          </p>
                        ) : (
                          <p>
                            Connect a local folder (e.g. Documents or Google Drive folder) so EasyLog automatically saves a backup whenever you complete a trip.
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {!isIframe && (
                      <button 
                        type="button"
                        onClick={handleConnectClick}
                        className="w-full py-2.5 bg-white border border-amber-300 text-amber-900 font-bold rounded-xl shadow-xs hover:bg-amber-50 transition flex items-center justify-center text-xs"
                      >
                        <Folder size={14} className="mr-2 text-amber-600" />
                        Select Backup Folder on Device
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50/70 border border-emerald-200/80 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-emerald-900 text-xs font-bold">
                        <CheckCircle2 size={16} className="mr-2 text-emerald-600" />
                        Connected Folder: <span className="font-mono ml-1">{connectedFolderName || 'easylog'}</span>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      Snapshots are automatically saved to your chosen folder every time a trip finishes.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button 
                        type="button"
                        onClick={onConnectFolder}
                        className="py-2 bg-white border border-emerald-300 text-emerald-800 font-bold rounded-xl shadow-2xs hover:bg-emerald-100 transition flex items-center justify-center text-xs"
                      >
                        <RefreshCw size={13} className="mr-1.5 text-emerald-600" /> 
                        Reconnect Folder
                      </button>

                      <button 
                        type="button"
                        onClick={onDisconnectFolder}
                        className="py-2 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl shadow-2xs hover:bg-gray-50 transition flex items-center justify-center text-xs"
                      >
                        <Unplug size={13} className="mr-1.5 text-gray-500" /> 
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Export & Import Controls */}
              <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3">
                <h3 className="font-bold text-gray-900 text-xs flex items-center">
                  <Download size={14} className="mr-1.5 text-indigo-600" />
                  Instant JSON Export & Import
                </h3>
                <p className="text-[11px] text-gray-500">
                  Export your full trip history to a JSON file or restore from a previous backup.
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  <button 
                    type="button"
                    onClick={() => backups.length > 0 && onDownloadSnapshot(backups[0])}
                    disabled={backups.length === 0}
                    className="py-2.5 px-3 bg-white border border-gray-300 hover:border-gray-400 text-gray-800 text-xs font-bold rounded-xl transition flex items-center justify-center shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={14} className="mr-1.5 text-emerald-600" />
                    Export Latest Backup
                  </button>

                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2.5 px-3 bg-white border border-gray-300 hover:border-gray-400 text-gray-800 text-xs font-bold rounded-xl transition flex items-center justify-center shadow-2xs"
                  >
                    <Upload size={14} className="mr-1.5 text-indigo-600" />
                    Import Backup File
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept=".json"
                  />
                </div>
              </div>

              {/* Snapshot History Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-xs flex items-center">
                    <RotateCcw size={14} className="mr-1.5 text-indigo-600" />
                    Snapshot History
                  </h3>
                  <div className="flex space-x-1 bg-gray-100 p-0.5 rounded-lg text-[10px]">
                    <button 
                      type="button"
                      onClick={() => setSnapshotStorageTab('external')}
                      className={`px-2.5 py-1 font-bold rounded-md transition ${snapshotStorageTab === 'external' ? 'bg-white shadow-2xs text-gray-900' : 'text-gray-500'}`}
                    >
                      External Folder
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSnapshotStorageTab('local')}
                      className={`px-2.5 py-1 font-bold rounded-md transition ${snapshotStorageTab === 'local' ? 'bg-white shadow-2xs text-gray-900' : 'text-gray-500'}`}
                    >
                      Browser Cache
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {(snapshotStorageTab === 'external' ? externalBackups : backups).length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs bg-gray-50/50">
                      {snapshotStorageTab === 'external' && !hasExternalStorage 
                        ? (isIframe ? 'Open in dedicated tab to access local device storage.' : 'Connect a backup folder to view external snapshots.')
                        : 'No snapshots recorded yet.'}
                    </div>
                  ) : (
                    (snapshotStorageTab === 'external' ? externalBackups : backups).map((backup) => (
                      <div key={backup.id} className="border border-gray-200 bg-white rounded-xl p-3 hover:border-gray-300 transition flex justify-between items-center group">
                        <div className="overflow-hidden">
                          <div className="text-xs font-bold text-gray-800 truncate">
                            {new Date(backup.timestamp).toLocaleDateString(locale)}
                            <span className="text-gray-300 mx-1.5">•</span>
                            {new Date(backup.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {backup.tripCount} trip{backup.tripCount === 1 ? '' : 's'} • {formatBytes(backup.sizeBytes)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button 
                            type="button"
                            onClick={() => onRestoreSnapshot(backup, snapshotStorageTab === 'external')}
                            className="p-1.5 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                            title="Restore this version"
                          >
                            <RotateCcw size={15} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => onDownloadSnapshot(backup)}
                            className="p-1.5 text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                            title="Download JSON File"
                          >
                            <Download size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-50/60 border border-red-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center space-x-2 text-red-900 font-bold text-xs">
                  <AlertTriangle size={15} className="text-red-600" />
                  <span>Data Archive & Reset</span>
                </div>

                {!isResetConfirming && (
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-red-700 leading-snug pr-3">
                      Export a safe backup file and clear trip log records from this browser.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsResetConfirming(true)}
                      className="px-3 py-2 bg-white border border-red-300 text-red-700 font-bold rounded-xl text-xs hover:bg-red-50 transition shrink-0 shadow-2xs"
                    >
                      Archive & Reset
                    </button>
                  </div>
                )}

                {isResetConfirming && (
                  <div className="bg-white p-3 rounded-xl border border-red-200 space-y-2 animate-fade-in">
                    <p className="text-xs font-bold text-red-700">
                      Download full archive then clear all local trips?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onArchiveAndReset();
                          setIsResetConfirming(false);
                        }}
                        className="flex-1 py-2 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 transition flex items-center justify-center shadow-xs"
                      >
                        <Check size={14} className="mr-1" />
                        Confirm Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsResetConfirming(false)}
                        className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Next step teaser */}
              <div className="flex justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('notifications')}
                  className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-xs font-semibold"
                >
                  ← Back to Notifications
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('guide')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Next: User Guide</span>
                  <ArrowRight size={13} />
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: REVAMPED USER GUIDE                                                */}
          {/* ========================================================================= */}
          {activeWorkflowTab === 'guide' && (
            <div className="space-y-4 animate-fade-in">
              
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm flex items-center">
                    <BookOpen size={16} className="mr-2 text-indigo-600" />
                    Complete EasyLogAuto User Guide
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Master automatic GPS drive tracking, Bluetooth routines, and tax compliance
                  </p>
                </div>
              </div>

              {/* Accordion Guide Sections */}
              <div className="space-y-2.5">
                
                {/* GUIDE 1: Automatic GPS Drive Tracking */}
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setOpenGuideSection(openGuideSection === 'gps-tracking' ? '' : 'gps-tracking')}
                    className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/80 text-left font-bold text-xs text-gray-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center">
                      <Navigation size={15} className="mr-2 text-emerald-600" />
                      1. Automatic GPS Drive Tracking (Zero Photos Needed)
                    </span>
                    {openGuideSection === 'gps-tracking' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {openGuideSection === 'gps-tracking' && (
                    <div className="p-4 space-y-3 text-[11px] text-gray-700 leading-relaxed border-t border-gray-100 animate-fade-in">
                      <p>
                        With <strong>Automatic GPS Mode</strong> enabled, EasyLog tracks your vehicle's physical movement using high-precision satellite positioning:
                      </p>
                      <ul className="list-disc pl-4 space-y-1.5">
                        <li>
                          <strong>Starting a Trip:</strong> Tap <strong>Start Trip</strong> on the home screen (or connect via Car Bluetooth). EasyLog records your start time, starting street address, and initial odometer reading automatically.
                        </li>
                        <li>
                          <strong>Live Driving HUD:</strong> While driving, a dedicated heads-up display shows your current speed (km/h or mph), trip distance accumulated so far, GPS accuracy, and street address.
                        </li>
                        <li>
                          <strong>Screen Wake Lock:</strong> EasyLog keeps your phone screen illuminated while mounted in your car so you can glance at your speed and distance anytime.
                        </li>
                        <li>
                          <strong>Stationary Auto-Alert:</strong> If you stop driving for more than 3 minutes, EasyLog flags the trip as stationary to remind you to end it.
                        </li>
                        <li>
                          <strong>Ending a Trip:</strong> Tap <strong>End Trip</strong> (or disconnect your car). EasyLog reverse-geocodes your destination street address, calculates total distance, increments the vehicle odometer, and saves the trip.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* GUIDE 2: Hands-Free Car Bluetooth Automation */}
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setOpenGuideSection(openGuideSection === 'bluetooth-automation' ? '' : 'bluetooth-automation')}
                    className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/80 text-left font-bold text-xs text-gray-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center">
                      <Zap size={15} className="mr-2 text-amber-500 fill-amber-500" />
                      2. Hands-Free Car Bluetooth Automation (Tasker, iOS, Samsung)
                    </span>
                    {openGuideSection === 'bluetooth-automation' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {openGuideSection === 'bluetooth-automation' && (
                    <div className="p-4 space-y-3 text-[11px] text-gray-700 leading-relaxed border-t border-gray-100 animate-fade-in">
                      <p>
                        You can achieve <strong>100% hands-free trip logging</strong> without touching your phone when you get in and out of your car:
                      </p>
                      <div className="space-y-2 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                        <div className="font-bold text-indigo-900">⚡ Google Pixel & Android (Tasker):</div>
                        <p>
                          EasyLog includes a pre-built <strong>1-Click Tasker Profile (.prf.xml)</strong>. Open the <em>Car Bluetooth Setup</em> dialog, tap <strong>Download Tasker Profile</strong>, and import it into Tasker (`Profiles → Import Profile`). Set your car Bluetooth stereo as the trigger.
                        </p>
                      </div>
                      <div className="space-y-2 bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                        <div className="font-bold text-blue-900"> iPhone (Apple Shortcuts):</div>
                        <p>
                          Open the built-in <strong>Shortcuts</strong> app on iPhone → <strong>Automation</strong> → <strong>+</strong> → <strong>Bluetooth</strong> (select car audio) → <strong>Run Immediately</strong> → Add Action: <strong>Open URLs</strong> with your Start URL. Create a second disconnect automation with your End URL.
                        </p>
                      </div>
                      <div className="space-y-2 bg-purple-50/60 p-3 rounded-xl border border-purple-100">
                        <div className="font-bold text-purple-900">🤖 Samsung Galaxy (Modes & Routines):</div>
                        <p>
                          Go to <strong>Settings → Modes and Routines → Routines (+)</strong>. If: Bluetooth device connected → Then: Open website with Start URL. When routine ends: Open website with End URL.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* GUIDE 3: Zero Passenger Tracking Guarantee */}
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setOpenGuideSection(openGuideSection === 'passenger-mode' ? '' : 'passenger-mode')}
                    className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/80 text-left font-bold text-xs text-gray-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center">
                      <Shield size={15} className="mr-2 text-blue-600" />
                      3. Zero Passenger Tracking Guarantee
                    </span>
                    {openGuideSection === 'passenger-mode' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {openGuideSection === 'passenger-mode' && (
                    <div className="p-4 space-y-2.5 text-[11px] text-gray-700 leading-relaxed border-t border-gray-100 animate-fade-in">
                      <p>
                        A major complaint with generic mileage trackers is that they track you when you ride on a <strong>bus, train, Uber, or friend's car</strong>.
                      </p>
                      <p>
                        EasyLog solves this completely:
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>
                          <strong>Hardware Bluetooth Fence:</strong> Automatic tracking is tied exclusively to your vehicle's Bluetooth stereo. Since friends' cars and taxis do not have your car's Bluetooth, they are ignored.
                        </li>
                        <li>
                          <strong>Passenger Mode Toggle:</strong> If you are riding as a passenger, toggle the <strong>Passenger Mode</strong> switch on the home screen or in settings. This forcefully pauses all auto-tracking.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* GUIDE 4: Camera & AI Odometer Scanning */}
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setOpenGuideSection(openGuideSection === 'camera-scanner' ? '' : 'camera-scanner')}
                    className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/80 text-left font-bold text-xs text-gray-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center">
                      <Camera size={15} className="mr-2 text-indigo-600" />
                      4. AI Odometer Photo Scanning (Gemini Vision)
                    </span>
                    {openGuideSection === 'camera-scanner' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {openGuideSection === 'camera-scanner' && (
                    <div className="p-4 space-y-2.5 text-[11px] text-gray-700 leading-relaxed border-t border-gray-100 animate-fade-in">
                      <p>
                        If you prefer photo-verified odometer records for audit compliance:
                      </p>
                      <ul className="list-disc pl-4 space-y-1.5">
                        <li>
                          Switch <strong>Trip Tracking Mode</strong> to <strong>Camera Only</strong> in Settings or the home screen switcher.
                        </li>
                        <li>
                          Snap a clear photo of your car's instrument cluster odometer.
                        </li>
                        <li>
                          <strong>Gemini AI</strong> analyzes the digits in seconds and pre-fills the reading.
                        </li>
                        <li>
                          You can review and tap any digit to edit if reflections or lighting affected the reading.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* GUIDE 5: Missed Trip Detection */}
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setOpenGuideSection(openGuideSection === 'missed-trips' ? '' : 'missed-trips')}
                    className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/80 text-left font-bold text-xs text-gray-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center">
                      <AlertCircle size={15} className="mr-2 text-amber-500" />
                      5. Missed Trip Gap Detection
                    </span>
                    {openGuideSection === 'missed-trips' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {openGuideSection === 'missed-trips' && (
                    <div className="p-4 space-y-2.5 text-[11px] text-gray-700 leading-relaxed border-t border-gray-100 animate-fade-in">
                      <p>
                        If you forgot to log a drive between trips, EasyLog automatically flags the gap:
                      </p>
                      <ul className="list-disc pl-4 space-y-1.5">
                        <li>
                          When starting a new trip, if your current odometer is higher than the last completed trip's ending reading, EasyLog detects the missing distance.
                        </li>
                        <li>
                          A <strong>Missed Trip Alert</strong> prompts you to log the gap as a personal errand or business trip, keeping your logbook continuous and audit-compliant.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* GUIDE 6: Tax Compliance & CSV Export */}
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setOpenGuideSection(openGuideSection === 'tax-compliance' ? '' : 'tax-compliance')}
                    className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/80 text-left font-bold text-xs text-gray-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center">
                      <FileSpreadsheet size={15} className="mr-2 text-emerald-600" />
                      6. ATO / Tax Logbook Compliance & CSV Export
                    </span>
                    {openGuideSection === 'tax-compliance' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {openGuideSection === 'tax-compliance' && (
                    <div className="p-4 space-y-2.5 text-[11px] text-gray-700 leading-relaxed border-t border-gray-100 animate-fade-in">
                      <p>
                        EasyLog generates official tax-compliant logbooks for accountants and revenue authorities:
                      </p>
                      <ul className="list-disc pl-4 space-y-1.5">
                        <li>
                          <strong>Business vs. Personal Percentage:</strong> EasyLog calculates your total business km/mi and percentage across any financial year.
                        </li>
                        <li>
                          <strong>Filtered CSV Export:</strong> Tap <strong>Export CSV</strong> on the Trip History screen. It generates a comprehensive spreadsheet with start & end dates, times, odometers, distance, vehicle rego, street addresses, and reason notes.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

              </div>

              {/* Navigation button */}
              <div className="flex justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('data')}
                  className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-xs font-semibold"
                >
                  ← Back to Backup & Data
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkflowTab('about')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Next: App Info & Updates</span>
                  <ArrowRight size={13} />
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 6: APP INFORMATION & UPDATES                                          */}
          {/* ========================================================================= */}
          {activeWorkflowTab === 'about' && (
            <div className="space-y-5 animate-fade-in">
              
              {/* App Identity Banner */}
              <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white rounded-2xl p-5 space-y-3 shadow-md">
                <div className="flex items-center space-x-3">
                  <div className="bg-white/20 backdrop-blur-md p-2.5 rounded-xl text-white">
                    <Car size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold tracking-tight">EasyLogAuto</h3>
                    <p className="text-xs text-indigo-100">
                      Smart Mileage & Automatic Drive Tracker
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-indigo-100">
                  <span className="bg-white/20 px-2.5 py-0.5 rounded-full font-bold">
                    Version {APP_VERSION}
                  </span>
                  <span>Build: {APP_BUILD_DATE}</span>
                  <span>•</span>
                  <span>Full-Stack PWA</span>
                </div>
              </div>

              {/* Live Check for Updates Card */}
              <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-xs flex items-center">
                    <RefreshCw size={14} className="mr-1.5 text-indigo-600" />
                    App Updates & Version Health
                  </h4>
                  {lastCheckTime && (
                    <span className="text-[10px] text-gray-400">
                      Checked at {lastCheckTime}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-600 leading-snug">
                  EasyLogAuto uses an automated offline Service Worker. Tap below to check if a new version is available from the server.
                </p>

                {/* Status messages */}
                {updateStatus === 'latest' && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>You're on the latest version! EasyLogAuto v{APP_VERSION} is up to date.</span>
                  </div>
                )}

                {updateStatus === 'update-available' && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                    <div className="flex items-center space-x-2">
                      <Sparkles size={16} className="text-blue-600 shrink-0" />
                      <span className="font-bold">New update ready!</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyUpdate}
                      className="px-3 py-1 bg-blue-600 text-white font-bold rounded-lg text-[11px] hover:bg-blue-700 transition"
                    >
                      Reload to Apply
                    </button>
                  </div>
                )}

                {updateStatus === 'offline' && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
                    <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    <span>You are currently offline. Running seamlessly from offline cache.</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={updateStatus === 'checking'}
                  onClick={handleCheckForUpdates}
                  className="w-full py-2.5 bg-white border border-gray-300 hover:border-gray-400 text-gray-800 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-2xs disabled:opacity-50"
                >
                  <RefreshCw size={13} className={updateStatus === 'checking' ? 'animate-spin text-indigo-600' : 'text-gray-500'} />
                  <span>{updateStatus === 'checking' ? 'Checking for updates...' : 'Check for Updates Now'}</span>
                </button>
              </div>

              {/* Device Hardware & API Capabilities */}
              <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3">
                <h4 className="font-bold text-gray-900 text-xs flex items-center">
                  <Smartphone size={14} className="mr-1.5 text-indigo-600" />
                  Device Capabilities Diagnostics
                </h4>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 rounded-xl border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-600">Satellite GPS:</span>
                    <span className="font-bold text-emerald-600 flex items-center">
                      <Check size={12} className="mr-0.5" /> Supported
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-600">Screen Wake Lock:</span>
                    <span className="font-bold text-emerald-600 flex items-center">
                      {'wakeLock' in navigator ? (
                        <><Check size={12} className="mr-0.5" /> Supported</>
                      ) : (
                        <span className="text-gray-400">Fallback</span>
                      )}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-600">Web Bluetooth:</span>
                    <span className="font-bold flex items-center">
                      {isWebBluetoothSupported() ? (
                        <span className="text-emerald-600 flex items-center"><Check size={12} className="mr-0.5" /> Supported</span>
                      ) : (
                        <span className="text-amber-600">Routines Only</span>
                      )}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-gray-200 flex items-center justify-between">
                    <span className="text-gray-600">PWA Mode:</span>
                    <span className="font-bold text-indigo-600">
                      {isStandalone ? 'Standalone App' : 'Web Browser'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Privacy & Zero-Cloud Guarantee */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 space-y-2">
                <div className="font-bold text-emerald-950 text-xs flex items-center">
                  <Lock size={14} className="mr-1.5 text-emerald-600" />
                  100% On-Device Privacy Guarantee
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Your location coordinates, odometer photos, and logbook entries are processed and stored exclusively on your device. EasyLog has zero external telemetry, zero tracking ads, and zero third-party cloud analytics.
                </p>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center shrink-0">
          <div className="text-[10px] text-gray-400">
            EasyLog • Privacy-first logbook
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
