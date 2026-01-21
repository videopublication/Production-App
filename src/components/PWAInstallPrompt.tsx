'use client';

import React, { useState, useEffect } from 'react';
import { Share, X } from 'lucide-react';
import { Button } from './Button';

export const PWAInstallPrompt = () => {
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // Only run on client
        if (typeof window === 'undefined') return;

        // check if already in standalone mode (installed)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        if (isStandalone) return;

        // Check if iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOS = /iphone|ipad|ipod/.test(userAgent);

        // Check if dismissed previously in this session
        const isDismissed = sessionStorage.getItem('pwa-prompt-dismissed');

        if (isIOS && !isDismissed) {
            // Small delay to not overwhelm user immediately
            const timer = setTimeout(() => setShowPrompt(true), 3000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleDismiss = () => {
        setShowPrompt(false);
        sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-500">
            <div className="bg-white/90 backdrop-blur-md border border-gray-200 shadow-xl rounded-2xl p-4 md:max-w-md mx-auto relative dark:bg-gray-900/90 dark:border-gray-800">
                <button
                    onClick={handleDismiss}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                    <X size={16} />
                </button>

                <div className="flex gap-4 items-start">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-xl shrink-0">
                        <Share className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                            Install Vpub App
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Install this application on your home screen for quick and easy access.
                        </p>
                        <div className="flex flex-col gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg">
                            <div className="flex items-center gap-2">
                                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full text-[10px] font-bold">1</span>
                                <span>Tap the <Share className="w-3 h-3 inline mx-0.5" /> <strong>Share</strong> button below</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full text-[10px] font-bold">2</span>
                                <span>Select <strong>Add to Home Screen</strong></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pointer arrow pointing down to the share button typically found on Safari bottom bar */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/90 dark:bg-gray-900/90 rotate-45 border-r border-b border-gray-200 dark:border-gray-800"></div>
            </div>
        </div>
    );
};
