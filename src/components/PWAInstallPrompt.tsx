'use client';

import React, { useState, useEffect } from 'react';
import { Share, X, Download } from 'lucide-react';
import { Button } from './Button';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export const PWAInstallPrompt = () => {
    const [showPrompt, setShowPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Only run on client
        if (typeof window === 'undefined') return;

        // check if already in standalone mode (installed)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        if (isStandalone) return;

        // Check if dismissed previously in this session
        const isDismissed = sessionStorage.getItem('pwa-prompt-dismissed');
        if (isDismissed === 'true') {
            return;
        }

        // 1. Listen for native install prompt (Android/Chrome)
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault(); // Prevent automatic mini-infobar
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setShowPrompt(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // 2. Check if iOS (fallback since it doesn't support beforeinstallprompt)
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice =
            /iphone|ipad|ipod/.test(userAgent) ||
            (userAgent.includes('mac') && navigator.maxTouchPoints > 2); // Modern iPads
        setIsIOS(isIOSDevice);

        if (isIOSDevice) {
            // Small delay to not overwhelm user immediately
            const timer = setTimeout(() => setShowPrompt(true), 3000);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            };
        }

        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleDismiss = () => {
        setShowPrompt(false);
        sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    };

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Show the native install prompt
        await deferredPrompt.prompt();

        // Wait for usage to respond
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }

        // Save dismissal to prevent immediate re-prompting if installation fails or is cancelled
        sessionStorage.setItem('pwa-prompt-dismissed', 'true');

        // We can't use the prompt again, discard it
        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-500 flex justify-center">
            {/* 
               We use a dark theme by default to match the screenshot provided by user
               bg-[#1c1c1e] matches typical iOS dark mode / modern app feel 
            */}
            <div className="bg-[#1c1c1e] text-white/90 border border-white/10 shadow-2xl rounded-2xl p-5 w-full max-w-sm relative">
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={18} />
                </button>

                <div className="flex gap-4 items-start">
                    {/* App Icon / Graphic */}
                    <div className="bg-primary/ p-3 rounded-xl shrink-0 flex items-center justify-center">
                        {isIOS ? (
                            <Share className="w-8 h-8 text-primary" />
                        ) : (
                            <Download className="w-8 h-8 text-primary" />
                        )}
                    </div>

                    <div className="space-y-3 flex-1">
                        <h3 className="font-bold text-white text-lg leading-tight">
                            Install Vpub App
                        </h3>
                        <p className="text-sm text-gray-400 leading-snug">
                            {isIOS
                                ? "Install this application on your home screen for quick and easy access."
                                : "Install the app for a better experience with offline access and notifications."
                            }
                        </p>

                        {/* Action Area */}
                        {isIOS ? (
                            <div className="flex flex-col gap-2 text-xs text-gray-300 mt-2 bg-white/5 p-3 rounded-xl">
                                <div className="flex items-center gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-white/10 rounded-full text-[10px] font-bold">1</span>
                                    <span>Tap the <Share className="w-3 h-3 inline mx-0.5" /> <strong>Share</strong> button below</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-white/10 rounded-full text-[10px] font-bold">2</span>
                                    <span>Select <strong>Add to Home Screen</strong></span>
                                </div>
                            </div>
                        ) : (
                            <Button
                                onClick={handleInstallClick}
                                className="w-full bg-primary hover:bg-primary text-white font-semibold py-2 rounded-xl mt-1 transition-all"
                            >
                                Install Now
                            </Button>
                        )}
                    </div>
                </div>

                {isIOS && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#1c1c1e] rotate-45 border-r border-b border-white/10"></div>
                )}
            </div>
        </div>
    );
};
