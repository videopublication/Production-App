'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Log, User } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/Badge';
import { PullToRefresh } from '@/components/PullToRefresh';

export default function AdminLogsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [logs, setLogs] = useState<Log[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterAction, setFilterAction] = useState<string>('ALL');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Reset when search changes
    useEffect(() => {
        setPage(1);
        setLogs([]);
        setHasMore(true);
        loadData(1, true);
    }, [debouncedSearch]);

    useEffect(() => {
        if (!user) return;
        if (user.role !== 'ADMIN') {
            router.push('/dashboard');
            return;
        }
        storage.getUsers().then(setUsers);
        // Initial load is handled by the search effect above
    }, [user, router]);

    const loadData = async (pageNum: number = 1, isReset: boolean = false) => {
        setLoading(true);
        try {
            const limit = 20;
            const newLogs = await storage.getLogs(pageNum, limit, debouncedSearch);

            if (newLogs.length < limit) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }

            if (isReset) {
                setLogs(newLogs);
            } else {
                setLogs(prev => [...prev, ...newLogs]);
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        loadData(nextPage, false);
    };

    const handleRefresh = async () => {
        setPage(1);
        setHasMore(true);
        await loadData(1, true);
    };

    const getUserName = (userId?: string) => {
        if (!userId) return 'System / Guest';
        const found = users.find(u => u.id === userId);
        return found ? found.name : 'Unknown User';
    };

    // Filter action on Client Side (on loaded logs)
    const filteredLogs = logs.filter(log => {
        if (filterAction !== 'ALL' && log.action !== filterAction) return false;
        return true;
    });

    const getActionVariant = (action: string): 'default' | 'success' | 'warning' | 'secondary' | 'outline' => {
        switch (action) {
            case 'CHECKOUT': return 'default';
            case 'RETURN': return 'success';
            case 'EDIT': return 'warning';
            case 'CREATE': return 'default';
            case 'VERIFY': return 'secondary';
            case 'LOGIN': return 'success';
            case 'SIGNUP': return 'default';
            case 'LOGOUT': return 'secondary';
            case 'LOGIN_FAILED': return 'outline';
            default: return 'outline';
        }
    };

    if (!user || user.role !== 'ADMIN') {
        return null; // Or unauthorized view
    }

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Activity Logs</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Audit trail of all system activities
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefresh()}
                    className="bg-white dark:bg-[#1c1c1e] border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </Button>
            </div>

            <div className="bg-white dark:bg-[#1c1c1e] p-4 rounded-2xl border border-gray-200/60 dark:border-gray-800 shadow-sm">
                <div className="flex flex-col gap-4">
                    <Input
                        placeholder="Search by user, action or details..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-50/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 focus:bg-white dark:focus:bg-gray-800 transition-all text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                        {['ALL', 'CHECKOUT', 'RETURN', 'EDIT', 'CREATE', 'VERIFY', 'LOGIN', 'SIGNUP', 'LOGOUT', 'LOGIN_FAILED'].map(action => (
                            <Button
                                key={action}
                                variant={filterAction === action ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setFilterAction(action)}
                                className={`whitespace-nowrap shrink-0 ${filterAction !== action ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white' : ''}`}
                            >
                                {action === 'ALL' ? 'All' : action}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            <PullToRefresh onRefresh={handleRefresh}>
                {/* Desktop View Table */}
                <div className="hidden md:block bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/60 dark:border-gray-800 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-100 dark:border-gray-800">
                                <tr>
                                    <th className="px-5 py-3 min-w-[150px] font-semibold text-xs uppercase tracking-wider">Date & Time</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">User</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Action</th>
                                    <th className="px-5 py-3 w-full font-semibold text-xs uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {logs.length === 0 && !loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">No logs found</td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                                            <td className="px-5 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">
                                                {getUserName(log.userId)}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge variant={getActionVariant(log.action)}>
                                                    {log.action}
                                                </Badge>
                                            </td>
                                            <td className="px-5 py-4 text-gray-600 dark:text-gray-400 italic text-xs">
                                                {log.details || '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile View List */}
                <div className="md:hidden space-y-3">
                    {logs.length === 0 && !loading ? (
                        <div className="text-center py-10 bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/60 dark:border-gray-800 text-gray-500 dark:text-gray-400">
                            No logs found
                        </div>
                    ) : (
                        filteredLogs.map((log) => (
                            <div key={log.id} className="bg-white dark:bg-[#1c1c1e] p-4 rounded-2xl border border-gray-200/60 dark:border-gray-800 shadow-sm space-y-3">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="font-semibold text-[15px] text-gray-900 dark:text-white">{getUserName(log.userId)}</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </p>
                                    </div>
                                    <Badge variant={getActionVariant(log.action)} className="text-[10px] px-2 py-0">
                                        {log.action}
                                    </Badge>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                                    {log.details || 'No details provided'}
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {/* Load More & Loading State */}
                <div className="pt-4 flex justify-center">
                    {loading ? (
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
                            <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
                            Loading more logs...
                        </div>
                    ) : hasMore ? (
                        <Button
                            variant="outline"
                            onClick={handleLoadMore}
                            className="bg-white dark:bg-[#1c1c1e] border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Load More
                        </Button>
                    ) : logs.length > 0 ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500">No more logs to load</p>
                    ) : null}
                </div>
            </PullToRefresh>
        </div>
    );
}
