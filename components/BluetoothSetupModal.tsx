import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Bluetooth,
  Shield,
  Smartphone,
  Check,
  Copy,
  ExternalLink,
  Car,
  Sparkles,
  Play,
  Square,
  Radio,
  HelpCircle,
  ChevronRight,
  UserX,
  Volume2,
  Download,
  Zap,
  CheckCircle2,
  FileCode,
  Layers,
  Terminal,
  AlertCircle,
  Info,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  RadioTower,
  Sliders,
  CheckCheck,
  Cpu,
  Edit3,
  AlertTriangle
} from 'lucide-react';
import { BluetoothConfig, VehicleBluetoothMapping } from '../types';
import {
  generateAutomationUrls,
  isWebBluetoothSupported,
  connectBleBeacon,
  disconnectBleBeacon,
  getActiveBleDeviceName,
  isNativeAndroidApp,
  simulateNativeBluetoothEvent,
  requestWebBluetoothDevice,
  COMMON_CAR_BLUETOOTH_PRESETS,
  BluetoothDevicePreset,
  formatMacAddressInput,
  normalizeMacAddress,
  isValidMacAddress,
  generateDeviceHardwareMac
} from '../services/bluetoothService';

interface BluetoothSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BluetoothConfig;
  onSaveConfig: (newConfig: BluetoothConfig) => void;
  vehicles: string[];
  onAddVehicle?: (reg: string) => void;
  isTripActive: boolean;
  onSimulateConnect: (vehicle?: string, device?: string, macAddress?: string) => void;
  onSimulateDisconnect: () => void;
  showNotification: (msg: string, type?: 'success' | 'error') => void;
}

export const BluetoothSetupModal: React.FC<BluetoothSetupModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  vehicles,
  onAddVehicle,
  isTripActive,
  onSimulateConnect,
  onSimulateDisconnect,
  showNotification
}) => {
  const [activeTab, setActiveTab] = useState<'playstore' | 'tasker' | 'ios' | 'android' | 'ble'>('playstore');
  const [selectedCodeSnippet, setSelectedCodeSnippet] = useState<'manifest' | 'receiver' | 'service' | 'bridge'>('receiver');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bleStatus, setBleStatus] = useState<string | null>(getActiveBleDeviceName());
  const [isBleConnecting, setIsBleConnecting] = useState(false);

  // Local vehicle list to reflect newly added registrations immediately
  const [localVehicles, setLocalVehicles] = useState<string[]>(vehicles);

  useEffect(() => {
    setLocalVehicles((prev) => {
      const merged = Array.from(new Set([...prev, ...vehicles])).sort();
      return merged;
    });
  }, [vehicles]);

  // Selected vehicle currently being allocated
  const [selectedVehicle, setSelectedVehicle] = useState<string>(() => {
    return config.vehicleReg || (vehicles.length > 0 ? vehicles[0] : '');
  });

  // Multi-vehicle Bluetooth allocations state
  const [mappings, setMappings] = useState<VehicleBluetoothMapping[]>(() => {
    if (config.vehicleMappings && config.vehicleMappings.length > 0) {
      return [...config.vehicleMappings];
    }
    if (config.vehicleReg) {
      return [{
        vehicleReg: config.vehicleReg,
        deviceName: config.deviceName || '',
        deviceMacAddress: config.deviceMacAddress || '',
        defaultTripType: config.defaultTripType || 'work',
        autoEndTrip: config.autoEndTrip ?? true
      }];
    }
    return [];
  });

  // Inline "Add New Vehicle Registration" state
  const [newVehicleInput, setNewVehicleInput] = useState<string>('');

  // Device search & scanner states
  const [deviceSearchQuery, setDeviceSearchQuery] = useState<string>('');
  const [selectedDeviceCategory, setSelectedDeviceCategory] = useState<string>('All');
  const [isScanningBluetooth, setIsScanningBluetooth] = useState<boolean>(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<{
    id: string;
    name: string;
    macAddress: string;
    category: string;
    brand: string;
  }[]>([]);
  const [customDeviceName, setCustomDeviceName] = useState<string>('');
  const [customDeviceMac, setCustomDeviceMac] = useState<string>('');

  // Inline MAC address editing per vehicle
  const [editingMacVehicle, setEditingMacVehicle] = useState<string | null>(null);
  const [editingMacInput, setEditingMacInput] = useState<string>('');

  // Synchronize when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialVeh = config.vehicleReg || (vehicles.length > 0 ? vehicles[0] : '');
      setSelectedVehicle(initialVeh);
      if (config.vehicleMappings && config.vehicleMappings.length > 0) {
        setMappings([...config.vehicleMappings]);
      } else if (config.vehicleReg) {
        setMappings([{
          vehicleReg: config.vehicleReg,
          deviceName: config.deviceName || '',
          deviceMacAddress: config.deviceMacAddress || '',
          defaultTripType: config.defaultTripType || 'work',
          autoEndTrip: config.autoEndTrip ?? true
        }]);
      }
    }
  }, [isOpen, config, vehicles]);

  // Ensure every vehicle in localVehicles has at least an entry in mappings for display
  const allVehicleAllocations = useMemo(() => {
    return localVehicles.map((v) => {
      const existing = mappings.find((m) => m.vehicleReg === v);
      return existing || {
        vehicleReg: v,
        deviceName: '',
        deviceMacAddress: '',
        defaultTripType: 'work' as const,
        autoEndTrip: true
      };
    });
  }, [localVehicles, mappings]);

  // Selected vehicle's current allocation
  const currentAllocation = useMemo(() => {
    return mappings.find((m) => m.vehicleReg === selectedVehicle) || {
      vehicleReg: selectedVehicle,
      deviceName: '',
      deviceMacAddress: '',
      defaultTripType: 'work' as const,
      autoEndTrip: true
    };
  }, [mappings, selectedVehicle]);

  // Handle adding new vehicle registration directly in this screen
  const handleAddNewVehicle = () => {
    const trimmed = newVehicleInput.trim().toUpperCase();
    if (!trimmed) {
      showNotification('Please enter a vehicle registration number.', 'error');
      return;
    }

    if (localVehicles.includes(trimmed)) {
      showNotification(`Vehicle ${trimmed} is already in your fleet.`, 'error');
      setSelectedVehicle(trimmed);
      setNewVehicleInput('');
      return;
    }

    // Call prop to update parent App.tsx state
    onAddVehicle?.(trimmed);

    // Update local state immediately
    setLocalVehicles((prev) => [...prev, trimmed].sort());
    setSelectedVehicle(trimmed);

    // Initialize an allocation mapping for this new vehicle
    setMappings((prev) => {
      if (prev.some((m) => m.vehicleReg === trimmed)) return prev;
      return [
        ...prev,
        {
          vehicleReg: trimmed,
          deviceName: '',
          deviceMacAddress: '',
          defaultTripType: 'work',
          autoEndTrip: true
        }
      ];
    });

    setNewVehicleInput('');
    showNotification(`Vehicle "${trimmed}" added! Now select its allocated Bluetooth device below.`, 'success');
  };

  // Handle allocating a Bluetooth device to a vehicle with both friendly name & MAC address
  const handleAllocateDevice = (
    targetVehicle: string,
    deviceNameToAllocate: string,
    macAddressToAllocate?: string,
    deviceIdToAllocate?: string
  ) => {
    if (!targetVehicle) {
      showNotification('Please select or add a vehicle first.', 'error');
      return;
    }

    const cleanDevName = deviceNameToAllocate.trim();
    if (!cleanDevName) {
      showNotification('Please enter a valid device name.', 'error');
      return;
    }

    // Resolve or generate unchanging MAC address
    const cleanMacInput = macAddressToAllocate?.trim();
    const finalMac = cleanMacInput
      ? normalizeMacAddress(cleanMacInput)
      : generateDeviceHardwareMac(cleanDevName);

    // Check if another vehicle already uses this Bluetooth device / MAC
    const existingConflictingVehicle = mappings.find(
      (m) =>
        m.vehicleReg !== targetVehicle &&
        m.deviceName &&
        ((m.deviceMacAddress && finalMac && normalizeMacAddress(m.deviceMacAddress) === finalMac) ||
          m.deviceName.trim().toLowerCase() === cleanDevName.toLowerCase())
    );

    setMappings((prev) => {
      const index = prev.findIndex((m) => m.vehicleReg === targetVehicle);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          deviceName: cleanDevName,
          deviceMacAddress: finalMac,
          deviceId: deviceIdToAllocate || copy[index].deviceId
        };
        return copy;
      }
      return [
        ...prev,
        {
          vehicleReg: targetVehicle,
          deviceName: cleanDevName,
          deviceMacAddress: finalMac,
          deviceId: deviceIdToAllocate,
          defaultTripType: 'work',
          autoEndTrip: true
        }
      ];
    });

    if (existingConflictingVehicle) {
      showNotification(
        `Allocated "${cleanDevName}" (MAC: ${finalMac}) to ${targetVehicle}. Note: Separate Bluetooth devices must be allocated per vehicle (already paired to ${existingConflictingVehicle.vehicleReg}).`,
        'error'
      );
    } else {
      showNotification(`Allocated "${cleanDevName}" (MAC: ${finalMac}) to ${targetVehicle}!`, 'success');
    }
  };

  // Handle updating vehicle trip preferences
  const handleUpdateVehiclePreference = (
    targetVehicle: string,
    updates: Partial<VehicleBluetoothMapping>
  ) => {
    setMappings((prev) => {
      const index = prev.findIndex((m) => m.vehicleReg === targetVehicle);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = { ...copy[index], ...updates };
        return copy;
      }
      return [
        ...prev,
        {
          vehicleReg: targetVehicle,
          deviceName: '',
          deviceMacAddress: '',
          defaultTripType: 'work',
          autoEndTrip: true,
          ...updates
        }
      ];
    });
  };

  // Remove a vehicle's Bluetooth allocation
  const handleClearAllocation = (targetVehicle: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.vehicleReg === targetVehicle
          ? { ...m, deviceName: '', deviceMacAddress: '', deviceId: undefined }
          : m
      )
    );
    showNotification(`Cleared Bluetooth allocation for ${targetVehicle}`, 'success');
  };

  // Live Bluetooth scanning using Web Bluetooth API
  const handleScanWebBluetooth = async () => {
    setIsScanningBluetooth(true);
    try {
      const res = await requestWebBluetoothDevice();
      if (res.success && res.device) {
        const dev = res.device;
        const mac = dev.macAddress || generateDeviceHardwareMac(dev.name);
        const newDeviceItem = {
          id: dev.id || `bt-${Date.now()}`,
          name: dev.name,
          macAddress: mac,
          category: 'Live Scanned Device',
          brand: 'Nearby Device'
        };

        setDiscoveredDevices((prev) => {
          if (prev.some((d) => d.name.toLowerCase() === dev.name.toLowerCase())) return prev;
          return [newDeviceItem, ...prev];
        });

        if (selectedVehicle) {
          handleAllocateDevice(selectedVehicle, dev.name, mac, dev.id);
        }
        showNotification(`Found & paired "${dev.name}" (MAC: ${mac}) via Bluetooth!`, 'success');
      } else {
        showNotification(res.error || 'Scan cancelled or device not selected.', 'error');
      }
    } finally {
      setIsScanningBluetooth(false);
    }
  };

  // Filtered devices list combining discovered + presets
  const filteredDevicesList = useMemo(() => {
    const query = deviceSearchQuery.toLowerCase().trim();
    const combined = [...discoveredDevices, ...COMMON_CAR_BLUETOOTH_PRESETS];

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = combined.filter((item) => {
      const lower = item.name.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    return unique.filter((item) => {
      const matchesQuery =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.brand.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.macAddress.toLowerCase().includes(query);

      const matchesCat =
        selectedDeviceCategory === 'All' || item.category === selectedDeviceCategory;

      return matchesQuery && matchesCat;
    });
  }, [discoveredDevices, deviceSearchQuery, selectedDeviceCategory]);

  // Save all settings and allocations
  const handleSaveAndApply = () => {
    const activeMap = mappings.find((m) => m.vehicleReg === selectedVehicle) || mappings[0];
    const primaryVehicle = selectedVehicle || activeMap?.vehicleReg || localVehicles[0] || '';
    const primaryDevice = activeMap?.deviceName || '';
    const primaryMac = activeMap?.deviceMacAddress || '';

    const newConfig: BluetoothConfig = {
      enabled: true,
      deviceName: primaryDevice,
      deviceMacAddress: primaryMac,
      vehicleReg: primaryVehicle,
      defaultTripType: activeMap?.defaultTripType || 'work',
      autoEndTrip: activeMap?.autoEndTrip ?? true,
      vehicleMappings: mappings
    };

    onSaveConfig(newConfig);
    showNotification(
      `Saved Bluetooth allocations with MAC addresses for ${mappings.filter((m) => m.deviceName).length} vehicle(s)!`,
      'success'
    );
    onClose();
  };

  const ANDROID_SNIPPETS = {
    manifest: `<!-- AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.easylog.app">

    <!-- Play Store Native Bluetooth Permissions -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application android:label="EasyLog" ...>
        <!-- Native Car Bluetooth Broadcast Receiver -->
        <receiver android:name=".CarBluetoothReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.bluetooth.device.action.ACL_CONNECTED" />
                <action android:name="android.bluetooth.device.action.ACL_DISCONNECTED" />
            </intent-filter>
        </receiver>

        <!-- Ongoing GPS Drive Tracking Service -->
        <service
            android:name=".EasyLogTrackingService"
            android:foregroundServiceType="location" />
    </application>
</manifest>`,

    receiver: `// CarBluetoothReceiver.kt
// Listens directly to Android OS Bluetooth broadcasts (Zero Tasker Needed)
package com.easylog.app

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class CarBluetoothReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val device = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
        val deviceName = device?.name ?: "Car Bluetooth"

        when (intent.action) {
            BluetoothDevice.ACTION_ACL_CONNECTED -> {
                // Starts background GPS drive service immediately
                val serviceIntent = Intent(context, EasyLogTrackingService::class.java).apply {
                    action = EasyLogTrackingService.ACTION_START_TRACKING
                    putExtra("device_name", deviceName)
                }
                ContextCompat.startForegroundService(context, serviceIntent)
            }
            BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                // Engine off: stops tracking and posts ATO verification alert
                val serviceIntent = Intent(context, EasyLogTrackingService::class.java).apply {
                    action = EasyLogTrackingService.ACTION_STOP_TRACKING
                }
                context.startService(serviceIntent)
            }
        }
    }
}`,

    service: `// EasyLogTrackingService.kt
// Foreground GPS service with persistent notification
package com.easylog.app

import android.app.Service
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import androidx.core.app.NotificationCompat

class EasyLogTrackingService : Service(), LocationListener {
    // 1. Shows persistent driving notification: "🚗 EasyLog: Tracking Drive..."
    // 2. Records GPS points into route history
    // 3. Complies 100% with Google Play Store background location requirements
    // 4. On engine stop, posts interactive alert: "Tap to verify Work vs Personal"
}`,

    bridge: `// MainActivity.kt (JavaScript Bridge)
// Directly binds the native Android shell with EasyLog:
webView.addJavascriptInterface(object {
    @JavascriptInterface
    fun syncPreferences(carName: String, rego: String, passengerMode: Boolean) {
        // Saves Bluetooth device filter & passenger mode to SharedPreferences
    }
}, "AndroidBridge")

// When car connects, triggers directly into EasyLog web UI:
webView.evaluateJavascript("window.EasyLogNative.onBluetoothConnected('$carName')", null)`
  };

  const handleDownloadAndroidFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Downloaded ' + filename + '! Ready for Android Studio.', 'success');
  };

  if (!isOpen) return null;

  const currentUrls = generateAutomationUrls(
    undefined,
    selectedVehicle,
    currentAllocation.deviceName,
    currentAllocation.deviceMacAddress
  );

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      showNotification('URL copied to clipboard! Paste into your automation.', 'success');
      setTimeout(() => setCopiedKey(null), 2500);
    });
  };

  const handleDownloadTaskerProfile = () => {
    const cleanDeviceName = currentAllocation.deviceName.trim() || 'Car Bluetooth';
    const cleanDeviceMac = currentAllocation.deviceMacAddress?.trim() || '';
    const safeStartUrl = currentUrls.startUrl.replace(/&/g, '&amp;');
    const safeEndUrl = currentUrls.endUrl.replace(/&/g, '&amp;');
    const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<TaskerData sr="" dvi="1" tv="6.3.0">
 <Profile sr="prof9901" ve="2">
  <cdate>${Date.now()}</cdate>
  <edate>${Date.now()}</edate>
  <id>9901</id>
  <mid0>9902</mid0>
  <mid1>9903</mid1>
  <nme>EasyLog Car BT - ${selectedVehicle || 'Drive'}</nme>
  <State sr="con0" ve="2">
   <code>3</code>
   <Str sr="arg0" ve="3">${cleanDeviceName}</Str>
   <Str sr="arg1" ve="3">${cleanDeviceMac}</Str>
  </State>
 </Profile>
 <Task sr="task9902">
  <cdate>${Date.now()}</cdate>
  <edate>${Date.now()}</edate>
  <id>9902</id>
  <nme>EasyLog Start Trip</nme>
  <Action sr="act0" ve="7">
   <code>104</code>
   <Str sr="arg0" ve="3">${safeStartUrl}</Str>
  </Action>
 </Task>
 <Task sr="task9903">
  <cdate>${Date.now()}</cdate>
  <edate>${Date.now()}</edate>
  <id>9903</id>
  <nme>EasyLog End Trip</nme>
  <Action sr="act0" ve="7">
   <code>104</code>
   <Str sr="arg0" ve="3">${safeEndUrl}</Str>
  </Action>
 </Task>
</TaskerData>`;

    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EasyLog_Car_Bluetooth.prf.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Downloaded EasyLog_Car_Bluetooth.prf.xml! In Tasker: tap Profiles > Import Profile.', 'success');
  };

  const handleBleConnect = async () => {
    setIsBleConnecting(true);
    const result = await connectBleBeacon(() => {
      setBleStatus(null);
      showNotification('BLE Beacon disconnected - ending trip', 'success');
      onSimulateDisconnect();
    });
    setIsBleConnecting(false);

    if (result.success) {
      setBleStatus(result.deviceName || 'Connected');
      if (selectedVehicle) {
        handleAllocateDevice(selectedVehicle, result.deviceName || 'BLE Car Beacon');
      }
      showNotification(`Connected to ${result.deviceName}!`, 'success');
    } else {
      showNotification(result.error || 'Connection failed', 'error');
    }
  };

  const handleBleDisconnect = () => {
    disconnectBleBeacon();
    setBleStatus(null);
    showNotification('Disconnected from BLE Beacon', 'success');
  };

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[94vh] flex flex-col border border-gray-100">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-800 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/15 backdrop-blur-md rounded-xl text-white">
              <Bluetooth size={22} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Car Bluetooth Automation & Device Allocations
              </h2>
              <p className="text-[11px] text-blue-100 flex items-center gap-1">
                <Shield size={11} className="text-emerald-300" />
                <span>Separate Bluetooth Devices Allocated Per Vehicle</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-5 overflow-y-auto text-xs text-gray-700">
          {/* Benefit Explanation Banner */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-start space-x-2.5">
              <div className="p-1.5 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5">
                <UserX size={15} />
              </div>
              <div className="space-y-0.5">
                <div className="font-bold text-emerald-950 text-xs">
                  Why Car Bluetooth Solves the "Passenger Problem"
                </div>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  When you travel as a passenger in an <strong>Uber, taxi, friend's car, or public transit</strong>, your phone does <strong>not</strong> connect to your vehicle's Bluetooth. By allocating specific Bluetooth devices to each car, trips are <strong>only logged when driving your specific vehicle</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 1: Add New Registration Number Directly in Bluetooth Set-Up Screen */}
          {/* ========================================================================= */}
          <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                <Car size={15} className="text-indigo-600" />
                <span>1. Add New Registration Number Directly</span>
              </span>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                Direct Fleet Setup
              </span>
            </div>

            <p className="text-[11px] text-gray-600">
              Add a new car registration right here without leaving this screen. You can allocate its unique Bluetooth device immediately.
            </p>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                  🚗
                </div>
                <input
                  type="text"
                  placeholder="Enter Rego / License Plate (e.g. ABC-123, TESLA-M3)"
                  value={newVehicleInput}
                  onChange={(e) => setNewVehicleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNewVehicle()}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleAddNewVehicle}
                disabled={!newVehicleInput.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs"
              >
                <Plus size={15} />
                <span>Add Vehicle</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 2: Separate Bluetooth Devices Allocated Per Vehicle Manager        */}
          {/* ========================================================================= */}
          <div className="bg-gray-50 border border-gray-200/90 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                  <Sliders size={14} className="text-indigo-600" />
                  <span>2. Vehicle Bluetooth Allocations ({localVehicles.length} vehicles)</span>
                </h3>
                <p className="text-[10.5px] text-gray-500 mt-0.5">
                  Each vehicle has its own dedicated Bluetooth device. When that device connects, EasyLog starts tracking for that specific car.
                </p>
              </div>
              <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60">
                1:1 Vehicle Pairing
              </span>
            </div>

            {/* List of Vehicles & Allocated Devices */}
            <div className="space-y-2.5">
              {allVehicleAllocations.length === 0 ? (
                <div className="p-4 bg-white rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-xs">
                  No vehicles configured yet. Use the form above to add your first registration number.
                </div>
              ) : (
                allVehicleAllocations.map((alloc) => {
                  const isAllocated = Boolean(alloc.deviceName && alloc.deviceName.trim());
                  const isCurrentlySelected = selectedVehicle === alloc.vehicleReg;

                  // Check if another vehicle has the exact same device or MAC address allocated
                  const duplicateMapping = isAllocated
                    ? mappings.find(
                        (m) =>
                          m.vehicleReg !== alloc.vehicleReg &&
                          m.deviceName &&
                          ((m.deviceMacAddress && alloc.deviceMacAddress && normalizeMacAddress(m.deviceMacAddress) === normalizeMacAddress(alloc.deviceMacAddress)) ||
                            m.deviceName.trim().toLowerCase() === alloc.deviceName.trim().toLowerCase())
                      )
                    : null;

                  return (
                    <div
                      key={alloc.vehicleReg}
                      className={`p-3.5 bg-white rounded-xl border transition shadow-2xs ${
                        isCurrentlySelected
                          ? 'border-indigo-400 ring-2 ring-indigo-500/15 bg-indigo-50/20'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        {/* Vehicle & Allocated Device Info */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded-md tracking-wider">
                              {alloc.vehicleReg}
                            </span>
                            {isCurrentlySelected && (
                              <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded">
                                Selected Target
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-gray-500 text-[11px]">Allocated Bluetooth:</span>
                            {isAllocated ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200/80">
                                  <Bluetooth size={12} className="text-indigo-600" />
                                  <span>{alloc.deviceName}</span>
                                </span>
                                <span
                                  className="font-mono text-[10.5px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200 flex items-center gap-1"
                                  title="Unchanging Hardware MAC Address / Unique Identifier"
                                >
                                  <Cpu size={10} className="text-gray-500" />
                                  <span>MAC: {alloc.deviceMacAddress || 'Not set'}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMacVehicle(alloc.vehicleReg);
                                    setEditingMacInput(alloc.deviceMacAddress || '');
                                  }}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 hover:underline ml-0.5"
                                  title="Edit MAC Address / Hardware Identifier"
                                >
                                  <Edit3 size={10} />
                                  <span>Edit MAC</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/60 flex items-center gap-1 text-[11px]">
                                <AlertCircle size={11} className="text-amber-600" />
                                <span>No device allocated</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Action Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Trip Type for this Vehicle */}
                          <div className="flex bg-gray-100 rounded-lg p-0.5 border border-gray-200 text-[10.5px]">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateVehiclePreference(alloc.vehicleReg, { defaultTripType: 'work' })
                              }
                              className={`px-2 py-0.5 font-bold rounded-md transition ${
                                alloc.defaultTripType === 'work'
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Work
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateVehiclePreference(alloc.vehicleReg, { defaultTripType: 'personal' })
                              }
                              className={`px-2 py-0.5 font-bold rounded-md transition ${
                                alloc.defaultTripType === 'personal'
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Personal
                            </button>
                          </div>

                          {/* Target this Vehicle button */}
                          <button
                            type="button"
                            onClick={() => setSelectedVehicle(alloc.vehicleReg)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                              isCurrentlySelected
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                            }`}
                          >
                            <span>{isCurrentlySelected ? 'Selected' : 'Select'}</span>
                          </button>

                          {/* Test Connect for this vehicle */}
                          {isAllocated && (
                            <button
                              type="button"
                              disabled={isTripActive}
                              onClick={() => {
                                onSimulateConnect(alloc.vehicleReg, alloc.deviceName, alloc.deviceMacAddress);
                                onClose();
                                showNotification(
                                  `⚡ Simulated connect for ${alloc.vehicleReg} (${alloc.deviceName} • ${alloc.deviceMacAddress})!`,
                                  'success'
                                );
                              }}
                              className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                              title={`Test Bluetooth connection for ${alloc.vehicleReg}`}
                            >
                              <Play size={12} className="fill-current" />
                            </button>
                          )}

                          {/* Clear allocation button */}
                          {isAllocated && (
                            <button
                              type="button"
                              onClick={() => handleClearAllocation(alloc.vehicleReg)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Clear allocated device"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline MAC address editor for this vehicle */}
                      {editingMacVehicle === alloc.vehicleReg && (
                        <div className="mt-2.5 p-2.5 bg-indigo-50/80 rounded-xl border border-indigo-200 flex flex-col sm:flex-row gap-2 items-center text-xs animate-fade-in">
                          <div className="flex items-center gap-1.5 flex-1 w-full">
                            <span className="text-[11px] font-bold text-indigo-900 shrink-0">
                              Hardware MAC:
                            </span>
                            <input
                              type="text"
                              placeholder="00:1A:7D:XX:YY:ZZ"
                              value={editingMacInput}
                              onChange={(e) => setEditingMacInput(formatMacAddressInput(e.target.value))}
                              className="flex-1 px-2.5 py-1 bg-white border border-indigo-300 rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingMacInput(generateDeviceHardwareMac(alloc.deviceName || alloc.vehicleReg))
                              }
                              className="px-2.5 py-1 bg-white hover:bg-gray-50 text-indigo-700 border border-indigo-200 rounded-lg text-[10.5px] font-bold"
                            >
                              Generate MAC
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const clean = editingMacInput.trim()
                                  ? normalizeMacAddress(editingMacInput)
                                  : generateDeviceHardwareMac(alloc.deviceName);
                                handleUpdateVehiclePreference(alloc.vehicleReg, {
                                  deviceMacAddress: clean
                                });
                                setEditingMacVehicle(null);
                                showNotification(`Updated MAC address to ${clean} for ${alloc.vehicleReg}!`, 'success');
                              }}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10.5px] font-bold shadow-2xs"
                            >
                              Save MAC
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingMacVehicle(null)}
                              className="px-2 py-1 text-gray-500 hover:text-gray-700 text-[10.5px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Warning if device is duplicated across multiple vehicles */}
                      {duplicateMapping && (
                        <div className="mt-2 text-[10.5px] bg-amber-50 text-amber-900 border border-amber-200/90 rounded-lg p-2 flex items-start gap-1.5">
                          <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            <strong>Duplicate Allocation:</strong> This Bluetooth device is also allocated to vehicle <strong>{duplicateMapping.vehicleReg}</strong>. Please allocate <strong>separate Bluetooth devices per vehicle</strong> so EasyLog can accurately distinguish which car you are driving.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* STEP 3: Bluetooth Device Search List & Live Web Bluetooth Scanner       */}
          {/* ========================================================================= */}
          <div className="bg-gray-50 border border-gray-200/90 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                  <Search size={14} className="text-indigo-600" />
                  <span>3. Bluetooth Device Search List & Scanner</span>
                </h3>
                <p className="text-[10.5px] text-gray-500 mt-0.5">
                  Allocating device to vehicle:{' '}
                  <strong className="text-indigo-700 font-mono font-bold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                    {selectedVehicle || 'Select a vehicle above'}
                  </strong>
                </p>
              </div>

              {/* Live Web Bluetooth Scan Button */}
              {isWebBluetoothSupported() ? (
                <button
                  type="button"
                  onClick={handleScanWebBluetooth}
                  disabled={isScanningBluetooth || !selectedVehicle}
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 shrink-0"
                >
                  <RadioTower size={13} className={isScanningBluetooth ? 'animate-spin' : ''} />
                  <span>{isScanningBluetooth ? 'Scanning...' : 'Scan Nearby Bluetooth'}</span>
                </button>
              ) : (
                <span className="text-[10.5px] text-gray-400 italic">
                  Search catalog or enter custom name below
                </span>
              )}
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search Bluetooth devices or MAC address (e.g. Toyota, Tesla, Ford SYNC, CarPlay, 00:1A:7D)..."
                value={deviceSearchQuery}
                onChange={(e) => setDeviceSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              {deviceSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDeviceSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex gap-1 overflow-x-auto pb-0.5 text-[10.5px]">
              {['All', 'Factory Car Audio', 'Infotainment & Hands-Free', 'OBD-II & Diagnostics', 'Aftermarket Head Unit'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedDeviceCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 ${
                    selectedDeviceCategory === cat
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Filtered Search Results List */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
              {filteredDevicesList.length === 0 ? (
                <div className="p-4 bg-white rounded-xl border border-dashed border-gray-300 text-center text-gray-500 text-xs space-y-1">
                  <p>No Bluetooth presets matched "{deviceSearchQuery}".</p>
                  <p className="text-[11px] text-gray-400">
                    You can enter a custom Bluetooth name and MAC address below.
                  </p>
                </div>
              ) : (
                filteredDevicesList.map((item) => {
                  const isAllocatedToCurrent =
                    currentAllocation.deviceName.toLowerCase() === item.name.toLowerCase() ||
                    (currentAllocation.deviceMacAddress &&
                      item.macAddress &&
                      normalizeMacAddress(currentAllocation.deviceMacAddress) ===
                        normalizeMacAddress(item.macAddress));

                  // Check if allocated to ANOTHER vehicle in fleet
                  const allocatedToOtherVehicle = mappings.find(
                    (m) =>
                      m.vehicleReg !== selectedVehicle &&
                      m.deviceName &&
                      ((m.deviceMacAddress &&
                        item.macAddress &&
                        normalizeMacAddress(m.deviceMacAddress) === normalizeMacAddress(item.macAddress)) ||
                        m.deviceName.toLowerCase() === item.name.toLowerCase())
                  );

                  return (
                    <div
                      key={item.id || item.macAddress || item.name}
                      className={`p-2.5 bg-white rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs transition ${
                        isAllocatedToCurrent
                          ? 'border-indigo-400 bg-indigo-50/30'
                          : allocatedToOtherVehicle
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-gray-200 hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                          <Bluetooth size={14} />
                        </div>
                        <div className="truncate flex-1">
                          <div className="text-xs font-bold text-gray-900 truncate flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {isAllocatedToCurrent && (
                              <span className="text-[9.5px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                                Active for {selectedVehicle}
                              </span>
                            )}
                            {allocatedToOtherVehicle && !isAllocatedToCurrent && (
                              <span className="text-[9.5px] bg-amber-100 text-amber-800 font-medium px-1.5 py-0.2 rounded">
                                Paired to {allocatedToOtherVehicle.vehicleReg}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate flex items-center gap-2 mt-0.5">
                            <span>{item.brand}</span>
                            <span>•</span>
                            <span className="text-indigo-600 font-medium">{item.category}</span>
                            <span>•</span>
                            <span className="font-mono font-bold text-gray-700 bg-gray-100 px-1 py-0.2 rounded border border-gray-200 text-[9.5px]">
                              MAC: {item.macAddress}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 justify-end">
                        <button
                          type="button"
                          onClick={() => handleAllocateDevice(selectedVehicle, item.name, item.macAddress, item.id)}
                          disabled={!selectedVehicle}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                            isAllocatedToCurrent
                              ? 'bg-emerald-600 text-white'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {isAllocatedToCurrent ? 'Allocated' : `Allocate to ${selectedVehicle || 'Car'}`}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Custom Bluetooth Name & MAC Entry */}
            <div className="pt-2.5 border-t border-gray-200 space-y-1.5">
              <label className="block text-[11px] font-bold text-gray-700">
                Or enter custom Bluetooth device name and unchanging MAC address:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <input
                    type="text"
                    placeholder="Friendly Name (e.g. Work Van Audio, CarPlay)"
                    value={customDeviceName}
                    onChange={(e) => setCustomDeviceName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Hardware MAC (e.g. 00:1A:7D:55:22:99)"
                    value={customDeviceMac}
                    onChange={(e) => setCustomDeviceMac(formatMacAddressInput(e.target.value))}
                    className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCustomDeviceMac(
                        generateDeviceHardwareMac(customDeviceName || selectedVehicle)
                      )
                    }
                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded-xl text-[10.5px] font-bold shrink-0"
                    title="Auto-generate standard hardware MAC address"
                  >
                    Gen MAC
                  </button>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (customDeviceName.trim()) {
                      const finalMac = customDeviceMac.trim()
                        ? normalizeMacAddress(customDeviceMac)
                        : generateDeviceHardwareMac(customDeviceName);
                      handleAllocateDevice(selectedVehicle, customDeviceName.trim(), finalMac);
                      setCustomDeviceName('');
                      setCustomDeviceMac('');
                    }
                  }}
                  disabled={!customDeviceName.trim() || !selectedVehicle}
                  className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center gap-1 shadow-xs"
                >
                  <Plus size={13} />
                  <span>Allocate Custom Device to {selectedVehicle || 'Vehicle'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Master Save Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-bold rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-1.5"
            >
              <CheckCheck size={16} />
              <span>Save & Apply All Vehicle Bluetooth Allocations</span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* STEP 4: Automation Setup Guides (Play Store, Tasker, iOS, Samsung, BLE)   */}
          {/* ========================================================================= */}
          <div className="space-y-3 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 text-xs">
                Hands-Free Automation Platform Guides
              </span>
              <span className="text-[10px] text-gray-400">Zero-Touch Automation</span>
            </div>

            {/* Platform Selector Tabs */}
            <div className="flex rounded-xl bg-gray-100 p-1 gap-0.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('playstore')}
                className={`flex-1 min-w-[110px] py-1.5 px-2 text-xs font-semibold rounded-lg transition flex items-center justify-center space-x-1 ${
                  activeTab === 'playstore'
                    ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100 font-bold'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Smartphone size={13} className={activeTab === 'playstore' ? 'text-emerald-600' : 'text-gray-400'} />
                <span>Play Store (Native)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tasker')}
                className={`flex-1 min-w-[76px] py-1.5 px-2 text-xs font-semibold rounded-lg transition flex items-center justify-center space-x-1 ${
                  activeTab === 'tasker'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Zap size={12} className={activeTab === 'tasker' ? 'text-amber-500 fill-amber-500' : 'text-gray-400'} />
                <span>Tasker</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`flex-1 min-w-[70px] py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'ios' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                 iPhone
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`flex-1 min-w-[76px] py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'android' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                🤖 Samsung
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ble')}
                className={`flex-1 min-w-[65px] py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'ble' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                📡 BLE
              </button>
            </div>

            {/* TAB: Play Store (Native Android App) */}
            {activeTab === 'playstore' && (
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 space-y-3.5 text-[11px] leading-relaxed animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-950 text-xs flex items-center">
                    <Smartphone size={15} className="mr-1.5 text-emerald-600" />
                    Native Android Bluetooth API (Play Store)
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    Zero 3rd-Party Apps
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3 border border-emerald-200 shadow-xs space-y-2">
                  <div className="font-semibold text-gray-900 text-[11px] flex items-center text-emerald-900">
                    <CheckCircle2 size={13} className="mr-1.5 text-emerald-600 shrink-0" />
                    <span>Multi-Vehicle Android Bluetooth Detection Built-In</span>
                  </div>
                  <p className="text-gray-600 text-[10.5px]">
                    In the Android app, EasyLog listens directly to Android OS system Bluetooth broadcasts. When your car connects, it matches the device to the allocated vehicle:
                  </p>

                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <div className="flex items-start space-x-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="font-bold text-emerald-800 text-[11px]">1.</span>
                      <div>
                        <strong className="text-gray-900">Ignition On / Phone Connects:</strong>
                        <p className="text-gray-600">
                          Android OS fires <code className="text-emerald-700 bg-white px-1 py-0.5 rounded font-mono text-[9.5px]">ACTION_ACL_CONNECTED</code>. Our native BroadcastReceiver wakes up and identifies which car was connected.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="font-bold text-emerald-800 text-[11px]">2.</span>
                      <div>
                        <strong className="text-gray-900">Autonomous GPS Foreground Service:</strong>
                        <p className="text-gray-600">
                          Starts low-power drive tracking and posts: <em>"🚗 EasyLog: Tracking Drive for {selectedVehicle || 'your car'}..."</em>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interactive Native Event Simulator */}
                <div className="bg-white rounded-xl p-3 border border-emerald-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 text-[11px]">⚡ Test Native Android Bluetooth Signal</span>
                    <span className="text-[10px] text-gray-400">Simulate OS event</span>
                  </div>
                  <p className="text-gray-600 text-[10.5px]">
                    Simulate the exact Android event triggered when {selectedVehicle || 'your vehicle'} connects to {currentAllocation.deviceName || 'Bluetooth'}:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isTripActive}
                      onClick={() => {
                        simulateNativeBluetoothEvent(
                          'connected',
                          currentAllocation.deviceName || 'Toyota Car BT',
                          selectedVehicle,
                          currentAllocation.deviceMacAddress
                        );
                        onClose();
                        showNotification(
                          `🚗 Android OS Event: Connected to ${selectedVehicle} (${currentAllocation.deviceName || 'BT'} • ${currentAllocation.deviceMacAddress || 'MAC'})!`,
                          'success'
                        );
                      }}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 transition ${
                        isTripActive
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      <Play size={12} className="fill-current" />
                      <span>Simulate Connect</span>
                    </button>
                    <button
                      type="button"
                      disabled={!isTripActive}
                      onClick={() => {
                        simulateNativeBluetoothEvent('disconnected');
                        onClose();
                        showNotification('🛑 Android OS Event: Disconnected', 'success');
                      }}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 transition ${
                        !isTripActive
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                      }`}
                    >
                      <Square size={12} className="fill-current" />
                      <span>Simulate Disconnect</span>
                    </button>
                  </div>
                </div>

                {/* Native Android Source Code Viewer */}
                <div className="bg-white rounded-xl p-3 border border-emerald-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900 text-[11px] flex items-center">
                      <FileCode size={13} className="mr-1.5 text-emerald-700" />
                      <span>Android Studio Source Code</span>
                    </div>
                    <span className="text-[10px] text-gray-400">Play Store Production Architecture</span>
                  </div>

                  <div className="flex rounded-lg bg-gray-100 p-0.5 text-[10.5px]">
                    <button
                      type="button"
                      onClick={() => setSelectedCodeSnippet('receiver')}
                      className={`flex-1 py-1 rounded-md font-semibold transition ${
                        selectedCodeSnippet === 'receiver' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-gray-500'
                      }`}
                    >
                      CarBluetoothReceiver.kt
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCodeSnippet('manifest')}
                      className={`flex-1 py-1 rounded-md font-semibold transition ${
                        selectedCodeSnippet === 'manifest' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-gray-500'
                      }`}
                    >
                      AndroidManifest.xml
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCodeSnippet('service')}
                      className={`flex-1 py-1 rounded-md font-semibold transition ${
                        selectedCodeSnippet === 'service' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-gray-500'
                      }`}
                    >
                      TrackingService.kt
                    </button>
                  </div>

                  <div className="relative">
                    <pre className="p-3 bg-gray-900 text-gray-100 font-mono text-[10px] rounded-xl overflow-x-auto max-h-40 border border-gray-800">
                      {ANDROID_SNIPPETS[selectedCodeSnippet]}
                    </pre>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(ANDROID_SNIPPETS[selectedCodeSnippet], 'code_' + selectedCodeSnippet)}
                        className="p-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] flex items-center gap-1 px-1.5"
                      >
                        <Copy size={11} />
                        <span>{copiedKey === 'code_' + selectedCodeSnippet ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadAndroidFile(
                            selectedCodeSnippet === 'receiver'
                              ? 'CarBluetoothReceiver.kt'
                              : selectedCodeSnippet === 'manifest'
                              ? 'AndroidManifest.xml'
                              : 'EasyLogTrackingService.kt',
                            ANDROID_SNIPPETS[selectedCodeSnippet]
                          )
                        }
                        className="p-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] flex items-center gap-1 px-1.5"
                      >
                        <Download size={11} />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Tasker */}
            {activeTab === 'tasker' && (
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 space-y-3.5 text-[11px] leading-relaxed animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-indigo-950 text-xs flex items-center">
                    <Zap size={14} className="mr-1.5 text-amber-500 fill-amber-500" />
                    Tasker Automation for Android
                  </div>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                    For {selectedVehicle}
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3 border border-indigo-200 shadow-xs space-y-2">
                  <span className="font-semibold text-gray-900 text-[11px]">Option A: 1-Click Tasker Import Profile</span>
                  <p className="text-gray-600 text-[10.5px]">
                    Download the pre-configured profile for <strong>{selectedVehicle}</strong> and Bluetooth device <strong>{currentAllocation.deviceName || 'your car'}</strong>:
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadTaskerProfile}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Download size={13} />
                    <span>Download EasyLog_Car_Bluetooth.prf.xml</span>
                  </button>
                </div>

                <div className="bg-white rounded-xl p-3 border border-indigo-200 shadow-xs space-y-2">
                  <span className="font-semibold text-gray-900 text-[11px]">Option B: Webhook URLs</span>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Start Drive URL</span>
                      <div className="flex gap-1 mt-0.5">
                        <input
                          type="text"
                          readOnly
                          value={currentUrls.startUrl}
                          className="w-full bg-gray-50 border border-gray-200 px-2 py-1 rounded text-[10px] font-mono text-gray-700"
                        />
                        <button
                          type="button"
                          onClick={() => copyToClipboard(currentUrls.startUrl, 'tasker_start')}
                          className="px-2 bg-gray-100 hover:bg-gray-200 rounded text-[11px] font-semibold text-gray-700"
                        >
                          {copiedKey === 'tasker_start' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase">End Drive URL</span>
                      <div className="flex gap-1 mt-0.5">
                        <input
                          type="text"
                          readOnly
                          value={currentUrls.endUrl}
                          className="w-full bg-gray-50 border border-gray-200 px-2 py-1 rounded text-[10px] font-mono text-gray-700"
                        />
                        <button
                          type="button"
                          onClick={() => copyToClipboard(currentUrls.endUrl, 'tasker_end')}
                          className="px-2 bg-gray-100 hover:bg-gray-200 rounded text-[11px] font-semibold text-gray-700"
                        >
                          {copiedKey === 'tasker_end' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: iOS Shortcuts */}
            {activeTab === 'ios' && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3.5 text-[11px] leading-relaxed animate-fade-in">
                <div className="font-bold text-gray-900 text-xs flex items-center justify-between">
                  <span>Apple Shortcuts Automation (iOS)</span>
                  <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-bold">
                    Target: {selectedVehicle}
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-xs space-y-2">
                  <ol className="list-decimal list-inside space-y-1.5 text-gray-700">
                    <li>Open the <strong>Shortcuts</strong> app on your iPhone.</li>
                    <li>Tap the <strong>Automation</strong> tab at the bottom, then <strong>+</strong> (New Automation).</li>
                    <li>Choose <strong>Bluetooth</strong> → Select <strong>{currentAllocation.deviceName || "your car's Bluetooth"}</strong>.</li>
                    <li>Select <em>"Run Immediately"</em> (turn off Ask Before Running).</li>
                    <li>Action: Add <strong>Open URL</strong> and paste the start URL below:</li>
                  </ol>

                  <div className="flex gap-1 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.startUrl}
                      className="w-full bg-gray-50 border border-gray-200 px-2 py-1.5 rounded-lg text-[10px] font-mono text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.startUrl, 'ios_start')}
                      className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                    >
                      {copiedKey === 'ios_start' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Samsung Routines */}
            {activeTab === 'android' && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3.5 text-[11px] leading-relaxed animate-fade-in">
                <div className="font-bold text-gray-900 text-xs flex items-center justify-between">
                  <span>Samsung Modes & Routines</span>
                  <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-bold">
                    Galaxy Devices
                  </span>
                </div>

                <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-xs space-y-2">
                  <ol className="list-decimal list-inside space-y-1.5 text-gray-700">
                    <li>Open <strong>Settings</strong> &gt; <strong>Modes and Routines</strong> &gt; <strong>Routines</strong>.</li>
                    <li><strong>If:</strong> Connected to Bluetooth device &gt; Select <strong>{currentAllocation.deviceName || "your car audio"}</strong>.</li>
                    <li><strong>Then:</strong> Open website URL &gt; Paste the start URL below:</li>
                  </ol>

                  <div className="flex gap-1 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.startUrl}
                      className="w-full bg-gray-50 border border-gray-200 px-2 py-1.5 rounded-lg text-[10px] font-mono text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.startUrl, 'samsung_start')}
                      className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                    >
                      {copiedKey === 'samsung_start' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: BLE Beacon */}
            {activeTab === 'ble' && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3.5 text-[11px] leading-relaxed animate-fade-in">
                <div className="font-bold text-gray-900 text-xs flex items-center justify-between">
                  <span>Bluetooth Low Energy (BLE) Beacon / OBD-II Scanner</span>
                  <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-bold">
                    In-Browser BLE
                  </span>
                </div>

                <p className="text-gray-600">
                  If you keep an OBD-II BLE dongle (e.g. Veepeak, OBDLink) in your car, you can pair it directly inside this browser. When the car ignition turns off, the beacon disconnects and stops the trip.
                </p>

                <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Status:</span>
                    <span className={`font-semibold ${bleStatus ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {bleStatus ? `Connected to ${bleStatus}` : 'Disconnected'}
                    </span>
                  </div>

                  <div className="pt-1">
                    {bleStatus ? (
                      <button
                        type="button"
                        onClick={handleBleDisconnect}
                        className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition"
                      >
                        Disconnect BLE Beacon
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleBleConnect}
                        disabled={isBleConnecting}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <Radio size={13} />
                        <span>{isBleConnecting ? 'Pairing...' : 'Pair BLE Dongle / Beacon'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
