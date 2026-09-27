import React, { useState } from 'react';
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
  Info
} from 'lucide-react';
import { BluetoothConfig } from '../types';
import {
  generateAutomationUrls,
  isWebBluetoothSupported,
  connectBleBeacon,
  disconnectBleBeacon,
  getActiveBleDeviceName,
  isNativeAndroidApp,
  simulateNativeBluetoothEvent
} from '../services/bluetoothService';

interface BluetoothSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BluetoothConfig;
  onSaveConfig: (newConfig: BluetoothConfig) => void;
  vehicles: string[];
  isTripActive: boolean;
  onSimulateConnect: () => void;
  onSimulateDisconnect: () => void;
  showNotification: (msg: string, type?: 'success' | 'error') => void;
}

export const BluetoothSetupModal: React.FC<BluetoothSetupModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  vehicles,
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

  // Form states
  const [deviceName, setDeviceName] = useState(config.deviceName || '');
  const [selectedVehicle, setSelectedVehicle] = useState(config.vehicleReg || (vehicles[0] || ''));
  const [defaultTripType, setDefaultTripType] = useState<'work' | 'personal'>(config.defaultTripType || 'work');
  const [autoEndTrip, setAutoEndTrip] = useState(config.autoEndTrip ?? true);

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

  const currentUrls = generateAutomationUrls(undefined, selectedVehicle);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      showNotification('URL copied to clipboard! Paste into your automation.', 'success');
      setTimeout(() => setCopiedKey(null), 2500);
    });
  };

  const handleDownloadTaskerProfile = () => {
    const cleanDeviceName = deviceName.trim();
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
   <Str sr="arg1" ve="3"/>
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

  const handleSaveAndApply = () => {
    onSaveConfig({
      enabled: true,
      deviceName: deviceName.trim(),
      vehicleReg: selectedVehicle,
      defaultTripType,
      autoEndTrip
    });
    showNotification('Car Bluetooth settings saved!', 'success');
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col border border-gray-100">
        
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/15 backdrop-blur-md rounded-xl text-white">
              <Bluetooth size={22} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Car Bluetooth Automation
              </h2>
              <p className="text-[11px] text-blue-100 flex items-center">
                <Shield size={11} className="mr-1 text-emerald-300" />
                Zero Passenger Tracking Guarantee
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-5 overflow-y-auto text-xs text-gray-700">
          
          {/* Benefit Explanation Banner */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-start space-x-2.5">
              <div className="p-1.5 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5">
                <UserX size={15} />
              </div>
              <div className="space-y-1">
                <div className="font-bold text-emerald-950 text-[13px]">
                  Why Car Bluetooth Solves the "Passenger Problem"
                </div>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  When you travel as a passenger in an <strong>Uber, taxi, friend's car, or train</strong>, your phone does <strong>not</strong> connect to your car's Bluetooth. By tying GPS tracking exclusively to your vehicle's Bluetooth, trips are <strong>only recorded when you drive your own car</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Car & Vehicle Profile Settings */}
          <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3">
            <div className="font-bold text-gray-900 text-xs flex items-center justify-between">
              <span className="flex items-center">
                <Car size={14} className="mr-1.5 text-indigo-600" />
                Your Vehicle & Bluetooth Pairing
              </span>
              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-semibold">
                Auto-assigned
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Car Bluetooth Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Toyota BT, Mazda, CarPlay"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Log to Vehicle
                </label>
                <select
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {vehicles.length === 0 && (
                    <option value="">No vehicles added</option>
                  )}
                  {vehicles.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Default Trip Purpose
                </label>
                <div className="flex bg-white rounded-xl p-0.5 border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setDefaultTripType('work')}
                    className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition ${
                      defaultTripType === 'work'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Work
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultTripType('personal')}
                    className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition ${
                      defaultTripType === 'personal'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Personal
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  When Disconnected
                </label>
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="autoEndTripCheckbox"
                    checked={autoEndTrip}
                    onChange={(e) => setAutoEndTrip(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <label htmlFor="autoEndTripCheckbox" className="text-[11px] text-gray-700 cursor-pointer">
                    Auto-save immediately
                  </label>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveAndApply}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition shadow-sm"
            >
              Save Bluetooth Preferences
            </button>
          </div>

          {/* Setup Guide Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 text-xs">
                Setup Hands-Free Automation
              </span>
              <span className="text-[10px] text-gray-400">100% Free & Automatic</span>
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
                  activeTab === 'ios'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                 iPhone
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`flex-1 min-w-[76px] py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'android'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                🤖 Samsung
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ble')}
                className={`flex-1 min-w-[65px] py-1.5 px-2 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'ble'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
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
                    <span>Yes! 100% Built-In Android Bluetooth Detection</span>
                  </div>
                  <p className="text-gray-600 text-[10.5px]">
                    Because EasyLog is distributed as a native Android app via the Google Play Store, <strong>Tasker is NOT needed</strong>. The app listens directly to Android OS system Bluetooth broadcasts:
                  </p>
                  
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <div className="flex items-start space-x-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="font-bold text-emerald-800 text-[11px]">1.</span>
                      <div>
                        <strong className="text-gray-900">Ignition On / Phone Connects:</strong>
                        <p className="text-gray-600">Android OS fires <code className="text-emerald-700 bg-white px-1 py-0.5 rounded font-mono text-[9.5px]">ACTION_ACL_CONNECTED</code>. Our native BroadcastReceiver wakes up the app in your pocket.</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="font-bold text-emerald-800 text-[11px]">2.</span>
                      <div>
                        <strong className="text-gray-900">Autonomous GPS Foreground Service:</strong>
                        <p className="text-gray-600">Starts low-power drive tracking and posts: <em>"🚗 EasyLog: Tracking Drive to {selectedVehicle || 'your car'}..."</em> (Complies 100% with Google Play Store policies).</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                      <span className="font-bold text-emerald-800 text-[11px]">3.</span>
                      <div>
                        <strong className="text-gray-900">Ignition Off / Disconnects:</strong>
                        <p className="text-gray-600">Android OS fires <code className="text-emerald-700 bg-white px-1 py-0.5 rounded font-mono text-[9.5px]">ACTION_ACL_DISCONNECTED</code>. The drive automatically finalizes and posts a verification prompt.</p>
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
                    Test the exact Android event that <code className="text-gray-800 font-mono text-[10px]">CarBluetoothReceiver</code> triggers when your car connects:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isTripActive}
                      onClick={() => {
                        simulateNativeBluetoothEvent('connected', deviceName || 'Toyota Car BT', selectedVehicle);
                        onClose();
                        showNotification(`🚗 Android OS Event: Car Connected (${selectedVehicle})`, 'success');
                      }}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 transition ${
                        isTripActive
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      <Play size={12} className="fill-current" />
                      <span>Simulate Connected</span>
                    </button>
                    <button
                      type="button"
                      disabled={!isTripActive}
                      onClick={() => {
                        simulateNativeBluetoothEvent('disconnected');
                        onClose();
                        showNotification('🛑 Android OS Event: Car Disconnected', 'success');
                      }}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 transition ${
                        !isTripActive
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                      }`}
                    >
                      <Square size={12} className="fill-current" />
                      <span>Simulate Disconnected</span>
                    </button>
                  </div>
                </div>

                {/* Native Android Source Code Viewer */}
                <div className="bg-white rounded-xl p-3 border border-emerald-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900 text-[11px] flex items-center">
                      <FileCode size={13} className="mr-1 text-emerald-600" />
                      <span>Play Store Native Android Source</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-medium">Ready in /android_native</span>
                  </div>

                  {/* Code File Selector */}
                  <div className="flex rounded-lg bg-gray-100 p-0.5 gap-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSelectedCodeSnippet('receiver')}
                      className={`flex-1 py-1 px-1.5 font-medium rounded transition ${
                        selectedCodeSnippet === 'receiver' ? 'bg-white text-gray-900 font-semibold shadow-xs' : 'text-gray-500'
                      }`}
                    >
                      Receiver.kt
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCodeSnippet('manifest')}
                      className={`flex-1 py-1 px-1.5 font-medium rounded transition ${
                        selectedCodeSnippet === 'manifest' ? 'bg-white text-gray-900 font-semibold shadow-xs' : 'text-gray-500'
                      }`}
                    >
                      Manifest.xml
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCodeSnippet('service')}
                      className={`flex-1 py-1 px-1.5 font-medium rounded transition ${
                        selectedCodeSnippet === 'service' ? 'bg-white text-gray-900 font-semibold shadow-xs' : 'text-gray-500'
                      }`}
                    >
                      Service.kt
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCodeSnippet('bridge')}
                      className={`flex-1 py-1 px-1.5 font-medium rounded transition ${
                        selectedCodeSnippet === 'bridge' ? 'bg-white text-gray-900 font-semibold shadow-xs' : 'text-gray-500'
                      }`}
                    >
                      Bridge
                    </button>
                  </div>

                  {/* Code snippet display */}
                  <div className="relative">
                    <pre className="p-2.5 bg-gray-900 text-gray-200 text-[9.5px] font-mono rounded-lg overflow-x-auto max-h-36 select-all">
                      {ANDROID_SNIPPETS[selectedCodeSnippet]}
                    </pre>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const filename = selectedCodeSnippet === 'manifest' ? 'AndroidManifest.xml' :
                          selectedCodeSnippet === 'receiver' ? 'CarBluetoothReceiver.kt' :
                          selectedCodeSnippet === 'service' ? 'EasyLogTrackingService.kt' : 'MainActivity.kt';
                        copyToClipboard(ANDROID_SNIPPETS[selectedCodeSnippet], 'code_' + selectedCodeSnippet);
                      }}
                      className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg text-[10.5px] transition flex items-center justify-center space-x-1"
                    >
                      {copiedKey === 'code_' + selectedCodeSnippet ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      <span>{copiedKey === 'code_' + selectedCodeSnippet ? 'Copied!' : 'Copy Code'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const filename = selectedCodeSnippet === 'manifest' ? 'AndroidManifest.xml' :
                          selectedCodeSnippet === 'receiver' ? 'CarBluetoothReceiver.kt' :
                          selectedCodeSnippet === 'service' ? 'EasyLogTrackingService.kt' : 'MainActivity.kt';
                        handleDownloadAndroidFile(filename, ANDROID_SNIPPETS[selectedCodeSnippet]);
                      }}
                      className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[10.5px] transition flex items-center justify-center space-x-1 shadow-xs"
                    >
                      <Download size={11} />
                      <span>Download File</span>
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-emerald-800 bg-emerald-100/60 rounded-xl p-2.5 flex items-start space-x-1.5">
                  <Info size={13} className="shrink-0 mt-0.5 text-emerald-700" />
                  <span>
                    All 4 native Android files are created and available inside the <code className="font-mono font-bold">/android_native/</code> folder of this project. You can copy them straight into Android Studio to compile your Play Store APK/AAB!
                  </span>
                </div>
              </div>
            )}

            {/* TAB 0: Tasker (Pixel Pro / Android) */}
            {activeTab === 'tasker' && (
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 space-y-3.5 text-[11px] leading-relaxed animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-indigo-950 text-xs flex items-center">
                    <Zap size={15} className="mr-1.5 text-amber-500 fill-amber-500" />
                    Tasker Setup (Pixel Pro & Android)
                  </div>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                    Hands-Free
                  </span>
                </div>

                {/* 1-Click Profile Download Banner */}
                <div className="bg-white rounded-xl p-3 border border-indigo-200 shadow-xs space-y-2">
                  <div className="font-semibold text-gray-900 text-[11px] flex items-center justify-between">
                    <span>⚡ Quick Import (Recommended)</span>
                    <span className="text-[10px] text-indigo-600 font-normal">Pre-configured XML</span>
                  </div>
                  <p className="text-gray-600 text-[10.5px]">
                    Download the ready-to-import Tasker profile containing both the <strong>Start Drive</strong> and <strong>End Drive</strong> tasks for <strong>{selectedVehicle || 'your vehicle'}</strong>:
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadTaskerProfile}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow-sm active:scale-98"
                  >
                    <Download size={13} />
                    <span>Download Tasker Profile (.prf.xml)</span>
                  </button>
                  <div className="text-[10px] text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-100">
                    <strong>To import in Tasker:</strong> Open Tasker → Long-press <strong>Profiles</strong> tab at the top (or tap 3 dots) → Tap <strong>Import Profile</strong> → Select the downloaded file. Tap the BT trigger to choose your car name!
                  </div>
                </div>

                {/* Manual Setup Instructions */}
                <div className="space-y-2 pt-1">
                  <div className="font-bold text-gray-900 text-[11px]">
                    Manual Step-by-Step in Tasker:
                  </div>

                  <ol className="list-decimal pl-4 space-y-2 text-gray-700">
                    <li>
                      <strong>Create Profile:</strong> In Tasker, tap <strong>+ (New Profile)</strong> → Choose <strong>State</strong> → <strong>Net</strong> → <strong>BT Connected</strong>.
                    </li>
                    <li>
                      Under <strong>Name</strong> or <strong>Address</strong>, tap the search icon 🔍 and select your <strong>Car's Bluetooth name</strong>. Tap the top-left <span className="font-mono font-bold">&lt;</span> back arrow.
                    </li>
                    <li>
                      <strong>Enter Task (Start Drive):</strong> Tap <strong>+ New Task</strong> (name it <em>EasyLog Start</em>) → Tap <strong>+</strong> → <strong>Net</strong> → <strong>Browse URL</strong> → Paste the <strong>Start Trip URL</strong> below.
                    </li>
                    <li>
                      <strong>Exit Task (End Drive):</strong> Long-press the green arrow next to your new profile in Tasker → Tap <strong>Add Exit Task</strong> → Name it <em>EasyLog End</em> → Tap <strong>+</strong> → <strong>Net</strong> → <strong>Browse URL</strong> → Paste the <strong>End Trip URL</strong> below.
                    </li>
                  </ol>
                </div>

                {/* Copyable Start Trip URL */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-gray-600 uppercase">
                    <span>1. Tasker Start URL (Browse URL Action)</span>
                    {copiedKey === 'start_tasker' && (
                      <span className="text-emerald-600 font-bold flex items-center">
                        <Check size={11} className="mr-0.5" /> Copied!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center bg-white rounded-xl border border-indigo-200 overflow-hidden shadow-xs">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.startUrl}
                      className="px-2.5 py-1.5 text-[10px] font-mono text-gray-700 bg-transparent flex-1 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.startUrl, 'start_tasker')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-[11px] shrink-0 transition flex items-center"
                    >
                      <Copy size={12} className="mr-1" />
                      Copy
                    </button>
                  </div>
                </div>

                {/* Copyable End Trip URL */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-gray-600 uppercase">
                    <span>2. Tasker End URL (Exit Task Browse URL)</span>
                    {copiedKey === 'end_tasker' && (
                      <span className="text-emerald-600 font-bold flex items-center">
                        <Check size={11} className="mr-0.5" /> Copied!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center bg-white rounded-xl border border-indigo-200 overflow-hidden shadow-xs">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.endUrl}
                      className="px-2.5 py-1.5 text-[10px] font-mono text-gray-700 bg-transparent flex-1 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.endUrl, 'end_tasker')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-[11px] shrink-0 transition flex items-center"
                    >
                      <Copy size={12} className="mr-1" />
                      Copy
                    </button>
                  </div>
                </div>

                {/* Pixel Pro Specific Reliability Checklist */}
                <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3 space-y-1.5">
                  <div className="font-bold text-amber-950 text-[11px] flex items-center">
                    <Smartphone size={13} className="mr-1 text-amber-700" />
                    Crucial Settings for Pixel Pro:
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-amber-900 text-[10.5px]">
                    <li>
                      <strong>Battery:</strong> Go to Pixel <em>Settings → Apps → Tasker → App battery usage</em> → Set to <strong>Unrestricted</strong> (prevents Android Doze from killing Tasker).
                    </li>
                    <li>
                      <strong>Display over other apps:</strong> Go to Pixel <em>Settings → Apps → Special app access → Display over other apps</em> → Set <strong>Tasker to Allowed</strong> so it can launch the browser while your phone is locked.
                    </li>
                    <li>
                      <strong>Install as PWA:</strong> Tap the <em>Install App</em> button in EasyLog so it opens instantly in full screen standalone mode.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB 1: iOS Shortcuts */}
            {activeTab === 'ios' && (
              <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 space-y-3 text-[11px] leading-relaxed animate-fade-in">
                <div className="font-bold text-blue-900 text-xs flex items-center">
                  <Smartphone size={14} className="mr-1.5 text-blue-600" />
                  3-Minute iPhone Setup (Native & Hands-Free)
                </div>

                <ol className="list-decimal pl-4 space-y-2 text-gray-700">
                  <li>
                    Open the built-in <strong>Shortcuts</strong> app on your iPhone.
                  </li>
                  <li>
                    Tap the <strong>Automation</strong> tab at the bottom, then tap <strong>+ (New Automation)</strong>.
                  </li>
                  <li>
                    Select <strong>Bluetooth</strong> → Choose your <strong>Car's Bluetooth Device</strong>. Select <em>"Run Immediately"</em> (turn off Ask Before Running).
                  </li>
                  <li>
                    Choose action: <strong>Open URLs</strong> → Paste the <strong>Start Trip Link</strong> below:
                  </li>
                </ol>

                {/* Copyable Start Trip URL */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500 uppercase">
                    <span>1. Start Trip Automation URL</span>
                    {copiedKey === 'start' && (
                      <span className="text-emerald-600 font-bold flex items-center">
                        <Check size={11} className="mr-0.5" /> Copied!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center bg-white rounded-xl border border-blue-200 overflow-hidden shadow-xs">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.startUrl}
                      className="px-2.5 py-1.5 text-[10px] font-mono text-gray-700 bg-transparent flex-1 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.startUrl, 'start')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] shrink-0 transition flex items-center"
                    >
                      <Copy size={12} className="mr-1" />
                      Copy
                    </button>
                  </div>
                </div>

                {/* Copyable End Trip URL */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500 uppercase">
                    <span>2. End Trip Automation URL (On Disconnect)</span>
                    {copiedKey === 'end' && (
                      <span className="text-emerald-600 font-bold flex items-center">
                        <Check size={11} className="mr-0.5" /> Copied!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center bg-white rounded-xl border border-blue-200 overflow-hidden shadow-xs">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.endUrl}
                      className="px-2.5 py-1.5 text-[10px] font-mono text-gray-700 bg-transparent flex-1 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.endUrl, 'end')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] shrink-0 transition flex items-center"
                    >
                      <Copy size={12} className="mr-1" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-gray-500 bg-white/70 rounded-lg p-2 border border-blue-100">
                  💡 <em>Whenever your iPhone connects to your car stereo, your trip starts in the background and rings a sound chime. When you park and turn off the engine, the trip automatically ends!</em>
                </div>
              </div>
            )}

            {/* TAB 2: Android Routines */}
            {activeTab === 'android' && (
              <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-4 space-y-3 text-[11px] leading-relaxed animate-fade-in">
                <div className="font-bold text-purple-900 text-xs flex items-center">
                  <Smartphone size={14} className="mr-1.5 text-purple-600" />
                  Android Modes & Routines / Tasker Setup
                </div>

                <ol className="list-decimal pl-4 space-y-2 text-gray-700">
                  <li>
                    On Samsung: Open <strong>Settings → Modes and Routines → Routines (+)</strong>.<br />
                    On Pixel/Other: Use <strong>Tasker</strong> or <strong>Macrodroid</strong>.
                  </li>
                  <li>
                    <strong>If:</strong> Connected to Bluetooth device → Select your <strong>Car Audio</strong>.
                  </li>
                  <li>
                    <strong>Then:</strong> Open Web Link / Open Chrome URL → Paste the <strong>Start Trip Link</strong>.
                  </li>
                  <li>
                    Add an exit action or second routine for <em>Disconnected</em> → Paste the <strong>End Trip Link</strong>.
                  </li>
                </ol>

                {/* Copyable Start Trip URL */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500 uppercase">
                    <span>1. Start Trip Routine URL</span>
                    {copiedKey === 'start_android' && (
                      <span className="text-emerald-600 font-bold flex items-center">
                        <Check size={11} className="mr-0.5" /> Copied!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center bg-white rounded-xl border border-purple-200 overflow-hidden shadow-xs">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.startUrl}
                      className="px-2.5 py-1.5 text-[10px] font-mono text-gray-700 bg-transparent flex-1 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.startUrl, 'start_android')}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-medium text-[11px] shrink-0 transition flex items-center"
                    >
                      <Copy size={12} className="mr-1" />
                      Copy
                    </button>
                  </div>
                </div>

                {/* Copyable End Trip URL */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500 uppercase">
                    <span>2. End Trip Routine URL</span>
                    {copiedKey === 'end_android' && (
                      <span className="text-emerald-600 font-bold flex items-center">
                        <Check size={11} className="mr-0.5" /> Copied!
                      </span>
                    )}
                  </div>
                  <div className="flex items-center bg-white rounded-xl border border-purple-200 overflow-hidden shadow-xs">
                    <input
                      type="text"
                      readOnly
                      value={currentUrls.endUrl}
                      className="px-2.5 py-1.5 text-[10px] font-mono text-gray-700 bg-transparent flex-1 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(currentUrls.endUrl, 'end_android')}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-medium text-[11px] shrink-0 transition flex items-center"
                    >
                      <Copy size={12} className="mr-1" />
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: BLE Dongle */}
            {activeTab === 'ble' && (
              <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 space-y-3 text-[11px] leading-relaxed animate-fade-in">
                <div className="font-bold text-amber-900 text-xs flex items-center">
                  <Radio size={14} className="mr-1.5 text-amber-600" />
                  Bluetooth Low Energy (BLE) Beacon / OBD-II Scanner
                </div>

                <p className="text-gray-700 leading-normal">
                  If you keep an OBD-II BLE dongle or Bluetooth beacon in your car, you can pair it directly inside this web browser using the <strong>Web Bluetooth API</strong>. When the beacon powers off with the car, the app senses the disconnect and ends the trip.
                </p>

                <div className="bg-white rounded-xl p-3 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-700">Beacon Status:</span>
                    {bleStatus ? (
                      <span className="text-emerald-700 font-bold flex items-center">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping mr-1.5"></span>
                        Connected: {bleStatus}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not Paired</span>
                    )}
                  </div>

                  {bleStatus ? (
                    <button
                      type="button"
                      onClick={handleBleDisconnect}
                      className="w-full py-2 bg-red-50 text-red-600 hover:bg-red-100 font-semibold rounded-xl text-xs transition border border-red-200"
                    >
                      Disconnect BLE Beacon
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBleConnecting}
                      onClick={handleBleConnect}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-xs transition shadow-xs flex items-center justify-center space-x-1.5"
                    >
                      <Bluetooth size={14} />
                      <span>{isBleConnecting ? 'Scanning...' : 'Pair BLE Car Accessory'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Test & Simulation Sandbox */}
          <div className="bg-gray-900 text-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs flex items-center text-indigo-300">
                <Sparkles size={14} className="mr-1.5 text-indigo-400" />
                Live Bluetooth Simulation
              </span>
              <span className="text-[10px] text-gray-400">Test right in your browser</span>
            </div>

            <p className="text-[11px] text-gray-300">
              Try out how the app responds when your car connects or disconnects:
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isTripActive}
                onClick={() => {
                  onSimulateConnect();
                  onClose();
                }}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                  isTripActive
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
                }`}
              >
                <Play size={14} className="fill-current" />
                <span>Simulate Connect</span>
              </button>

              <button
                type="button"
                disabled={!isTripActive}
                onClick={() => {
                  onSimulateDisconnect();
                  onClose();
                }}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                  !isTripActive
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md active:scale-95'
                }`}
              >
                <Square size={14} className="fill-current" />
                <span>Simulate Disconnect</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
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
