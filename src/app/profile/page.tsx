'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { ActiveSessions } from '@/components/ActiveSessions';

import { APP_CONFIG } from '@/lib/config';
import { useToast } from '@/lib/toast-context';
import { getRoleLabel } from '@/lib/roles';
import { useDepartment } from '@/lib/department-context';
import { storage } from '@/lib/storage';

export default function ProfilePage() {
    const router = useRouter();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const { department, allDepartments, switchDepartment } = useDepartment();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Profile Edit State
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setPhone(user.phone || user.whatsappNumber || '');
            setName(user.name || '');
        }
    }, [user]);

    if (!user) return null;

    const canEdit = user.canSelfEditProfile !== false || ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

    const handleSaveProfile = async () => {
        if (!canEdit) {
            showToast('Profile editing is locked by your administrator', 'error');
            return;
        }

        setIsSaving(true);
        try {
            // Clean phone string (keep digits)
            let cleanedPhone = phone.replace(/[^\d+]/g, '');
            if (cleanedPhone && !cleanedPhone.startsWith('+') && cleanedPhone.length === 10) {
                cleanedPhone = `+91${cleanedPhone}`;
            }

            await storage.updateUser(user.id, {
                name: name.trim(),
                phone: cleanedPhone,
                whatsappNumber: cleanedPhone
            });

            showToast('Profile updated successfully!', 'success');
        } catch (err: any) {
            console.error('Failed to update profile:', err);
            showToast(err.message || 'Failed to update profile', 'error');
        } finally {
            setIsSaving(false);
        }
    };

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
Phone: ${phone}
Role: ${getRoleLabel(user.role)}
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
            label: 'WhatsApp Hub',
            path: '/admin/whatsapp',
            roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'],
            icon: <svg className="w-5 h-5 text-[#25d366]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        },
        {
            label: 'Activity Logs',
            path: '/admin/logs',
            roles: ['ADMIN', 'SUPER_ADMIN'],
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        }
    ];

    const visibleMenuItems = menuItems.filter(item => item.roles.includes(user.role));

    // Formatted WhatsApp Tag
    const formattedTag = phone ? `@${phone.replace(/[^\d]/g, '')}` : 'Not configured';

    return (
        <div className="max-w-lg mx-auto space-y-6 animate-fade-in relative pb-12">
            <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Profile Header */}
            <div className="flex flex-col items-center py-6">
                {user.avatarUrl ? (
                    <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="w-20 h-20 rounded-full object-cover mb-4 shadow-lg border-2 border-primary/20"
                    />
                ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5856d6] to-[#af52de] flex items-center justify-center text-white font-semibold text-3xl mb-4 shadow-lg">
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                )}
                <h1 className="text-xl font-semibold text-[#1d1d1f] dark:text-white">{user.name}</h1>
                <p className="text-[15px] text-[#86868b] dark:text-gray-400">{getRoleLabel(user.role)}</p>

                {/* WhatsApp Tag Badge */}
                <div className="mt-2 flex items-center gap-1.5 px-3 py-1 bg-[#25d366]/10 text-[#25d366] text-xs font-semibold rounded-full border border-[#25d366]/20">
                    <span>📱</span>
                    <span>{formattedTag}</span>
                </div>
            </div>

            {/* Account Details & Phone Number */}
            <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                    <p className="section-header-ios mb-0">Personal Profile</p>
                    {!canEdit && (
                        <span className="text-[11px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                            🔒 Edit Locked by Admin
                        </span>
                    )}
                </div>

                <div className="grouped-container p-4 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-[#86868b] dark:text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={!canEdit}
                            placeholder="Enter your name"
                            className="w-full bg-background dark:bg-[#2c2c2e] border border-border dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-[15px] text-[#1d1d1f] dark:text-white outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-[#86868b] dark:text-gray-400 uppercase tracking-wider mb-1">WhatsApp Phone Number</label>
                        <div className="relative">
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                disabled={!canEdit}
                                placeholder="+91 9876543210"
                                className="w-full bg-background dark:bg-[#2c2c2e] border border-border dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-[15px] text-[#1d1d1f] dark:text-white outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed font-mono"
                            />
                        </div>
                        <p className="text-[11px] text-[#86868b] dark:text-gray-400 mt-1">
                            Used for shoot call sheet tagging & group WhatsApp notifications.
                        </p>
                    </div>

                    {canEdit && (
                        <button
                            onClick={handleSaveProfile}
                            disabled={isSaving}
                            className="w-full py-2.5 bg-[#34c759] hover:bg-[#2fb350] text-white font-semibold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? 'Saving Changes...' : 'Save Profile Details'}
                        </button>
                    )}
                </div>
            </div>

            {/* Account Settings */}
            <div className="space-y-2">
                <p className="section-header-ios">Account</p>
                <div className="grouped-container">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="list-item-native w-full flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
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
                        <span className="text-[15px] text-[#86868b] dark:text-gray-400">{getRoleLabel(user.role)}</span>
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

            {/* Default view (Super Admin only) */}
            {user.role === 'SUPER_ADMIN' && switchDepartment && (
                <div className="space-y-2">
                    <p className="section-header-ios">Preferences</p>
                    <div className="grouped-container">
                        <div className="list-item-native flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <span className="block text-[15px] text-[#1d1d1f] dark:text-gray-100">Default department</span>
                                <span className="block text-[13px] text-[#86868b] dark:text-gray-400">Loads on app start</span>
                            </div>
                            <select
                                value={department?.id || ''}
                                onChange={(e) => {
                                    switchDepartment(e.target.value || null);
                                    showToast(
                                        e.target.value
                                            ? `Default set to ${allDepartments.find(d => d.id === e.target.value)?.name || 'department'}`
                                            : 'Default set to Global view',
                                        'success'
                                    );
                                }}
                                className="max-w-[55%] shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[15px] text-[#1d1d1f] outline-none focus:ring-2 focus:ring-primary dark:border-gray-700 dark:bg-[#2c2c2e] dark:text-white"
                            >
                                <option value="">Global (all departments)</option>
                                {allDepartments.map(dept => (
                                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Actions for Managers/Admins */}
            {visibleMenuItems.length > 0 && (
                <div className="space-y-2">
                    <p className="section-header-ios">Management</p>
                    <div className="grouped-container">
                        {visibleMenuItems.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => router.push(item.path)}
                                className="list-item-native w-full flex items-center gap-3"
                            >
                                <span className="text-[var(--primary)]">{item.icon}</span>
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
        </div>
    );
}
