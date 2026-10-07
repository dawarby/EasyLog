import React, { useState, useEffect } from 'react';
import {
  X,
  Gauge,
  Camera,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  FileCheck,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  History,
  Info,
  Keyboard,
  CameraOff
} from 'lucide-react';
import { Trip, VehicleCalibrationStatus } from '../types';
import {
  getVehicleCalibrationStatus,
  createAtoCalibrationTrip
} from '../services/odometerCalibrationService';
import { OdometerScanner } from './OdometerScanner';

interface OdometerCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: string[];
  selectedVehicle?: string;
  history: Trip[];
  onSaveCalibrationTrip: (trip: Trip) => void;
  lastKnownOdoForVehicle: (reg: string) => number | null;
  distanceUnit: 'km' | 'mi';
  showNotification?: (msg: string, type?: 'success' | 'error') => void;
}

export const OdometerCalibrationModal: React.FC<OdometerCalibrationModalProps> = ({
  isOpen,
  onClose,
  vehicles,
  selectedVehicle: initialVehicle,
  history,
  onSaveCalibrationTrip,
  lastKnownOdoForVehicle,
  distanceUnit,
  showNotification
}) => {
  const [vehicle, setVehicle] = useState<string>('');
  const [physicalOdo, setPhysicalOdo] = useState<string>('');
  const [notes, setNotes] = useState<string>('ATO Monthly Calibration & Cluster Sync');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [showAtoGuide, setShowAtoGuide] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const v = initialVehicle || (vehicles.length > 0 ? vehicles[0] : '');
      setVehicle(v);
      const appOdo = v ? lastKnownOdoForVehicle(v) : null;
      setPhysicalOdo(appOdo !== null ? appOdo.toString() : '');
      setPhotoUrl(undefined);
      setShowScanner(false);
      setShowAtoGuide(false);
    }
  }, [isOpen, initialVehicle, vehicles]);

  if (!isOpen) return null;

  const currentAppOdo = vehicle ? (lastKnownOdoForVehicle(vehicle) || 0) : 0;
  const parsedPhysicalOdo = parseInt(physicalOdo, 10);
  const isValidNumber = !isNaN(parsedPhysicalOdo) && parsedPhysicalOdo > 0;
  const drift = isValidNumber ? parsedPhysicalOdo - currentAppOdo : 0;
  const calibStatus = vehicle ? getVehicleCalibrationStatus(vehicle, history) : null;

  const handleApplyCalibration = () => {
    if (!vehicle) {
      showNotification?.('Please select a vehicle to calibrate.', 'error');
      return;
    }

    if (!isValidNumber) {
      showNotification?.('Please enter a valid physical odometer reading.', 'error');
      return;
    }

    if (parsedPhysicalOdo < currentAppOdo) {
      const confirmed = window.confirm(
        `Physical reading (${parsedPhysicalOdo} ${distanceUnit}) is lower than current logbook (${currentAppOdo} ${distanceUnit}). Continue with cluster adjustment?`
      );
      if (!confirmed) return;
    }

    const calibrationTrip = createAtoCalibrationTrip(
      vehicle,
      parsedPhysicalOdo,
      currentAppOdo,
      photoUrl,
      notes
    );

    onSaveCalibrationTrip(calibrationTrip);
    showNotification?.(
      `Odometer calibrated for ${vehicle}! Next trip begins at ${parsedPhysicalOdo.toLocaleString()} ${distanceUnit}.`,
      'success'
    );
    onClose();
  };

  const handleScanComplete = (value: number, imageUrl: string) => {
    setPhysicalOdo(value.toString());
    setPhotoUrl(imageUrl);
    setShowScanner(false);
    showNotification?.(`Cluster scanned: ${value.toLocaleString()} ${distanceUnit}`, 'success');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-amber-600 via-amber-700 to-indigo-800 text-white shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="bg-white/20 p-2.5 rounded-2xl backdrop-blur-md">
                <Gauge size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold flex items-center gap-1.5">
                  <span>ATO Odometer Calibration</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Monthly
                  </span>
                </h2>
                <p className="text-xs text-amber-100">
                  Align physical dashboard cluster with digital logbook records
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Vehicle Selection & Status Banner */}
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                Vehicle To Calibrate
              </label>
              <select
                value={vehicle}
                onChange={(e) => {
                  const newV = e.target.value;
                  setVehicle(newV);
                  const o = lastKnownOdoForVehicle(newV);
                  setPhysicalOdo(o !== null ? o.toString() : '');
                }}
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-800 font-mono font-medium focus:ring-2 focus:ring-amber-500 outline-none"
              >
                {vehicles.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>

              {calibStatus && (
                <div className="mt-2 flex items-center justify-between text-[11px] px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200/80">
                  <span className="text-gray-500 flex items-center gap-1">
                    <History size={12} />
                    Last calibrated:
                  </span>
                  <span className={`font-semibold ${calibStatus.isOverdue ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {calibStatus.lastCalibrationDate
                      ? `${calibStatus.daysSinceLastCalibration} days ago (${new Date(calibStatus.lastCalibrationDate).toLocaleDateString()})`
                      : 'Never (Initial calibration needed)'}
                  </span>
                </div>
              )}
            </div>

            {/* Reconciliation Comparison Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* App Estimated Odometer */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Logbook Recorded
                </span>
                <div className="text-xl font-mono font-black text-slate-800">
                  {currentAppOdo.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1">{distanceUnit}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Based on sum of completed GPS & camera trips.
                </p>
              </div>

              {/* Physical Dashboard Reading */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                  Actual Dashboard Cluster
                </span>
                <div className="text-xl font-mono font-black text-amber-950">
                  {isValidNumber ? parsedPhysicalOdo.toLocaleString() : '---'}
                  <span className="text-xs font-normal text-amber-600 ml-1">{distanceUnit}</span>
                </div>
                <p className="text-[10px] text-amber-700 leading-snug">
                  Enter physical reading or snap dashboard below.
                </p>
              </div>
            </div>

            {/* Input & AI Dashboard Scanner */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Keyboard size={14} className="text-amber-600" />
                  <span>Physical Dashboard Reading ({distanceUnit})</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 py-0.5 bg-indigo-50 hover:bg-indigo-100 px-2 rounded-lg transition"
                >
                  <Camera size={13} />
                  <span>Snap Dashboard Photo</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type="number"
                  value={physicalOdo}
                  onChange={(e) => setPhysicalOdo(e.target.value)}
                  placeholder={currentAppOdo.toString()}
                  className="w-full px-4 py-3 text-lg font-mono font-bold bg-white border border-gray-300 rounded-2xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-gray-900 shadow-2xs"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 uppercase">
                  {distanceUnit}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                <span>
                  {photoUrl ? (
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-emerald-600 inline" /> Photo attached
                    </span>
                  ) : (
                    <span className="text-gray-500 flex items-center gap-1">
                      <CameraOff size={12} className="text-gray-400" /> Manual keypad entry active (no camera needed)
                    </span>
                  )}
                </span>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl(undefined)}
                    className="text-gray-400 hover:text-red-500 text-[10.5px] underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>

              {photoUrl && (
                <div className="flex items-center space-x-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                  <span className="truncate">
                    Dashboard photo attached as ATO substantiation evidence.
                  </span>
                </div>
              )}
            </div>

            {/* Calculated Variance / Drift Explanation */}
            {isValidNumber && (
              <div
                className={`p-3.5 rounded-2xl border ${
                  drift === 0
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : drift > 0
                    ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span>Reconciliation Variance</span>
                  <span className="font-mono text-sm">
                    {drift > 0 ? `+${drift}` : drift} {distanceUnit}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {drift === 0 && (
                    <>
                      <strong>Perfect Match:</strong> Your logbook is 100% aligned with the physical dashboard. A monthly verification record will be timestamped for your records.
                    </>
                  )}
                  {drift > 0 && (
                    <>
                      <strong>+ {drift} {distanceUnit} gap detected:</strong> In compliance with ATO Division 28 rules, unlogged dashboard movement is safely logged as <em>Personal travel</em> so business tax deductions are never overstated.
                    </>
                  )}
                  {drift < 0 && (
                    <>
                      <strong>{drift} {distanceUnit} drift:</strong> The dashboard rolled slightly less than GPS logged (often due to underground carparks or minor GPS overshoot). Baseline will reset to exact dashboard cluster.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Reason / Notes */}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Calibration Note / Tax Record Reason
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Monthly calibration / 15,000km service invoice sync"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none text-gray-800"
              />
            </div>

            {/* ATO Compliance Accordion */}
            <div className="border border-gray-200 rounded-2xl p-3.5 bg-gray-50/60">
              <button
                type="button"
                onClick={() => setShowAtoGuide(!showAtoGuide)}
                className="w-full flex items-center justify-between text-xs font-bold text-gray-700"
              >
                <div className="flex items-center gap-1.5 text-indigo-900">
                  <ShieldCheck size={16} className="text-indigo-600" />
                  <span>Why Monthly Calibration Keeps You ATO Compliant</span>
                </div>
                <span className="text-indigo-600 text-xs">{showAtoGuide ? 'Hide' : 'Read'}</span>
              </button>

              {showAtoGuide && (
                <div className="mt-2.5 pt-2.5 border-t border-gray-200 text-[11px] text-gray-600 space-y-1.5 leading-relaxed">
                  <p>
                    <strong>1. Continuous Odometer Chain:</strong> The ATO requires logbooks to show an unbroken chain of odometer readings matching vehicle service invoices, roadworthy certificates, and actual vehicle disposal.
                  </p>
                  <p>
                    <strong>2. GPS vs Cluster Drift:</strong> GPS measures straight ground path, while dashboard odometers count wheel rotations. Monthly calibration ensures drift never accumulates beyond 1–2%.
                  </p>
                  <p>
                    <strong>3. Photographic Substantiation:</strong> Attaching dashboard snapshots gives you bulletproof documentation during any Australian Taxation Office audit.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-2 shrink-0">
            <button
              type="button"
              onClick={handleApplyCalibration}
              className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-indigo-700 hover:from-amber-500 hover:to-indigo-600 text-white font-bold rounded-2xl shadow-md transition flex items-center justify-center space-x-2 text-sm"
            >
              <FileCheck size={18} />
              <span>Confirm Calibration & Sync Baseline</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs text-gray-500 font-semibold hover:text-gray-700 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Camera Dashboard Scanner modal if user clicks 'Snap Dashboard Photo' */}
      {showScanner && (
        <OdometerScanner
          onCancel={() => setShowScanner(false)}
          onScanComplete={handleScanComplete}
          mode="end"
          prefilledValue={currentAppOdo}
          vehicles={vehicles}
          distanceUnit={distanceUnit}
        />
      )}
    </>
  );
};
