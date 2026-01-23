'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'gray';
type Density = 'default' | 'compact';

interface PreferencesContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    accentColor: AccentColor;
    setAccentColor: (color: AccentColor) => void;
    density: Density;
    setDensity: (density: Density) => void;
    reducedMotion: boolean;
    setReducedMotion: (enabled: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
    // Initialize state with default values, will be updated by useEffect on client
    const [theme, setThemeState] = useState<Theme>('system');
    const [accentColor, setAccentColorState] = useState<AccentColor>('blue');
    const [density, setDensityState] = useState<Density>('default');
    const [reducedMotion, setReducedMotionState] = useState<boolean>(false);
    const [mounted, setMounted] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('vpub_theme') as Theme;
        const savedAccent = localStorage.getItem('vpub_accent') as AccentColor;
        const savedDensity = localStorage.getItem('vpub_density') as Density;
        const savedMotion = localStorage.getItem('vpub_motion') === 'true';

        if (savedTheme) setThemeState(savedTheme);
        if (savedAccent) setAccentColorState(savedAccent);
        if (savedDensity) setDensityState(savedDensity);
        setReducedMotionState(savedMotion);
        setMounted(true);
    }, []);

    // Persist and Apply Theme
    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('vpub_theme', newTheme);
    };

    // Persist Accent
    const setAccentColor = (newColor: AccentColor) => {
        setAccentColorState(newColor);
        localStorage.setItem('vpub_accent', newColor);
    };

    // Persist Density
    const setDensity = (newDensity: Density) => {
        setDensityState(newDensity);
        localStorage.setItem('vpub_density', newDensity);
    };

    // Persist Reduced Motion
    const setReducedMotion = (enabled: boolean) => {
        setReducedMotionState(enabled);
        localStorage.setItem('vpub_motion', String(enabled));
    };

    // Apply Theme Effect
    useEffect(() => {
        if (!mounted) return;

        const root = document.documentElement;
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.add(systemTheme);
        } else {
            root.classList.add(theme);
        }
    }, [theme, mounted]);

    // Apply Accent Effect
    useEffect(() => {
        if (!mounted) return;
        const root = document.documentElement;

        // Convert accent names to CSS Data attribute for easy styling
        root.setAttribute('data-accent', accentColor);

        // Also set density attribute
        root.setAttribute('data-density', density);

        // Also set motion attribute
        root.setAttribute('data-motion', String(reducedMotion));
    }, [accentColor, density, reducedMotion, mounted]);

    // Listen for system theme changes
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            const root = document.documentElement;
            root.classList.remove('light', 'dark');
            root.classList.add(mediaQuery.matches ? 'dark' : 'light');
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    return (
        <PreferencesContext.Provider
            value={{
                theme,
                setTheme,
                accentColor,
                setAccentColor,
                density,
                setDensity,
                reducedMotion,
                setReducedMotion,
            }}
        >
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    const context = useContext(PreferencesContext);
    if (context === undefined) {
        throw new Error('usePreferences must be used within a PreferencesProvider');
    }
    return context;
}
