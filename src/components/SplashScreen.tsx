import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * A premium, full-screen splash screen component.
 * It displays the brand logo with a sleek pulsing animation and a loading indicator.
 */
export const SplashScreen = () => {
    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a0a]">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent opacity-50" />

            <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
                {/* Logo Container */}
                <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                    {/* Glowing effect behind logo */}
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />

                    {/* Logo Image */}
                    <div className="relative w-28 h-28 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-4 shadow-2xl flex items-center justify-center">
                        <img
                            src="/logo.png"
                            alt="Brand Logo"
                            className="w-full h-full object-contain drop-shadow-md"
                        />
                    </div>

                    {/* Floating badge/accent if needed, or just keep it clean */}
                </div>

                {/* Brand Name */}
                <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">
                    <span className="text-blue-500">VP</span> App
                </h1>

                {/* Loading Indicator */}
                <div className="flex items-center gap-2 mt-4">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                        Initializing...
                    </p>
                </div>
            </div>
        </div>
    );
};

