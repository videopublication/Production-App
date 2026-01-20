'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

export default function ProfilePage() {
    const router = useRouter();
    const { user, logout, linkGoogleCalendar } = useAuth();

    React.useEffect(() => {
        if (!user) {
            router.push('/login');
        }
    }, [user, router]);

    if (!user) return null;

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const menuItems = [
        {
            label: 'Verification',
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            path: '/verification',
            roles: ['MANAGER', 'ADMIN']
        },
        {
            label: 'Manage Users',
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
            ),
            path: '/admin/users',
            roles: ['ADMIN']
        },
    ];

    const visibleMenuItems = menuItems.filter(item => item.roles.includes(user.role));

    return (
        <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
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
                <h1 className="text-xl font-semibold text-[#1d1d1f]">{user.name}</h1>
                <p className="text-[15px] text-[#86868b]">{user.role}</p>
            </div>

            {/* Account Section */}
            <div className="space-y-2">
                <p className="section-header-ios">Account</p>
                <div className="grouped-container">
                    <div className="list-item-native flex items-center justify-between">
                        <span className="text-[15px] text-[#1d1d1f]">Email</span>
                        <span className="text-[15px] text-[#86868b]">{user.email || 'Not set'}</span>
                    </div>
                    <div className="list-item-native flex items-center justify-between">
                        <span className="text-[15px] text-[#1d1d1f]">Role</span>
                        <span className="text-[15px] text-[#86868b]">{user.role}</span>
                    </div>
                    <div className="list-item-native flex items-center justify-between">
                        <span className="text-[15px] text-[#1d1d1f]">User ID</span>
                        <span className="text-[13px] text-[#86868b] font-mono">{user.id.substring(0, 8)}...</span>
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
                                <span className="text-[15px] text-[#1d1d1f] flex-1 text-left">{item.label}</span>
                                <svg className="w-4 h-4 text-[#c7c7cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Connections Section */}
            <div className="space-y-2">
                <p className="section-header-ios">Connections</p>
                <div className="grouped-container">
                    <button
                        onClick={async () => {
                            const { error } = await linkGoogleCalendar();
                            if (error) alert('Failed to link Google Calendar: ' + error.message);
                        }}
                        className="list-item-native w-full flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            {/* Google Icon */}
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    fill="#4285F4"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                                />
                                <path
                                    fill="#EA4335"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                            <span className="text-[15px] text-[#1d1d1f]">Google Calendar</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[15px] text-[#86868b]">Connect</span>
                            <svg className="w-4 h-4 text-[#c7c7cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </button>
                </div>
            </div>

            {/* App Info */}
            <div className="grouped-container">
                <div className="list-item-native flex items-center justify-between">
                    <span className="text-[15px] text-[#1d1d1f]">Version</span>
                    <span className="text-[15px] text-[#86868b]">2.0.0</span>
                </div>
                <div className="list-item-native flex items-center justify-between">
                    <span className="text-[15px] text-[#1d1d1f]">Build</span>
                    <span className="text-[15px] text-[#86868b]">Production</span>
                </div>
            </div>

            {/* Logout Button */}
            <div className="px-4 pt-4">
                <button
                    onClick={handleLogout}
                    className="w-full py-3 bg-white rounded-xl text-[#ff3b30] text-[17px] font-medium active:bg-[#f5f5f7] transition-colors shadow-sm"
                >
                    Sign Out
                </button>
            </div>

            {/* Footer spacing for bottom tab bar */}
            <div className="h-4" />
        </div>
    );
}
