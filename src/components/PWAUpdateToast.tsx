'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, X, Zap } from 'lucide-react';
import { Button } from './Button';

export const PWAUpdateToast = () => {
    const [showUpdate, setShowUpdate] = useState(false);
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

        // Handle the reload when the new SW takes control
        const handleControllerChange = () => {
            window.location.reload();
        };

        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

        const checkUpdate = async () => {
            try {
                const reg = await navigator.serviceWorker.getRegistration();
                if (!reg) return;

                // 1. If there's already a waiting worker, show update immediately
                if (reg.waiting) {
                    setRegistration(reg);
                    setShowUpdate(true);
                    return;
                }

                // 2. If there's an installing worker, wait for it to be installed
                if (reg.installing) {
                    trackInstalling(reg.installing);
                    return;
                }

                // 3. Listen for future updates
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) trackInstalling(newWorker);
                });

            } catch (err) {
                console.error('Error checking for SW update:', err);
            }
        };

        const trackInstalling = (worker: ServiceWorker) => {
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New content is available and waiting
                    navigator.serviceWorker.getRegistration().then(reg => {
                        if (reg) {
                            setRegistration(reg);
                            setShowUpdate(true);
                        }
                    });
                }
            });
        };

        checkUpdate();

        // Check for updates periodically (every hour)
        const interval = setInterval(() => {
            navigator.serviceWorker.getRegistration().then(reg => reg?.update());
        }, 60 * 60 * 1000);

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
            clearInterval(interval);
        };
    }, []);

    const handleUpdate = () => {
        if (!registration || !registration.waiting) return;
        // Send message to skip waiting and activate the new worker
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });

        // Sometimes strictly sending message isn't enough if the logic inside SW doesn't handle it (though workbox usually does).
        // The controllerchange listener will handle the reload.
    };

    const handleDismiss = () => {
        setShowUpdate(false);
    };

    if (!showUpdate) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-[60] animate-in slide-in-from-bottom-5 duration-500 flex justify-center">
            <div className="bg-[#1c1c1e] text-white/90 border border-white/10 shadow-2xl rounded-2xl p-5 w-full max-w-sm relative overflow-hidden">
                {/* Visual Flair */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={18} />
                </button>

                <div className="flex gap-4 items-start pt-2">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl shrink-0 flex items-center justify-center shadow-lg shadow-blue-900/20">
                        <RefreshCw className="w-6 h-6 text-white animate-spin-slow" />
                    </div>

                    <div className="space-y-2 flex-1">
                        <h3 className="font-bold text-white text-lg leading-tight flex items-center gap-2">
                            Update Available
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30 uppercase tracking-wide">
                                New
                            </span>
                        </h3>
                        <p className="text-sm text-gray-400 leading-snug">
                            A new version of Vpub is available. Update now for the latest features and speed improvements.
                        </p>

                        <Button
                            onClick={handleUpdate}
                            className="w-full bg-white text-black hover:bg-gray-200 font-bold py-2.5 rounded-xl mt-2 transition-all flex items-center justify-center gap-2"
                        >
                            <Zap size={16} className="fill-current" />
                            Update Now
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
