import React from 'react';
import { createPortal } from 'react-dom';
import { usePreferences } from '@/lib/preferences-context';
import { useDepartment } from '@/lib/department-context';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

// Short tween rather than a spring: the spring's settle time made the drawer read as
// slow to open. Shared by the panel and its backdrop so they move as one.
const DRAWER_TRANSITION = { type: 'tween', duration: 0.18, ease: [0.32, 0.72, 0, 1] } as const;

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ isOpen, onClose }) => {
    const {
        theme, setTheme,
        accentColor, setAccentColor,
        density, setDensity,
    } = usePreferences();

    const { user } = useAuth();
    const { department, allDepartments, switchDepartment } = useDepartment();

    // Portal needs to know when valid DOM exists
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const drawerContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={DRAWER_TRANSITION}
                        onClick={onClose}
                        // No backdrop-blur: a viewport-sized backdrop-filter is re-computed
                        // every frame while the panel slides, which is what made this drag.
                        className="fixed inset-0 bg-black/30 z-[9999]"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={DRAWER_TRANSITION}
                        // Own compositor layer so the slide is a pure GPU transform.
                        style={{ willChange: 'transform' }}
                        className="fixed top-0 right-0 h-full w-[320px] bg-white dark:bg-[#1c1c1e] shadow-2xl z-[9999] flex flex-col border-l border-gray-200 dark:border-gray-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ... existing content ... */}
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-8">

                            {/* Department Context (Super Admin) - Mobile Friendly */}
                            {user?.role === 'SUPER_ADMIN' && switchDepartment && (
                                <section>
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Context Scope</h3>
                                    <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
                                        <select
                                            className="w-full bg-transparent text-sm font-medium text-gray-900 dark:text-gray-100 p-2 outline-none cursor-pointer"
                                            value={department?.id || ''}
                                            onChange={(e) => switchDepartment(e.target.value || null)}
                                        >
                                            <option value="">Full Organization (Global)</option>
                                            {allDepartments.map(dept => (
                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2 px-1">
                                        Changing this affects your dashboard and data views globally.
                                    </p>
                                </section>
                            )}

                            {/* Theme Section */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Theme</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        onClick={() => setTheme('light')}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === 'light'
                                            ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded-full border border-gray-200 bg-[#f5f5f7] flex items-center justify-center">
                                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-medium">Light</span>
                                    </button>

                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === 'dark'
                                            ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded-full border border-gray-700 bg-[#1c1c1e] flex items-center justify-center">
                                            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-medium">Dark</span>
                                    </button>

                                    <button
                                        onClick={() => setTheme('system')}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${theme === 'system'
                                            ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-900 flex items-center justify-center">
                                            <svg className="w-4 h-4 text-gray-500 mix-blend-difference" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm font-medium">Auto</span>
                                    </button>
                                </div>
                            </section>

                            {/* Accent Color Section */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Accent Color</h3>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { id: 'blue', color: '#0071e3', label: 'Blue' },
                                        { id: 'purple', color: '#5856d6', label: 'Purple' },
                                        { id: 'green', color: '#34c759', label: 'Green' },
                                        { id: 'orange', color: '#ff9500', label: 'Orange' },
                                        { id: 'red', color: '#ff3b30', label: 'Red' },
                                        { id: 'gray', color: '#8e8e93', label: 'Gray' },
                                    ].map((color) => (
                                        <button
                                            key={color.id}
                                            onClick={() => setAccentColor(color.id as any)}
                                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${accentColor === color.id
                                                ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#1c1c1e] scale-110'
                                                : 'hover:scale-110'
                                                }`}
                                            style={{ backgroundColor: color.color }}
                                            title={color.label}
                                            aria-label={`Select ${color.label} accent color`}
                                        >
                                            {accentColor === color.id && (
                                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Density Section */}
                            <section>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Layout Density</h3>
                                <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex">
                                    <button
                                        onClick={() => setDensity('default')}
                                        className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${density === 'default'
                                            ? 'bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        Comfortable
                                    </button>
                                    <button
                                        onClick={() => setDensity('compact')}
                                        className={`flex-1 flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${density === 'compact'
                                            ? 'bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        Compact
                                    </button>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">Danger Zone</h3>
                                <button
                                    onClick={async () => {
                                        if (confirm("Are you sure? This will clear all local data and reload the app.")) {
                                            if ('serviceWorker' in navigator) {
                                                const registrations = await navigator.serviceWorker.getRegistrations();
                                                for (const registration of registrations) {
                                                    await registration.unregister();
                                                }
                                            }
                                            // Clear IndexedDB using idb-keyval logic or standard API
                                            // Simple nuking of all databases
                                            const dbs = await window.indexedDB.databases();
                                            dbs.forEach(db => {
                                                if (db.name) window.indexedDB.deleteDatabase(db.name);
                                            });
                                            localStorage.clear();
                                            sessionStorage.clear();
                                            window.location.reload();
                                        }
                                    }}
                                    className="w-full p-4 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-medium flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Reset App Data
                                </button>
                                <p className="text-[10px] text-gray-400 mt-2 text-center">
                                    Use this if the app feels stuck or data isn't determining correctly.
                                </p>
                            </section>

                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-gray-100 dark:border-gray-800 text-center">
                            <p className="text-xs text-gray-400">Personalize your workspace experience</p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    if (!mounted) return null;

    return createPortal(drawerContent, document.body);
};

