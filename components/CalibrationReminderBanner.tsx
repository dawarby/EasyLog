import React from 'react';
import { AlertTriangle, Gauge, ArrowRight, X, ShieldAlert } from 'lucide-react';
import { VehicleCalibrationStatus } from '../types';

interface CalibrationReminderBannerProps {
  overdueVehicles: VehicleCalibrationStatus[];
  onOpenCalibration: (vehicleReg: string) => void;
  onDismiss?: () => void;
}

export const CalibrationReminderBanner: React.FC<CalibrationReminderBannerProps> = ({
  overdueVehicles,
  onOpenCalibration,
  onDismiss
}) => {
  if (overdueVehicles.length === 0) return null;

  const primary = overdueVehicles[0];

  return (
    <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-2xl p-3.5 shadow-md shadow-amber-900/10 flex items-center justify-between gap-3 animate-fade-in border border-amber-400/40">
      <div className="flex items-start space-x-3 overflow-hidden">
        <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl shrink-0 mt-0.5">
          <Gauge size={18} className="text-white animate-pulse" />
        </div>
        <div className="overflow-hidden">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full">
              ATO Compliance
            </span>
            <span className="text-xs font-bold truncate">
              Monthly Odometer Calibration Due
            </span>
          </div>
          <p className="text-[11px] text-amber-100 leading-snug mt-0.5 truncate">
            {primary.vehicleReg}: {primary.daysSinceLastCalibration} days since last dashboard sync. Align cluster to keep tax records legally defensible.
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        <button
          type="button"
          onClick={() => onOpenCalibration(primary.vehicleReg)}
          className="px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-900 text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1"
        >
          <span>Calibrate</span>
          <ArrowRight size={13} />
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition"
            title="Remind me later"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
