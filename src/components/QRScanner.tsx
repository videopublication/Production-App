'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
// import { Html5Qrcode } from 'html5-qrcode'; // Removed top-level import

interface QRScannerProps {
    onScan: (decodedText: string) => void;
    onError?: (error: string) => void;
    continuous?: boolean;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onError, continuous = true }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string>('');
    const [torchOn, setTorchOn] = useState(false);
    // Use any for the scanner instance since we are dynamically importing
    const scannerRef = useRef<any>(null);
    const isInitialized = useRef(false);
    const [scannerId] = useState(() => `qr-reader-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
    const lastScannedRef = useRef<{ text: string; time: number } | null>(null);

    const toggleTorch = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.applyVideoConstraints({
                    advanced: [{ torch: !torchOn } as any]
                });
                setTorchOn(!torchOn);
            } catch (err) {
                console.error("Failed to toggle torch", err);
            }
        }
    };

    const startScanning = async () => {
        if (!isSecureContext) {
            const errorMsg = 'Camera access requires HTTPS. Please use autocomplete or manual entry instead.';
            setError(errorMsg);
            if (onError) onError(errorMsg);
            return;
        }
        try {
            setError('');
            setTorchOn(false);

            if (scannerRef.current && isInitialized.current) {
                try {
                    await scannerRef.current.stop();
                    scannerRef.current.clear();
                } catch {
                    // Ignore cleanup errors
                }
            }

            // Dynamic import
            const { Html5Qrcode } = await import('html5-qrcode');

            const scanner = new Html5Qrcode(scannerId);
            scannerRef.current = scanner;

            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
            };

            await scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    const now = Date.now();
                    if (lastScannedRef.current &&
                        lastScannedRef.current.text === decodedText &&
                        now - lastScannedRef.current.time < 2000) {
                        return;
                    }

                    lastScannedRef.current = { text: decodedText, time: now };
                    onScan(decodedText);

                    if (!continuous) {
                        stopScanning();
                    }
                },
                () => {
                    // Ignore continuous scanning errors
                }
            );

            setIsScanning(true);
            isInitialized.current = true;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to start camera';
            setError(errorMsg);
            if (onError) onError(errorMsg);
            console.error('QR Scanner Error:', err);
            scannerRef.current = null;
            isInitialized.current = false;
        }
    };

    const stopScanning = async () => {
        if (scannerRef.current && isInitialized.current) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
                scannerRef.current = null;
                isInitialized.current = false;
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
        }
        setIsScanning(false);
    };

    useEffect(() => {
        return () => {
            stopScanning();
        };
    }, []);

    return (
        <Card className="p-6">
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold w-full sm:w-auto text-center sm:text-left">QR Code Scanner</h3>
                    {isScanning ? (
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
                            <Button
                                onClick={toggleTorch}
                                size="sm"
                                variant="outline"
                                className={torchOn ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" : ""}
                                title="Toggle Flashlight"
                            >
                                <svg className="w-4 h-4" fill={torchOn ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </Button>
                            <Button variant="danger" onClick={stopScanning} size="sm">
                                Stop Camera
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={startScanning} size="sm" className="w-full sm:w-auto">
                            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Start Camera
                        </Button>
                    )}
                </div>

                <div
                    id={scannerId}
                    className={`w-full rounded-lg bg-muted ${isScanning ? 'block' : 'hidden'}`}
                    style={{
                        width: '100%',
                        minHeight: '300px',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                />
                <style jsx global>{`
                    #${scannerId} video {
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: cover !important;
                        display: block !important;
                        border-radius: 0.5rem;
                    }
                    #${scannerId} canvas {
                        display: none !important;
                    }
                `}</style>

                {!isScanning && !error && (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                        <svg className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        <p className="text-sm">Click &quot;Start Camera&quot; to scan QR codes</p>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-sm text-destructive font-medium">Camera Access Error</p>
                        <p className="text-xs text-destructive/80 mt-1">{error}</p>
                        <div className="mt-3 p-3 bg-card rounded border border-border">
                            <p className="text-xs font-medium mb-2">Common Solutions:</p>
                            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                                <li>Grant camera permissions when prompted</li>
                                <li>Use Chrome or Safari browser</li>
                                <li>Camera requires HTTPS on mobile devices</li>
                                <li>Try using manual entry or autocomplete instead</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

// Mobile-optimized immersive scanner component with auto-start and camera refresh
interface MobileScannerProps {
    onScan: (decodedText: string) => void;
    onError?: (error: string) => void;
    onClose?: () => void;
    autoStart?: boolean;
}

export const MobileScanner: React.FC<MobileScannerProps> = ({
    onScan,
    onError,
    onClose,
    autoStart = true
}) => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string>('');
    const [scanCount, setScanCount] = useState(0);
    const [torchOn, setTorchOn] = useState(false);
    const scannerRef = useRef<any>(null);
    const isInitialized = useRef(false);
    const [scannerId] = useState(() => `mobile-qr-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
    const lastScannedRef = useRef<{ text: string; time: number } | null>(null);

    const toggleTorch = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.applyVideoConstraints({
                    advanced: [{ torch: !torchOn } as any]
                });
                setTorchOn(!torchOn);
            } catch (err) {
                console.error("Failed to toggle torch", err);
                // Torch might not be supported on this device
            }
        }
    };

    const startScanning = async () => {
        if (!isSecureContext) {
            const errorMsg = 'Camera access requires HTTPS.';
            setError(errorMsg);
            if (onError) onError(errorMsg);
            return;
        }

        try {
            setError('');
            setTorchOn(false); // Reset torch state

            if (scannerRef.current && isInitialized.current) {
                try {
                    await scannerRef.current.stop();
                    scannerRef.current.clear();
                } catch {
                    // Ignore cleanup errors
                }
            }

            // Dynamic import
            const { Html5Qrcode } = await import('html5-qrcode');

            const scanner = new Html5Qrcode(scannerId);
            scannerRef.current = scanner;

            const config = {
                fps: 15,
                qrbox: { width: 280, height: 280 },
                aspectRatio: 1.0,
            };

            await scanner.start(
                { facingMode: 'environment' },
                config,
                async (decodedText) => {
                    const now = Date.now();
                    if (lastScannedRef.current &&
                        lastScannedRef.current.text === decodedText &&
                        now - lastScannedRef.current.time < 1500) {
                        return;
                    }

                    lastScannedRef.current = { text: decodedText, time: now };
                    setScanCount(prev => prev + 1);
                    onScan(decodedText);

                    // Brief pause then refresh camera for fresh data
                    try {
                        await scanner.pause(true);
                        setTimeout(async () => {
                            try {
                                await scanner.resume();
                            } catch {
                                // If resume fails, restart
                                refreshCamera();
                            }
                        }, 300);
                    } catch {
                        // Ignore pause errors
                    }
                },
                () => { }
            );

            setIsScanning(true);
            isInitialized.current = true;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to start camera';
            setError(errorMsg);
            if (onError) onError(errorMsg);
            console.error('Mobile Scanner Error:', err);
            scannerRef.current = null;
            isInitialized.current = false;
        }
    };

    const stopScanning = async () => {
        if (scannerRef.current && isInitialized.current) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
                scannerRef.current = null;
                isInitialized.current = false;
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
        }
        setIsScanning(false);
    };

    const refreshCamera = async () => {
        await stopScanning();
        setTimeout(() => {
            startScanning();
        }, 100);
    };

    // Auto-start on mount
    useEffect(() => {
        if (autoStart) {
            const timer = setTimeout(() => {
                startScanning();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [autoStart]);

    useEffect(() => {
        return () => {
            stopScanning();
        };
    }, []);

    return (
        <div className="relative bg-black w-full h-full overflow-hidden">
            {/* Scanner container */}
            <div
                id={scannerId}
                className="w-full h-full"
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            />

            {/* Scan overlay with corners */}
            {isScanning && (
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px]">
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-[#0071e3] to-transparent animate-scan-line rounded-full shadow-[0_0_15px_rgba(0,113,227,0.8)]" />
                    </div>
                    {/* Darker backdrop outside scan area */}
                    <div className="absolute inset-0 bg-black/30 pointer-events-none" style={{
                        maskImage: 'linear-gradient(to bottom, black 35%, transparent 35%, transparent 65%, black 65%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 35%, transparent 35%, transparent 65%, black 65%)'
                    }} />
                </div>
            )}

            {/* Scan count indicator */}
            {scanCount > 0 && (
                <div className="absolute top-0 left-3 mt-3 px-4 py-2 bg-[#34c759]/90 backdrop-blur-md rounded-full shadow-lg border border-white/10 z-50">
                    <span className="text-white text-[14px] font-bold tracking-wide">{scanCount} scanned</span>
                </div>
            )}

            {/* Controls Container */}
            <div className="absolute top-0 right-3 mt-3 z-50 flex items-center gap-3">
                {/* Torch Button */}
                {isScanning && (
                    <button
                        onClick={toggleTorch}
                        className={`w-10 h-10 backdrop-blur-xl rounded-full flex items-center justify-center transition-all shadow-lg border border-white/10 active:scale-90 ${torchOn ? 'bg-white text-black' : 'bg-black/40 text-white hover:bg-black/60'}`}
                        aria-label="Toggle Flashlight"
                    >
                        {torchOn ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2a1 1 0 011 1v6a1 1 0 11-2 0V3a1 1 0 011-1zm0 13a3 3 0 100 6 3 3 0 000-6zm-5-3a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zm10 0a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1z" />
                                <path fillRule="evenodd" d="M12 9a1 1 0 00-1 1v.268a2 2 0 01-.895 1.789l-.667.333a2 2 0 00-.895 1.789V16a1 1 0 001 1h5a1 1 0 001-1v-1.82a2 2 0 00-.895-1.79l-.667-.333A2 2 0 0113 10.268V10a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        )}
                    </button>
                )}

                {/* Close Button */}
                {onClose && (
                    <button
                        onClick={() => {
                            stopScanning();
                            onClose();
                        }}
                        className="w-10 h-10 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg border border-white/10 hover:bg-black/60"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Loading state */}
            {!isScanning && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                    <div className="text-center">
                        <div className="w-14 h-14 border-4 border-white/20 border-t-[#0071e3] rounded-full animate-spin mx-auto mb-5" />
                        <p className="text-white/90 text-[17px] font-semibold tracking-wide">Starting camera...</p>
                    </div>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/95 p-8">
                    <div className="text-center max-w-xs">
                        <div className="w-20 h-20 bg-[#ff3b30]/20 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-[#ff3b30]/10">
                            <svg className="w-10 h-10 text-[#ff3b30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <p className="text-white text-[22px] font-bold mb-3">Camera Error</p>
                        <p className="text-white/60 text-[15px] mb-8 leading-relaxed">{error}</p>
                        <button
                            onClick={startScanning}
                            className="w-full px-8 py-4 bg-[#0071e3] text-white rounded-2xl text-[17px] font-bold active:scale-95 transition-all shadow-lg hover:bg-[#0077ED]"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom hint */}
            <div className="bg-gradient-to-t from-black via-black/90 to-transparent absolute bottom-0 left-0 right-0 px-6 pb-12 pt-16 text-center pointer-events-none">
                <p className="text-white/90 text-[16px] font-medium tracking-wide drop-shadow-md">
                    {isScanning ? 'Align QR code within the frame' : 'Initializing...'}
                </p>
            </div>

            <style jsx global>{`
                #${scannerId} video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    display: block !important;
                    border-radius: 0 !important;
                }
                #${scannerId} canvas {
                    display: none !important;
                }
                @keyframes scan-line {
                    0% { top: 0; opacity: 1; }
                    50% { opacity: 0.6; }
                    100% { top: calc(100% - 4px); opacity: 1; }
                }
                .animate-scan-line {
                    animation: scan-line 2.5s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
};
