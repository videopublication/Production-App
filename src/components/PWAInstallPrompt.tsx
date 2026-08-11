'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Smartphone, Share, PlusSquare, MoreVertical } from 'lucide-react';

export function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showGuideModal, setShowGuideModal] = useState(false);
    const installClickedRef = useRef(false);

    useEffect(() => {
        // Sanitize and unregister any stale localhost service workers
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (const registration of registrations) {
                    if (registration.active?.scriptURL.includes('localhost')) {
                        console.log('Unregistering stale localhost service worker:', registration.active.scriptURL);
                        registration.unregister();
                    }
                }
            }).catch(() => {});
        }

        // Detect if user is ALREADY running the installed PWA
        const checkStandalone = () => {
            const standaloneMode =
                window.matchMedia('(display-mode: standalone)').matches ||
                (window.navigator as any).standalone === true;
            setIsStandalone(standaloneMode);
            return standaloneMode;
        };

        const inPWA = checkStandalone();

        // IF ALREADY INSTALLED & RUNNING AS PWA -> DO NOT SHOW PROMPT!
        if (inPWA) {
            setShowPrompt(false);
            return;
        }

        // Check if user previously dismissed prompt in this session
        const isDismissed = sessionStorage.getItem('pwa_prompt_dismissed');
        if (!isDismissed) {
            setShowPrompt(true);
        }

        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            if (!checkStandalone()) {
                setShowPrompt(true);
            }
            // If user already clicked "Install Now" before event arrived, trigger prompt immediately!
            if (installClickedRef.current) {
                (e as any).prompt();
                installClickedRef.current = false;
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleDismiss = () => {
        sessionStorage.setItem('pwa_prompt_dismissed', 'true');
        setShowPrompt(false);
    };

    const handleInstall = async () => {
        if (deferredPrompt) {
            try {
                await deferredPrompt.prompt();
                const choiceResult = await deferredPrompt.userChoice;
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    setShowPrompt(false);
                }
                setDeferredPrompt(null);
            } catch (err) {
                console.warn('Install prompt failed, fallback to guide:', err);
                setShowGuideModal(true);
            }
        } else {
            // Mark that install was clicked so if event fires in next 1 second it triggers
            installClickedRef.current = true;
            
            // Check if iOS Safari (where Apple doesn't allow 1-click API)
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
            if (isIOS) {
                setShowGuideModal(true);
            } else {
                // On Chrome, wait 1.5 seconds for deferredPrompt to arrive before showing fallback guide
                setTimeout(() => {
                    if (installClickedRef.current && !deferredPrompt) {
                        setShowGuideModal(true);
                        installClickedRef.current = false;
                    }
                }, 1200);
            }
        }
    };

    // Hide prompt completely if running inside installed PWA or if user dismissed it
    if (isStandalone || !showPrompt) return null;

    return (
        <>
            <div className="fixed top-16 left-1/2 -translate-x-1/2 md:top-auto md:bottom-6 md:left-auto md:right-6 md:translate-x-0 z-[99999] w-[90%] max-w-sm bg-[#1c1d21] text-white p-5 rounded-2xl shadow-2xl border border-white/10 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4">
                        <div className="text-[#34c759] pt-1.5 mt-0.5 flex-shrink-0">
                            <Download className="w-7 h-7 stroke-[2.2] animate-bounce" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                                </span>
                                <h4 className="font-bold text-base text-white tracking-tight">Update Required</h4>
                            </div>
                            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                Install the app for a better experience with offline access and notifications.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <button
                    onClick={handleInstall}
                    className="w-full py-2.5 bg-[#34c759] hover:bg-[#2fb350] active:bg-[#28cd41] text-white font-semibold text-sm rounded-xl shadow-[0_0_20px_rgba(52,199,89,0.4)] transition-all text-center flex items-center justify-center gap-2"
                >
                    <Download className="w-4 h-4" />
                    Install Now
                </button>
            </div>

            {/* Custom Instruction Modal ONLY for iOS Safari or fallback */}
            {showGuideModal && (
                <div className="fixed inset-0 z-[100000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1c1d21] border border-white/10 text-white rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[#34c759]">
                                <Smartphone className="w-5 h-5" />
                                <h3 className="font-bold text-base">Install App</h3>
                            </div>
                            <button
                                onClick={() => setShowGuideModal(false)}
                                className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed">
                            To install the VP App on your device:
                        </p>

                        <div className="space-y-3 text-xs text-zinc-300">
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="p-2 bg-[#34c759]/20 text-[#34c759] rounded-lg">
                                    <MoreVertical className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="font-semibold text-white">Step 1</span>
                                    <p className="text-[11px] text-zinc-400">Tap your browser menu (<strong className="text-white">⋮</strong> or <strong className="text-white">Share</strong>)</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="p-2 bg-[#34c759]/20 text-[#34c759] rounded-lg">
                                    <PlusSquare className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="font-semibold text-white">Step 2</span>
                                    <p className="text-[11px] text-zinc-400">Select <strong className="text-white">&quot;Install App&quot;</strong> or <strong className="text-white">&quot;Add to Home Screen&quot;</strong></p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowGuideModal(false)}
                            className="w-full py-2.5 bg-[#34c759] hover:bg-[#2fb350] text-white font-semibold text-xs rounded-xl shadow-md transition-all mt-2"
                        >
                            Got It
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
