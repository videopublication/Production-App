'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const OfflineIndicator = () => {
    const isOnline = useOnlineStatus();
    const [hasBeenOffline, setHasBeenOffline] = useState(false);
    const [showRestored, setShowRestored] = useState(false);

    useEffect(() => {
        if (!isOnline) {
            setHasBeenOffline(true);
            setShowRestored(false);
        } else if (hasBeenOffline) {
            // Was offline, now online
            setShowRestored(true);
            const timer = setTimeout(() => {
                setShowRestored(false);
                setHasBeenOffline(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isOnline, hasBeenOffline]);

    if (isOnline && !showRestored) return null;

    return (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
            <div
                className={`
                    backdrop-blur-md px-4 py-2 rounded-full shadow-lg border flex items-center gap-2 text-sm font-medium transition-all duration-300
                    ${!isOnline
                        ? 'bg-zinc-800/95 text-white border-red-500/30'
                        : 'bg-emerald-600/95 text-white border-emerald-400/30'
                    }
                `}
                role="alert"
            >
                {!isOnline ? (
                    <>
                        <WifiOff size={14} className="text-red-400" />
                        <span>You are offline</span>
                    </>
                ) : (
                    <>
                        <Wifi size={14} className="text-white" />
                        <span>Back Online</span>
                    </>
                )}
            </div>
        </div>
    );
};
