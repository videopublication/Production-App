'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import useFcmToken from '@/hooks/useFcmToken';
import { useNotifications } from '@/hooks/useNotifications';
import { ChevronLeft } from 'lucide-react';

import { SettingsDrawer } from './SettingsDrawer';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';

const pageNames: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/inventory': 'Inventory',
    '/checkout': 'Checkout',
    '/returns': 'Returns',
    '/transactions': 'Transactions',
    '/verification': 'Verification',
    '/admin/users': 'Users',
    '/admin/cleanup': 'Cleanup',
    '/profile': 'Profile',
};
// ... (pageNames object remains same, so not included in replacement)

export const MobileHeader = () => {
    const { user } = useAuth();
    const { department, allDepartments, switchDepartment } = useDepartment();
    const labels = getDepartmentLabels(department);
    const pathname = usePathname();
    const router = useRouter();
    const { notificationPermission, enableNotifications } = useFcmToken();
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

    // Notification Hook
    const { unreadCount } = useNotifications();

    if (!user) return null;

    // ... (getPageName function remains same)

    const getPageName = () => {
        if (pageNames[pathname]) return pageNames[pathname];
        for (const [path, name] of Object.entries(pageNames)) {
            if (pathname.startsWith(path + '/')) {
                if (pathname.includes('/inventory/')) return 'Item Details';
                if (pathname.startsWith('/shoots/')) return `${labels.workSingular} Details`;
                if (pathname.startsWith('/transactions/')) return 'Transaction Details';
                if (pathname.startsWith('/admin/users/')) return 'Member';
                return name;
            }
        }
        return department?.name || 'VP App';
    };

    return (
        <>
            <header className="mobile-header fixed top-0 left-0 right-0 z-[100] md:hidden">
                {/* Glassmorphic background */}
                <div className="absolute inset-0 bg-gray-200 dark:bg-[#2c2c2e] backdrop-blur-xl backdrop-saturate-150 border-b border-gray-300 dark:border-[#3a3a3c]" />

                {/* Content */}
                <div className="relative flex items-center justify-between h-full px-4 pt-safe-top">
                    {/* Left Action / Spacer */}
                    <div className="flex-none w-[110px] flex items-center justify-start">
                        {(pathname === '/profile' ||
                            pathname === '/notifications' ||
                            (pathname.startsWith('/inventory/') && pathname !== '/inventory') ||
                            (pathname.startsWith('/shoots/') && pathname !== '/shoots') ||
                            (pathname.startsWith('/transactions/') && pathname !== '/transactions') ||
                            (pathname.startsWith('/admin/users/') && pathname !== '/admin/users')
                        ) && (
                                <button
                                    onClick={() => router.back()}
                                    className="flex items-center text-primary active:opacity-50 transition-opacity -ml-2"
                                >
                                    <ChevronLeft className="w-8 h-8 -mr-1" strokeWidth={2.5} />
                                    <span className="text-[17px] font-normal leading-none pb-[1px]">Back</span>
                                </button>
                            )}
                    </div>

                    {/* Centered title & Switcher */}
                    <div className="flex flex-col items-center justify-center flex-1 min-w-0 px-1 overflow-hidden">
                        {user?.role === 'SUPER_ADMIN' && switchDepartment ? (
                            <div className="w-full flex justify-center items-center">
                                <select
                                    className="bg-transparent text-[15px] font-semibold text-[#1d1d1f] dark:text-white tracking-[-0.3px] truncate text-center appearance-none outline-none cursor-pointer pr-4 max-w-full"
                                    style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2210%22%20height%3D%2210%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M2%203l3%203%203-3%22%20stroke%3D%22%2386868b%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center' }}
                                    value={department?.id || ''}
                                    onChange={(e) => switchDepartment(e.target.value || null)}
                                >
                                    <option value="" className="text-black bg-white dark:bg-[#1c1c1e] dark:text-white text-[14px]">Global: {getPageName()}</option>
                                    {allDepartments.map(dept => (
                                        <option key={dept.id} value={dept.id} className="text-black bg-white dark:bg-[#1c1c1e] dark:text-white text-[14px]">
                                            {dept.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <h1 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-white tracking-[-0.3px] truncate text-center w-full">
                                {getPageName()}
                            </h1>
                        )}
                        {/* Subtitle to show current view context clearly */}
                        {user?.role === 'SUPER_ADMIN' && (
                            <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider leading-none mt-0.5 truncate max-w-full">
                                {department ? 'Scoped View' : 'Global View'}
                            </span>
                        )}
                    </div>

                    {/* Right icons */}
                    <div className="flex-none w-[110px] flex items-center justify-end gap-1">
                        <button
                            type="button"
                            onClick={async () => {
                                if (notificationPermission !== 'granted') {
                                    await enableNotifications();
                                }
                                router.push('/notifications');
                            }}
                            className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[#86868b] dark:text-gray-400 hover:bg-[#f5f5f7] dark:hover:bg-gray-800 hover:text-[#1d1d1f] dark:hover:text-white transition-colors active:scale-95"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            {user && unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-[#ff3b30] rounded-full"></span>
                            )}
                        </button>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#86868b] dark:text-gray-400 hover:bg-[#f5f5f7] dark:hover:bg-gray-800 hover:text-[#1d1d1f] dark:hover:text-white transition-colors active:scale-95"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        {/* Profile Avatar */}
                        <Link href="/profile" className="ml-1">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5856d6] to-[#af52de] flex items-center justify-center text-white font-semibold text-sm active:scale-95 transition-transform">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                        </Link>
                    </div>
                </div>
            </header>

            <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </>
    );
};
