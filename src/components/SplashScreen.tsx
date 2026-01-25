import React, { useEffect, useState } from 'react';

/**
 * A premium, full-screen splash screen component.
 * It displays the brand logo with a sleek breathing animation.
 * Used to hide the initial auth check and resource loading states.
 */
export const SplashScreen = () => {
    // Optional: Local state to handle "exit" animations if we wanted to get fancy later
    // For now, simple mounting/unmounting is sufficient for Next.js

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
            <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
                {/* Logo Container */}
                <div className="relative w-28 h-28 mb-8">
                    {/* Ring Animation */}
                    <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-primary/30 border-l-transparent animate-spin duration-1000" />

                    {/* Logo Image */}
                    <div className="absolute inset-4 rounded-full overflow-hidden flex items-center justify-center shadow-lg shadow-primary/20 animate-pulse bg-white/10 backdrop-blur-sm">
                        <img
                            src="/logo.png"
                            alt="Brand Logo"
                            className="w-full h-full object-contain p-2"
                        />
                    </div>
                </div>

                {/* Brand Name */}
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent animate-pulse">
                    VP App
                </h1>

                {/* Subtle Loading Text */}
                <p className="mt-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-widest animate-pulse">
                    Loading
                </p>
            </div>

            {/* Background Mesh Effect (Matches Landing Page vibe but subtler) */}
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background opacity-40" />
        </div>
    );
};
