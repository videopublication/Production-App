'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { PullToRefresh } from '@/components/PullToRefresh';
import { motion, LayoutGroup } from 'framer-motion';

type UserRole = 'CREW' | 'MANAGER' | 'ADMIN';

// Define all available quick actions with role-based access
const ALL_QUICK_ACTIONS = [
    {
        id: 'checkout',
        label: 'Checkout',
        route: '/checkout',
        gradient: 'from-blue-500 to-blue-600',
        shadow: 'shadow-blue-500/25',
        icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
        roles: ['CREW', 'MANAGER', 'ADMIN'] as UserRole[],
    },
    {
        id: 'returns',
        label: 'Returns',
        route: '/returns',
        gradient: 'from-emerald-500 to-emerald-600',
        shadow: 'shadow-emerald-500/25',
        icon: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
        roles: ['CREW', 'MANAGER', 'ADMIN'] as UserRole[],
    },
    {
        id: 'verify',
        label: 'Verify',
        route: '/verification',
        gradient: 'from-purple-500 to-purple-600',
        shadow: 'shadow-purple-500/25',
        icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        roles: ['MANAGER', 'ADMIN'] as UserRole[], // Only managers and admins can verify
    },
    {
        id: 'inventory',
        label: 'Inventory',
        route: '/inventory',
        gradient: 'from-orange-500 to-orange-600',
        shadow: 'shadow-orange-500/25',
        icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
        roles: ['CREW', 'MANAGER', 'ADMIN'] as UserRole[],
    },
    {
        id: 'history',
        label: 'History',
        route: '/transactions',
        gradient: 'from-pink-500 to-pink-600',
        shadow: 'shadow-pink-500/25',
        icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
        roles: ['MANAGER', 'ADMIN'] as UserRole[], // Only managers and admins can see history
    },
    {
        id: 'calendar',
        label: 'Calendar',
        route: '/calendar',
        gradient: 'from-red-500 to-red-600',
        shadow: 'shadow-red-500/25',
        icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
        roles: ['CREW', 'MANAGER', 'ADMIN'] as UserRole[],
    },
    {
        id: 'add-item',
        label: 'Add Item',
        route: '/inventory/add',
        gradient: 'from-cyan-500 to-cyan-600',
        shadow: 'shadow-cyan-500/25',
        icon: 'M12 4.5v15m7.5-7.5h-15',
        roles: ['MANAGER', 'ADMIN'] as UserRole[], // Only managers and admins can add items
    },
    {
        id: 'shoots',
        label: 'Shoots',
        route: '/admin/shoots',
        gradient: 'from-indigo-500 to-indigo-600',
        shadow: 'shadow-indigo-500/25',
        icon: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z',
        roles: ['CREW', 'MANAGER', 'ADMIN'] as UserRole[], // Everyone can view shoots (CREW sees assigned only)
    },
    {
        id: 'users',
        label: 'Users',
        route: '/admin/users',
        gradient: 'from-amber-500 to-amber-600',
        shadow: 'shadow-amber-500/25',
        icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
        roles: ['ADMIN'] as UserRole[], // Only admins can manage users
    },
    {
        id: 'notify',
        label: 'Notify',
        route: '/admin/notifications',
        gradient: 'from-teal-500 to-teal-600',
        shadow: 'shadow-teal-500/25',
        icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
        roles: ['ADMIN'] as UserRole[], // Only admins can send notifications
    },
    {
        id: 'activity',
        label: 'Activity',
        route: '/admin/logs',
        gradient: 'from-slate-500 to-slate-600',
        shadow: 'shadow-slate-500/25',
        icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
        roles: ['ADMIN'] as UserRole[], // Only admins can view activity logs
    },
    {
        id: 'settings',
        label: 'Settings',
        route: '/admin/settings',
        gradient: 'from-gray-500 to-gray-600',
        shadow: 'shadow-gray-500/25',
        icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
        roles: ['ADMIN'] as UserRole[], // Only admins can access settings
    },
];

// Default actions per role
const getDefaultActionsForRole = (role: UserRole): string[] => {
    switch (role) {
        case 'CREW':
            return ['checkout', 'returns', 'inventory', 'calendar', 'shoots'];
        case 'MANAGER':
            return ['checkout', 'returns', 'verify', 'inventory', 'shoots', 'history', 'calendar', 'add-item'];
        case 'ADMIN':
            return ['checkout', 'returns', 'verify', 'inventory', 'history', 'calendar', 'add-item', 'shoots', 'users', 'notify'];
        default:
            return ['checkout', 'returns', 'inventory', 'calendar'];
    }
};

const STORAGE_KEY = 'dashboard_quick_actions';

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const [stats, setStats] = useState({
        available: 0,
        checkedOut: 0,
        pendingVerification: 0,
        attention: 0,
    });
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);

    // Get user role
    const userRole = (user?.role || 'CREW') as UserRole;

    // Filter actions available to this user's role
    const availableActions = useMemo(() => {
        return ALL_QUICK_ACTIONS.filter(action => action.roles.includes(userRole));
    }, [userRole]);

    // Get default actions for this role
    const defaultActionsForRole = useMemo(() => {
        return getDefaultActionsForRole(userRole);
    }, [userRole]);

    // Load saved preferences
    useEffect(() => {
        if (!user) return;

        const storageKey = `${STORAGE_KEY}_${user.id}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Filter to only include actions available to this role
                    const validActions = parsed.filter((id: string) =>
                        availableActions.some(a => a.id === id)
                    );
                    if (validActions.length > 0) {
                        setSelectedActionIds(validActions);
                        return;
                    }
                }
            } catch {
                // Use defaults if parsing fails
            }
        }
        // Use role-based defaults if no saved preferences
        setSelectedActionIds(defaultActionsForRole);
    }, [user, availableActions, defaultActionsForRole]);

    // Save preferences when they change
    const savePreferences = useCallback((ids: string[]) => {
        if (!user) return;
        const storageKey = `${STORAGE_KEY}_${user.id}`;
        localStorage.setItem(storageKey, JSON.stringify(ids));
        setSelectedActionIds(ids);
    }, [user]);

    const loadDashboardData = useCallback(async () => {
        const items = await storage.getEquipment();

        setStats({
            available: items.filter(i => i.status === 'AVAILABLE').length,
            checkedOut: items.filter(i => i.status === 'CHECKED_OUT').length,
            pendingVerification: items.filter(i => i.status === 'PENDING_VERIFICATION').length,
            attention: items.filter(i => i.status === 'MAINTENANCE' || i.status === 'DAMAGED' || i.status === 'LOST').length,
        });
    }, []);

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            router.replace('/login');
            return;
        }

        // Allow CREW to access dashboard too (they have limited actions)
        loadDashboardData();
    }, [user, router, loadDashboardData, authLoading]);

    // Toggle action visibility
    const toggleAction = (id: string) => {
        if (selectedActionIds.includes(id)) {
            if (selectedActionIds.length > 1) {
                savePreferences(selectedActionIds.filter(a => a !== id));
            }
        } else {
            savePreferences([...selectedActionIds, id]);
        }
    };

    // Move action up/down
    const moveAction = (id: string, direction: 'up' | 'down') => {
        const index = selectedActionIds.indexOf(id);
        if (index === -1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= selectedActionIds.length) return;

        const newOrder = [...selectedActionIds];
        [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
        savePreferences(newOrder);
    };

    // Reset to defaults for this role
    const resetToDefaults = () => {
        savePreferences(defaultActionsForRole);
    };

    // Get visible actions in order (only from selected and available to this role)
    const visibleActions = selectedActionIds
        .map(id => availableActions.find(a => a.id === id))
        .filter(Boolean) as typeof ALL_QUICK_ACTIONS;

    if (authLoading) {
        return (
            <div className="max-w-6xl mx-auto animate-pulse p-4">
                <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg mb-2"></div>
                <div className="h-5 w-64 bg-gray-200 dark:bg-gray-800 rounded-lg mb-8"></div>

                <div className="rounded-3xl border border-gray-200 dark:border-gray-800 p-6 mb-8">
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-4"></div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-32 rounded-2xl bg-gray-200 dark:bg-gray-800"></div>
                        ))}
                    </div>
                </div>

                <div className="rounded-3xl border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex justify-between mb-6">
                        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                        <div className="h-8 w-16 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    </div>
                    <div className="grid grid-cols-5 lg:grid-cols-10 gap-4">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-800"></div>
                                <div className="h-3 w-12 bg-gray-200 dark:bg-gray-800 rounded"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <PullToRefresh onRefresh={loadDashboardData}>
            <div className="max-w-6xl mx-auto animate-fade-in">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f] dark:text-gray-100">
                        Dashboard
                    </h1>
                    <p className="text-[15px] text-[#86868b] dark:text-gray-400 mt-1">Overview of your inventory</p>
                </div>

                {/* Stats Cards */}
                <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-sm border border-[#e5e5ea] dark:border-gray-800 p-4 sm:p-6 mb-8 transition-colors">
                    <h2 className="text-sm font-semibold text-[#86868b] dark:text-gray-400 uppercase tracking-wider mb-4">Inventory Overview</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                        {/* Available */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-900/10 border border-emerald-200/50 dark:border-emerald-900/30">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-3xl sm:text-4xl font-bold text-[#1d1d1f] dark:text-emerald-50">{stats.available}</p>
                            <p className="text-sm text-[#86868b] dark:text-emerald-400/80 mt-1">Available</p>
                        </div>

                        {/* Checked Out */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 border border-blue-200/50 dark:border-blue-900/30">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-500 shadow-lg shadow-blue-500/30 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-3xl sm:text-4xl font-bold text-[#1d1d1f] dark:text-blue-50">{stats.checkedOut}</p>
                            <p className="text-sm text-[#86868b] dark:text-blue-400/80 mt-1">Checked Out</p>
                        </div>

                        {/* Pending Verification */}
                        <div
                            className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-900/10 border border-amber-200/50 dark:border-amber-900/30 cursor-pointer hover:border-amber-300 transition-colors"
                            onClick={() => router.push('/verification')}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500 shadow-lg shadow-amber-500/30 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                {stats.pendingVerification > 0 && (
                                    <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                                        Action
                                    </span>
                                )}
                            </div>
                            <p className="text-3xl sm:text-4xl font-bold text-[#1d1d1f] dark:text-amber-50">{stats.pendingVerification}</p>
                            <p className="text-sm text-[#86868b] dark:text-amber-400/80 mt-1">Pending Verification</p>
                        </div>

                        {/* Attention */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-900/10 border border-red-200/50 dark:border-red-900/30">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500 shadow-lg shadow-red-500/30 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-3xl sm:text-4xl font-bold text-[#1d1d1f] dark:text-red-50">{stats.attention}</p>
                            <p className="text-sm text-[#86868b] dark:text-red-400/80 mt-1">Needs Attention</p>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-sm border border-[#e5e5ea] dark:border-gray-800 p-4 sm:p-6 transition-colors">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-sm font-semibold text-[#86868b] dark:text-gray-400 uppercase tracking-wider">Quick Actions</h2>
                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isEditMode
                                ? 'bg-[#007aff] text-white'
                                : 'bg-[#f5f5f7] dark:bg-gray-800 text-[#1d1d1f] dark:text-gray-200 hover:bg-[#e8e8ed] dark:hover:bg-gray-700'
                                }`}
                        >
                            {isEditMode ? 'Done' : 'Edit'}
                        </button>
                    </div>

                    {/* Normal View */}
                    {!isEditMode && (
                        <div className="grid grid-cols-5 lg:grid-cols-10 gap-3 sm:gap-4">
                            {visibleActions.map((action) => (
                                <button
                                    key={action.id}
                                    onClick={() => router.push(action.route)}
                                    className="group flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-[#f5f5f7] dark:hover:bg-gray-800 transition-colors"
                                >
                                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-[20px] bg-gradient-to-br ${action.gradient} shadow-lg ${action.shadow} flex items-center justify-center group-hover:scale-105 group-active:scale-95 transition-transform`}>
                                        <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                                        </svg>
                                    </div>
                                    <span className="text-[11px] sm:text-xs font-medium text-[#1d1d1f] dark:text-gray-300 text-center">{action.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Edit Mode */}
                    {isEditMode && (
                        <div className="space-y-4">
                            {/* Reset button */}
                            <div className="flex justify-end mb-2">
                                <button
                                    onClick={resetToDefaults}
                                    className="text-sm text-[#007aff] hover:underline"
                                >
                                    Reset to Defaults
                                </button>
                            </div>

                            {/* All Actions Grid - sorted by order (active first) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <LayoutGroup>
                                    {(() => {
                                        // Sort actions: Selected ones first (in order), then unselected
                                        const sortedActions = [
                                            ...selectedActionIds
                                                .map(id => availableActions.find(a => a.id === id))
                                                .filter(Boolean),
                                            ...availableActions.filter(a => !selectedActionIds.includes(a.id))
                                        ] as typeof ALL_QUICK_ACTIONS;

                                        return sortedActions.map((action) => {
                                            const isSelected = selectedActionIds.includes(action.id);
                                            const index = selectedActionIds.indexOf(action.id);

                                            return (
                                                <motion.div
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                    key={action.id}
                                                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 ${isSelected
                                                        ? 'border-[#007aff] bg-[#007aff]/5 dark:bg-[#007aff]/10'
                                                        : 'border-[#e5e5ea] dark:border-gray-800 bg-[#f5f5f7]/50 dark:bg-gray-800/50'
                                                        }`}
                                                >
                                                    {/* Icon */}
                                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} shadow-lg ${action.shadow} flex items-center justify-center shrink-0`}>
                                                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                                                        </svg>
                                                    </div>

                                                    {/* Label */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-[#1d1d1f] dark:text-gray-200">{action.label}</p>
                                                        <p className="text-xs text-[#86868b] dark:text-gray-500 truncate">{action.route}</p>
                                                    </div>

                                                    {/* Reorder buttons (only for selected) */}
                                                    {isSelected && (
                                                        <div className="flex flex-col gap-1">
                                                            <button
                                                                onClick={() => moveAction(action.id, 'up')}
                                                                disabled={index === 0}
                                                                className="p-1 rounded bg-[#f5f5f7] dark:bg-gray-700 hover:bg-[#e8e8ed] dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                <svg className="w-4 h-4 text-gray-700 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => moveAction(action.id, 'down')}
                                                                disabled={index === selectedActionIds.length - 1}
                                                                className="p-1 rounded bg-[#f5f5f7] dark:bg-gray-700 hover:bg-[#e8e8ed] dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                <svg className="w-4 h-4 text-gray-700 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Toggle */}
                                                    <button
                                                        onClick={() => toggleAction(action.id)}
                                                        className={`w-12 h-7 rounded-full transition-colors relative shrink-0 ${isSelected ? 'bg-[#34c759]' : 'bg-[#e5e5ea] dark:bg-gray-700'
                                                            }`}
                                                    >
                                                        <motion.div
                                                            layout
                                                            className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow ${isSelected ? 'left-5' : 'left-0.5'}`}
                                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                        />
                                                    </button>
                                                </motion.div>
                                            );
                                        });
                                    })()}
                                </LayoutGroup>
                            </div>

                            <p className="text-xs text-[#86868b] dark:text-gray-500 text-center mt-4">
                                Toggle actions on/off • Use arrows to reorder • Changes save automatically
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </PullToRefresh>
    );
}
