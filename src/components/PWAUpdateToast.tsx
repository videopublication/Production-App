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

    const [isUpdating, setIsUpdating] = useState(false);

    const handleUpdate = async () => {
        setIsUpdating(true);
        // 1. Refresh registration
        const reg = await navigator.serviceWorker.getRegistration();

        if (reg && reg.waiting) {
            // 2. Set a fallback timeout: if update takes too long (e.g. SW stuck), force it.
            const timeoutId = setTimeout(() => {
                console.warn("SW update timed out. Forcing hard release.");
                reg.unregister().then(() => {
                    window.location.reload();
                });
            }, 4000);

            // 3. Listen for successful activation to clear timeout (optimization)
            const onControllerChange = () => {
                clearTimeout(timeoutId);
                // Reload happens in the main useEffect
            };
            navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

            // 4. Send signal
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            // No waiting worker - just unregister and reload to be safe
            console.log("No waiting worker found. Performing hard refresh.");
            if (reg) await reg.unregister();
            window.location.reload();
        }
    };

    const handleDismiss = () => {
        setShowUpdate(false);
    };

    if (!showUpdate) return null;

    return (
        <div className="fixed bottom-24 left-4 right-4 z-[100] animate-in slide-in-from-bottom-5 duration-500 flex justify-center pointer-events-none">
            <div className="bg-[#1c1c1e] text-white border border-white/10 shadow-2xl rounded-2xl p-5 w-full max-w-sm relative overflow-hidden pointer-events-auto">
                {/* Visual Flair */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />

                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white transition-colors cursor-pointer z-10"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>

                <div className="flex gap-4 items-start pt-2">
                    <div className="bg-gradient-to-br from-primary to-indigo-600 p-3 rounded-xl shrink-0 flex items-center justify-center shadow-lg shadow-primary/20">
                        <RefreshCw className={`w-6 h-6 text-white ${isUpdating ? 'animate-spin' : 'animate-spin-slow'}`} />
                    </div>

                    <div className="space-y-2 flex-1">
                        <h3 className="font-bold text-white text-lg leading-tight flex items-center gap-2">
                            Update Available
                            <span className="text-[10px] bg-primary/ text-primary px-2 py-0.5 rounded-full border border-primary/30 uppercase tracking-wide">
                                New
                            </span>
                        </h3>
                        <p className="text-sm text-gray-400 leading-snug">
                            A new version of Vpub is available. Update now for the latest features.
                        </p>

                        <button
                            onClick={handleUpdate}
                            disabled={isUpdating}
                            style={{ backgroundColor: '#ffffff', color: '#000000' }}
                            className="w-full font-bold py-3 rounded-xl mt-3 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 text-sm disabled:opacity-70"
                        >
                            {isUpdating ? 'Updating...' : (
                                <>
                                    <Zap size={16} className="fill-current" />
                                    Update Now
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
