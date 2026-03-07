'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { ActiveSessions } from '@/components/ActiveSessions';

import { APP_CONFIG } from '@/lib/config';
import { useToast } from '@/lib/toast-context';

export default function ProfilePage() {
    const router = useRouter();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    if (!user) return null;

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    const handleCopyDebugInfo = () => {
        const info = `
App: ${APP_CONFIG.name}
Version: ${APP_CONFIG.version}
Environment: ${APP_CONFIG.build}
User ID: ${user.id}
Email: ${user.email}
Role: ${user.role}
User Agent: ${navigator.userAgent}
        `.trim();

        navigator.clipboard.writeText(info);
        showToast('Debug info copied to clipboard', 'success');
    };

    const menuItems = [
        {
            label: 'User Management',
            path: '/admin/users',
            roles: ['ADMIN', 'SUPER_ADMIN'],
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        },
        {
            label: 'Activity Logs',
            path: '/admin/logs',
            roles: ['ADMIN', 'SUPER_ADMIN'],
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        }
    ];

    const visibleMenuItems = menuItems.filter(item => item.roles.includes(user.role));

    return (
        <div className="max-w-lg mx-auto space-y-6 animate-fade-in relative">
            <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Profile Header */}
            <div className="flex flex-col items-center py-6">
                {user.avatarUrl ? (
                    <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="w-20 h-20 rounded-full object-cover mb-4 shadow-lg"
                    />
                ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5856d6] to-[#af52de] flex items-center justify-center text-white font-semibold text-3xl mb-4 shadow-lg">
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                )}
                <h1 className="text-xl font-semibold text-[#1d1d1f] dark:text-white">{user.name}</h1>
                <p className="text-[15px] text-[#86868b] dark:text-gray-400">{user.role}</p>
            </div>

            {/* Account Section */}
            <div className="space-y-2">
                <p className="section-header-ios">Account</p>
                <div className="grouped-container">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="list-item-native w-full flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                </svg>
                            </div>
                            <span className="text-[15px] text-[#1d1d1f] dark:text-gray-100">App Appearance</span>
                        </div>
                        <svg className="w-4 h-4 text-[#c7c7cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    <div className="list-item-native flex items-center justify-between">
                        <span className="text-[15px] text-[#1d1d1f] dark:text-gray-100">Email</span>
                        <span className="text-[15px] text-[#86868b] dark:text-gray-400">{user.email || 'Not set'}</span>
                    </div>

                    <div className="list-item-native flex items-center justify-between">
                        <span className="text-[15px] text-[#1d1d1f] dark:text-gray-100">Role</span>
                        <span className="text-[15px] text-[#86868b] dark:text-gray-400">{user.role}</span>
                    </div>
                    <div
                        className="list-item-native flex items-center justify-between active:bg-gray-100 dark:active:bg-[#2c2c2e] cursor-pointer"
                        onClick={() => {
                            navigator.clipboard.writeText(user.id);
                            showToast('User ID copied', 'success');
                        }}
                    >
                        <span className="text-[15px] text-[#1d1d1f] dark:text-gray-100">User ID</span>
                        <span className="text-[13px] text-[#86868b] dark:text-gray-400 font-mono">{user.id.substring(0, 8)}...</span>
                    </div>
                </div>
            </div>

            {/* Quick Actions for Managers/Admins */}
            {visibleMenuItems.length > 0 && (
                <div className="space-y-2">
                    <p className="section-header-ios">Management</p>
                    <div className="grouped-container">
                        {visibleMenuItems.map((item, index) => (
                            <button
                                key={item.path}
                                onClick={() => router.push(item.path)}
                                className="list-item-native w-full flex items-center gap-3"
                            >
                                <span className="text-[#0071e3]">{item.icon}</span>
                                <span className="text-[15px] text-[#1d1d1f] dark:text-gray-100 flex-1 text-left">{item.label}</span>
                                <svg className="w-4 h-4 text-[#c7c7cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        ))}
                    </div>
                </div>
            )}


            {/* App Info */}
            <div className="grouped-container overflow-hidden">
                <button
                    onClick={handleCopyDebugInfo}
                    className="list-item-native w-full flex items-center justify-between active:bg-gray-100 dark:active:bg-[#2c2c2e] transition-colors"
                >
                    <span className="text-[15px] text-[#1d1d1f] dark:text-gray-100">Version</span>
                    <span className="text-[15px] text-[#86868b] dark:text-gray-400">{APP_CONFIG.version}</span>
                </button>
                <div className="list-item-native flex items-center justify-between">
                    <span className="text-[15px] text-[#1d1d1f] dark:text-gray-100">Environment</span>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${APP_CONFIG.build === 'Production' ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                        <span className="text-[15px] text-[#86868b] dark:text-gray-400">{APP_CONFIG.build}</span>
                    </div>
                </div>
            </div>

            {/* Active Sessions */}
            <ActiveSessions />

            {/* Logout Button */}
            <div className="px-4 pt-4">
                <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-white dark:bg-[#1c1c1e] rounded-xl text-[#ff3b30] text-[17px] font-medium active:bg-[#f5f5f7] dark:active:bg-[#2c2c2e] transition-colors shadow-sm"
                >
                    Sign Out
                </button>
            </div>

            {/* Footer spacing for bottom tab bar */}
            <div className="h-4" />
        </div>
    );
}
