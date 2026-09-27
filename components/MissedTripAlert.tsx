import React from 'react';
import { AlertTriangle, Plus, ArrowRight, SkipForward, X } from 'lucide-react';

interface MissedTripAlertProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMissed: () => void;
  onIgnore: () => void;
  data: {
    gap: number;
    lastOdo: number;
    currentOdo: number;
    vehicle: string;
  } | null;
  distanceUnit: 'km' | 'mi';
}

export const MissedTripAlert: React.FC<MissedTripAlertProps> = ({
  isOpen,
  onClose,
  onAddMissed,
  onIgnore,
  data,
  distanceUnit
}) => {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex items-center justify-between">
           <div className="flex items-center text-amber-700 font-bold">
              <AlertTriangle size={20} className="mr-2" />
              Missed Trip Detected
           </div>
           <button onClick={onClose} className="text-amber-400 hover:text-amber-600">
             <X size={20} />
           </button>
        </div>

        <div className="p-6">
           <div className="mb-4 text-gray-600 text-sm leading-relaxed">
             We noticed a gap in your odometer readings for <span className="font-bold text-gray-800">{data.vehicle}</span>.
           </div>

           <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
              <div className="text-center">
                 <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Last Trip</div>
                 <div className="font-mono font-bold text-gray-700 text-lg">{data.lastOdo.toLocaleString()}</div>
              </div>
              <div className="flex flex-col items-center px-2">
                 <ArrowRight size={16} className="text-gray-300 mb-1" />
                 <div className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                   + {data.gap.toLocaleString()} {distanceUnit}
                 </div>
              </div>
              <div className="text-center">
                 <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Current</div>
                 <div className="font-mono font-bold text-indigo-600 text-lg">{data.currentOdo.toLocaleString()}</div>
              </div>
           </div>

           <p className="text-center text-sm text-gray-500 mb-6">
             Would you like to log this as a trip before starting your new one?
           </p>

           <div className="space-y-3">
             <button 
               onClick={onAddMissed}
               className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center transition transform active:scale-95"
             >
               <Plus size={18} className="mr-2" />
               Log Missed Trip
             </button>
             
             <button 
               onClick={onIgnore}
               className="w-full py-3 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-xl flex items-center justify-center transition"
             >
               <SkipForward size={18} className="mr-2 text-gray-400" />
               Skip & Start New Trip
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};
