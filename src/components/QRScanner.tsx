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

type ZoomCapabilities = { min: number; max: number; step: number };
type CameraConstraintSet = MediaTrackConstraintSet & {
    focusMode?: string;
    torch?: boolean;
    zoom?: number;
};
type CameraConstraints = MediaTrackConstraints & {
    focusMode?: string;
    advanced?: CameraConstraintSet[];
};
type CameraCapabilities = MediaTrackCapabilities & {
    focusMode?: string[];
    zoom?: Partial<ZoomCapabilities>;
};
type ScannerConfig = {
    fps: number;
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number };
    videoConstraints?: MediaTrackConstraints;
    useBarCodeDetectorIfSupported: boolean;
    experimentalFeatures: {
        useBarCodeDetectorIfSupported: boolean;
    };
};
type Html5Scanner = {
    start: (
        cameraIdOrConfig: MediaTrackConstraints,
        configuration: ScannerConfig,
        qrCodeSuccessCallback: (decodedText: string) => void | Promise<void>,
        qrCodeErrorCallback?: (errorMessage?: string) => void
    ) => Promise<null>;
    stop: () => Promise<void>;
    clear: () => void;
    getRunningTrackCapabilities: () => CameraCapabilities;
    applyVideoConstraints: (constraints: CameraConstraints) => Promise<void>;
};

const isAppleTouchDevice = () => {
    if (typeof navigator === 'undefined') return false;

    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getScanBox = (ratio: number, maxSize: number) => (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth || 300, viewfinderHeight || 300);
    if (minEdge < 100) {
        return { width: minEdge, height: minEdge };
    }

    const padding = Math.max(16, Math.floor(minEdge * 0.12));
    const maxAllowed = Math.max(80, minEdge - padding);
    const size = Math.max(80, Math.min(maxSize, Math.floor(minEdge * ratio), maxAllowed));
    return { width: size, height: size };
};

const buildVideoConstraints = (variant: 'desktop' | 'mobile'): MediaTrackConstraints => {
    const appleTouchDevice = isAppleTouchDevice();
    const conservativeMobileStream = variant === 'mobile' || appleTouchDevice;
    const constraints: CameraConstraints = {
        facingMode: { ideal: 'environment' },
        width: { ideal: conservativeMobileStream ? 1280 : 1920 },
        height: { ideal: conservativeMobileStream ? 720 : 1080 },
        frameRate: { ideal: conservativeMobileStream ? 24 : 30, max: 30 }
    };

    if (!conservativeMobileStream) {
        constraints.focusMode = 'continuous';
        constraints.advanced = [{ focusMode: 'continuous' }];
    }

    return constraints;
};

const buildScannerConfig = (variant: 'desktop' | 'mobile'): ScannerConfig => {
    const appleTouchDevice = isAppleTouchDevice();
    const useNativeDetector = variant === 'desktop' && !appleTouchDevice;

    return {
        fps: variant === 'mobile'
            ? (appleTouchDevice ? 10 : 15)
            : (appleTouchDevice ? 10 : 20),
        qrbox: getScanBox(variant === 'mobile' ? 0.78 : 0.7, variant === 'mobile' ? 280 : 320),
        videoConstraints: buildVideoConstraints(variant),
        useBarCodeDetectorIfSupported: useNativeDetector,
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: useNativeDetector
        }
    };
};

const startHtml5Scanner = async (
    scanner: Html5Scanner,
    config: ScannerConfig,
    onSuccess: (decodedText: string) => void | Promise<void>,
    onFailure: (errorMessage?: string) => void
) => {
    try {
        await scanner.start(
            { facingMode: 'environment' },
            config,
            onSuccess,
            onFailure
        );
    } catch (err) {
        const fallbackConfig = { ...config, videoConstraints: undefined };

        await scanner.start(
            { facingMode: 'environment' },
            fallbackConfig,
            onSuccess,
            onFailure
        ).catch(() => {
            throw err;
        });
    }
};

const configureRunningTrack = async (
    scanner: Html5Scanner,
    preferMobileZoom: boolean
): Promise<{ zoomCapabilities: ZoomCapabilities | null; zoomVal: number }> => {
    let capabilities: CameraCapabilities;

    try {
        capabilities = scanner.getRunningTrackCapabilities();
    } catch (err) {
        console.warn("Failed to get camera capabilities", err);
        return { zoomCapabilities: null, zoomVal: 1 };
    }

    if (Array.isArray(capabilities?.focusMode) && capabilities.focusMode.includes('continuous')) {
        try {
            await scanner.applyVideoConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
        } catch (err) {
            console.warn("Failed to apply continuous focus", err);
        }
    }

    if (!capabilities?.zoom) {
        return { zoomCapabilities: null, zoomVal: 1 };
    }

    const min = Number(capabilities.zoom.min ?? 1);
    const max = Number(capabilities.zoom.max ?? 5);
    const step = Number(capabilities.zoom.step ?? 0.1);
    const zoomCapabilities = {
        min: Number.isFinite(min) ? min : 1,
        max: Number.isFinite(max) ? max : 5,
        step: Number.isFinite(step) && step > 0 ? step : 0.1
    };
    const zoomVal = preferMobileZoom
        ? clamp(2, zoomCapabilities.min, zoomCapabilities.max)
        : zoomCapabilities.min;

    if (zoomVal !== zoomCapabilities.min) {
        try {
            await scanner.applyVideoConstraints({
                advanced: [{ zoom: zoomVal }]
            });
        } catch (err) {
            console.warn("Failed to apply default zoom", err);
            return { zoomCapabilities, zoomVal: zoomCapabilities.min };
        }
    }

    return { zoomCapabilities, zoomVal };
};

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onError, continuous = true }) => {
    const latestOnScan = useRef(onScan);
    useEffect(() => { latestOnScan.current = onScan; }, [onScan]);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string>('');
    const [torchOn, setTorchOn] = useState(false);
    const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
    const [zoomVal, setZoomVal] = useState<number>(1);
    const scannerRef = useRef<Html5Scanner | null>(null);
    const isInitialized = useRef(false);
    const [scannerId] = useState(() => `qr-reader-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
    const lastScannedRef = useRef<{ text: string; time: number } | null>(null);

    const toggleTorch = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.applyVideoConstraints({
                    advanced: [{ torch: !torchOn }]
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

            const scanner = new Html5Qrcode(scannerId) as Html5Scanner;
            scannerRef.current = scanner;

            await startHtml5Scanner(
                scanner,
                buildScannerConfig('desktop'),
                (decodedText) => {
                    const now = Date.now();
                    if (lastScannedRef.current &&
                        lastScannedRef.current.text === decodedText &&
                        now - lastScannedRef.current.time < 2000) {
                        return;
                    }

                    lastScannedRef.current = { text: decodedText, time: now };
                    latestOnScan.current(decodedText);

                    if (!continuous) {
                        stopScanning();
                    }
                },
                () => {
                    // Ignore continuous scanning errors
                }
            );

            // Fetch zoom capabilities
            try {
                const cameraSettings = await configureRunningTrack(scanner, false);
                setZoomCapabilities(cameraSettings.zoomCapabilities);
                setZoomVal(cameraSettings.zoomVal);
            } catch (zoomErr) {
                console.warn("Failed to get zoom capabilities", zoomErr);
                setZoomCapabilities(null);
            }

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
        setZoomCapabilities(null);
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

                {isScanning && zoomCapabilities && (
                    <div className="flex items-center gap-3 w-full max-w-sm mx-auto p-4 bg-muted/50 rounded-lg border border-border mt-2">
                        <span className="text-sm font-semibold select-none">Zoom</span>
                        <input
                            type="range"
                            min={zoomCapabilities.min}
                            max={zoomCapabilities.max}
                            step={zoomCapabilities.step}
                            value={zoomVal}
                            onChange={async (e) => {
                                const val = parseFloat(e.target.value);
                                setZoomVal(val);
                                try {
                                    await scannerRef.current?.applyVideoConstraints({
                                        advanced: [{ zoom: val }]
                                    });
                                } catch (err) {
                                    console.error("Failed to apply zoom", err);
                                }
                            }}
                            className="flex-1 accent-primary h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-xs font-mono w-8 text-right select-none">{zoomVal.toFixed(1)}x</span>
                    </div>
                )}

                {isScanning && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                        Tip: If the camera is blurry, use the Zoom slider above or hold the camera 6-10 inches away.
                    </p>
                )}

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
                    #${scannerId} #qr-shaded-region {
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

// Mobile-optimized immersive scanner component with auto-start
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
    const latestOnScan = useRef(onScan);
    useEffect(() => { latestOnScan.current = onScan; }, [onScan]);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string>('');
    const [scanCount, setScanCount] = useState(0);
    const [torchOn, setTorchOn] = useState(false);
    const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
    const [zoomVal, setZoomVal] = useState<number>(1);
    const scannerRef = useRef<Html5Scanner | null>(null);
    const isInitialized = useRef(false);
    const [scannerId] = useState(() => `mobile-qr-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
    const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
    const lastScannedRef = useRef<{ text: string; time: number } | null>(null);

    const toggleTorch = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.applyVideoConstraints({
                    advanced: [{ torch: !torchOn }]
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

            const scanner = new Html5Qrcode(scannerId) as Html5Scanner;
            scannerRef.current = scanner;

            await startHtml5Scanner(
                scanner,
                buildScannerConfig('mobile'),
                async (decodedText) => {
                    const now = Date.now();
                    if (lastScannedRef.current &&
                        lastScannedRef.current.text === decodedText &&
                        now - lastScannedRef.current.time < 1500) {
                        return;
                    }

                    lastScannedRef.current = { text: decodedText, time: now };
                    setScanCount(prev => prev + 1);
                    latestOnScan.current(decodedText);
                },
                () => { }
            );

            // Fetch zoom capabilities
            try {
                const cameraSettings = await configureRunningTrack(scanner, true);
                setZoomCapabilities(cameraSettings.zoomCapabilities);
                setZoomVal(cameraSettings.zoomVal);
            } catch (zoomErr) {
                console.warn("Failed to get zoom capabilities", zoomErr);
                setZoomCapabilities(null);
            }

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
        setZoomCapabilities(null);
    };

    // Auto-start on mount
    useEffect(() => {
        if (autoStart) {
            const startDelay = isAppleTouchDevice() ? 250 : 100;
            const timer = setTimeout(() => {
                requestAnimationFrame(() => startScanning());
            }, startDelay);
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

            {/* Scan count indicator */}
            {scanCount > 0 && (
                <div className="absolute top-0 left-3 mt-3 px-4 py-2 bg-[#34c759]/90 backdrop-blur-md rounded-full shadow-lg border border-white/10 z-50">
                    <span className="text-white text-[14px] font-bold tracking-wide">{scanCount} scanned</span>
                </div>
            )}

            {/* Zoom Slider Overlay */}
            {isScanning && zoomCapabilities && (
                <div className="absolute bottom-[130px] left-1/2 -translate-x-1/2 w-full max-w-[280px] px-4 py-3 bg-black/50 backdrop-blur-md rounded-2xl border border-white/10 z-50 flex items-center gap-3">
                    <span className="text-white text-xs font-semibold select-none">Zoom</span>
                    <input
                        type="range"
                        min={zoomCapabilities.min}
                        max={zoomCapabilities.max}
                        step={zoomCapabilities.step}
                        value={zoomVal}
                        onChange={async (e) => {
                            const val = parseFloat(e.target.value);
                            setZoomVal(val);
                            try {
                                await scannerRef.current?.applyVideoConstraints({
                                    advanced: [{ zoom: val }]
                                });
                            } catch (err) {
                                console.error("Failed to apply zoom", err);
                            }
                        }}
                        className="flex-1 accent-primary h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-white text-xs font-mono w-8 text-right select-none">{zoomVal.toFixed(1)}x</span>
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
                        <div className="w-14 h-14 border-4 border-white/20 border-t-[var(--primary)] rounded-full animate-spin mx-auto mb-5" />
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
                            className="w-full px-8 py-4 bg-[var(--primary)] text-white rounded-2xl text-[17px] font-bold active:scale-95 transition-all shadow-lg hover:brightness-110"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom hint */}
            <div className="bg-gradient-to-t from-black via-black/90 to-transparent absolute bottom-0 left-0 right-0 px-6 pb-10 pt-16 text-center pointer-events-none z-50">
                <p className="text-white/90 text-[16px] font-semibold tracking-wide drop-shadow-md">
                    {isScanning ? 'Align QR code within the frame' : 'Initializing...'}
                </p>
                {isScanning && (
                    <p className="text-white/60 text-[12px] mt-2 font-medium tracking-wide drop-shadow-md animate-pulse">
                        Tip: Keep camera 6-10 inches away for perfect auto-focus
                    </p>
                )}
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
                #${scannerId} #qr-shaded-region {
                    display: none !important;
                }
            `}</style>
        </div>
    );
};
