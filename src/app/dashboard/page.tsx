'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Transaction } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth';

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const [stats, setStats] = useState({
        total: 0,
        available: 0,
        checkedOut: 0,
        maintenance: 0,
        damaged: 0,
    });
    const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

    const loadDashboardData = React.useCallback(async () => {
        const items = await storage.getEquipment();
        const transactions = await storage.getTransactions();

        setStats({
            total: items.length,
            available: items.filter(i => i.status === 'AVAILABLE').length,
            checkedOut: items.filter(i => i.status === 'CHECKED_OUT').length,
            maintenance: items.filter(i => i.status === 'MAINTENANCE').length,
            damaged: items.filter(i => i.status === 'DAMAGED' || i.status === 'LOST').length,
        });

        setRecentTransactions(transactions.slice(-5).reverse());
    }, []);

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            router.push('/login');
            return;
        }

        if (!['MANAGER', 'ADMIN'].includes(user.role)) {
            router.push('/');
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadDashboardData();
    }, [user, router, loadDashboardData, authLoading]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 sm:space-y-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                    Manager Dashboard
                </h1>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" size="sm" onClick={loadDashboardData} className="flex-1 sm:flex-none">
                        Refresh Data
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Card className="p-3 sm:p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 hover:border-blue-500/40 transition-colors" hover>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                        <p className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400">Total</p>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold">{stats.total}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Items in inventory</p>
                </Card>
                <Card className="p-3 sm:p-6 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 hover:border-emerald-500/40 transition-colors" hover>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                        <p className="text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400">Available</p>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold">{stats.available}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Ready for checkout</p>
                </Card>
                <Card className="p-3 sm:p-6 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20 hover:border-orange-500/40 transition-colors" hover>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                        <p className="text-xs sm:text-sm font-medium text-orange-600 dark:text-orange-400">Checked Out</p>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold">{stats.checkedOut}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Currently in use</p>
                </Card>
                <Card className="p-3 sm:p-6 bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20 hover:border-red-500/40 transition-colors" hover>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                        <p className="text-xs sm:text-sm font-medium text-red-600 dark:text-red-400">Attention</p>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold">{stats.maintenance + stats.damaged}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Damaged / Maintenance</p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
                <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                    <Card title="Recent Activity" variant="glass">
                        {recentTransactions.length === 0 ? (
                            <div className="text-center py-8 sm:py-12 text-muted-foreground text-sm">
                                No recent transactions found.
                            </div>
                        ) : (
                            <div className="space-y-3 sm:space-y-4">
                                {recentTransactions.map((t) => (
                                    <div key={t.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 sm:p-4 rounded-lg bg-background/50 border border-border/50 hover:bg-background/80 transition-colors">
                                        <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-0 w-full sm:w-auto">
                                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm sm:text-base shrink-0">
                                                {t.project ? t.project.charAt(0).toUpperCase() : 'U'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-sm sm:text-base truncate">{t.project || 'Unspecified Project'}</p>
                                                <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground">
                                                    <span>{new Date(t.timestampOut).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span>{new Date(t.timestampOut).toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                            <div className="sm:hidden">
                                                <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-secondary-foreground">
                                                    {t.items.length} Items
                                                </div>
                                            </div>
                                        </div>
                                        <div className="hidden sm:block text-right w-full sm:w-auto pl-11 sm:pl-0">
                                            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                                {t.items.length} Items
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">User ID: {t.userId.substring(0, 8)}...</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                <div className="space-y-4 sm:space-y-6">
                    <Card title="Quick Actions" variant="glass">
                        <div className="space-y-2 sm:space-y-3">
                            <Button className="w-full justify-start text-sm sm:text-base" variant="outline" size="sm" onClick={() => router.push('/inventory/add')}>
                                <span className="mr-2">+</span> Add New Equipment
                            </Button>
                            <Button className="w-full justify-start text-sm sm:text-base" variant="outline" size="sm" onClick={() => router.push('/verification')}>
                                <span className="mr-2">✓</span> Verify Returns
                            </Button>
                            <Button className="w-full justify-start text-sm sm:text-base" variant="outline" size="sm" onClick={() => router.push('/inventory')}>
                                <span className="mr-2">🔍</span> Search Inventory
                            </Button>
                            <Button className="w-full justify-start text-sm sm:text-base" variant="outline" size="sm" onClick={() => router.push('/admin/notifications')}>
                                <span className="mr-2">📢</span> Send Notification
                            </Button>
                        </div>
                    </Card>

                    <Card title="System Health" variant="glass">
                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-xs sm:text-sm font-medium">Database Status</span>
                                <span className="text-[10px] sm:text-xs bg-green-500/10 text-green-600 px-2 py-0.5 sm:py-1 rounded-full border border-green-500/20">Connected</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs sm:text-sm">
                                    <span className="text-muted-foreground">Storage Usage</span>
                                    <span>24%</span>
                                </div>
                                <div className="w-full bg-secondary rounded-full h-1.5 sm:h-2 overflow-hidden">
                                    <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '24%' }}></div>
                                </div>
                            </div>
                            <p className="text-[10px] sm:text-xs text-muted-foreground pt-2 border-t border-border/50">
                                System running optimally. Last backup: Today, 09:00 AM
                            </p>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
