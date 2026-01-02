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
    const [searchQuery, setSearchQuery] = useState('');
    const [filterAction, setFilterAction] = useState<string>('ALL');

    useEffect(() => {
        if (!user) return;
        if (user.role !== 'ADMIN') {
            router.push('/dashboard');
            return;
        }
        loadData();
    }, [user, router]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [logsData, usersData] = await Promise.all([
                storage.getLogs(),
                storage.getUsers()
            ]);
            setLogs(logsData);
            setUsers(usersData);
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const getUserName = (userId?: string) => {
        if (!userId) return 'System / Guest';
        const found = users.find(u => u.id === userId);
        return found ? found.name : 'Unknown User';
    };

    const filteredLogs = logs.filter(log => {
        if (filterAction !== 'ALL' && log.action !== filterAction) return false;

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const userName = getUserName(log.userId).toLowerCase();
            const details = (log.details || '').toLowerCase();
            const action = log.action.toLowerCase();

            return userName.includes(query) ||
                details.includes(query) ||
                action.includes(query);
        }
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
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Activity Logs</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Audit trail of all system activities
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={loadData}
                    className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </Button>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm">
                <div className="flex flex-col gap-4">
                    <Input
                        placeholder="Search by user, action or details..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-50/50 border-gray-200 focus:bg-white transition-all text-gray-900 placeholder:text-gray-400"
                    />
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                        {['ALL', 'CHECKOUT', 'RETURN', 'EDIT', 'CREATE', 'VERIFY', 'LOGIN', 'SIGNUP', 'LOGOUT', 'LOGIN_FAILED'].map(action => (
                            <Button
                                key={action}
                                variant={filterAction === action ? 'primary' : 'outline'}
                                size="sm"
                                onClick={() => setFilterAction(action)}
                                className={`whitespace-nowrap shrink-0 ${filterAction !== action ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900' : ''}`}
                            >
                                {action === 'ALL' ? 'All' : action}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            <PullToRefresh onRefresh={loadData}>
                {/* Desktop View Table */}
                <div className="hidden md:block bg-white rounded-2xl border border-gray-200/60 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                                <tr>
                                    <th className="px-5 py-3 min-w-[150px] font-semibold text-xs uppercase tracking-wider">Date & Time</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">User</th>
                                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider">Action</th>
                                    <th className="px-5 py-3 w-full font-semibold text-xs uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-8 text-center text-gray-500">Loading logs...</td>
                                    </tr>
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-8 text-center text-gray-500">No logs found</td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-5 py-4 whitespace-nowrap text-gray-500">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap font-medium text-gray-900">
                                                {getUserName(log.userId)}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge variant={getActionVariant(log.action)}>
                                                    {log.action}
                                                </Badge>
                                            </td>
                                            <td className="px-5 py-4 text-gray-600 italic text-xs">
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
                    {loading ? (
                        <div className="text-center py-10 bg-white rounded-2xl border border-gray-200/60 text-gray-500">
                            Loading logs...
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-2xl border border-gray-200/60 text-gray-500">
                            No logs found
                        </div>
                    ) : (
                        filteredLogs.map((log) => (
                            <div key={log.id} className="bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm space-y-3">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="font-semibold text-[15px] text-gray-900">{getUserName(log.userId)}</p>
                                        <p className="text-xs text-gray-400">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </p>
                                    </div>
                                    <Badge variant={getActionVariant(log.action)} className="text-[10px] px-2 py-0">
                                        {log.action}
                                    </Badge>
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                                    {log.details || 'No details provided'}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </PullToRefresh>
        </div>
    );
}
