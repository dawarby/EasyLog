import React from 'react';
import { useOnlineStatus } from '../useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-900/20 animate-bounce">
      <WifiOff size={14} className="shrink-0" />
      <span>Offline Mode — Cached data and camera logging active.</span>
    </div>
  );
};
