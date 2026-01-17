'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Transaction, Equipment, User } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/Badge';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useTransactions } from '@/hooks/useTransactions';
import { useInventory } from '@/hooks/useInventory';

export default function TransactionsPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();

    // Data Hooks (Offline Ready)
    const { transactions: allTransactions, isLoading: isTxLoading, refresh: refreshTransactions } = useTransactions();
    const { equipment, users, isLoading: isInventoryLoading, refresh: refreshInventory } = useInventory();

    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('OPEN');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Derived State
    const transactions = React.useMemo(() => {
        if (!allTransactions) return [];
        return [...allTransactions].sort((a, b) =>
            new Date(b.timestampOut).getTime() - new Date(a.timestampOut).getTime()
        );
    }, [allTransactions]);

    const loading = isTxLoading || isInventoryLoading;

    // Refresh function for PullToRefresh
    const handleRefresh = async () => {
        await Promise.all([refreshTransactions(), refreshInventory()]);
    };

    useEffect(() => {
        if (authLoading) return;
        if (!user) router.push('/login');
        else if (!['CREW', 'MANAGER', 'ADMIN'].includes(user.role)) router.push('/');
    }, [user, router, authLoading]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const getUserName = (userId: string) => {
        const foundUser = users.find(u => u.id === userId);
        return foundUser?.name || 'Unknown User';
    };

    const getItemNames = (itemIds: string[]) => {
        return itemIds.map(id => {
            const item = equipment.find(e => e.id === id);
            return item?.name || 'Unknown Item';
        });
    };

    const filteredTransactions = transactions.filter(txn => {
        // Filter by status
        if (filterStatus !== 'ALL' && txn.status !== filterStatus) {
            return false;
        }

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const userName = getUserName(txn.userId).toLowerCase();
            const project = (txn.project || '').toLowerCase();
            const itemNames = getItemNames(txn.items).join(' ').toLowerCase();

            return userName.includes(query) ||
                project.includes(query) ||
                itemNames.includes(query) ||
                txn.id.toLowerCase().includes(query);
        }

        return true;
    });



    const generateMessage = (txn: Transaction) => {
        const userName = getUserName(txn.userId);
        const additionalNames = (txn.additionalUsers || [])
            .map(id => getUserName(id))
            .filter(name => name !== 'Unknown User');

        const allNames = [userName, ...additionalNames].join(', ');
        const itemNames = getItemNames(txn.items);
        const date = new Date(txn.timestampOut).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

        return `🎥 *Equipment Checkout Details*

*Project:* ${txn.project || 'Unspecified'}
*ID:* ${txn.id}
*Taken By:* ${allNames}
*Date:* ${date}

*Equipment List:*
${itemNames.map(name => `• ${name}`).join('\n')}${txn.notes ? `\n\n*Notes / Other Items:*\n${txn.notes}` : ''}

_Generated via Production App_`;
    };

    const handleShareWhatsApp = (e: React.MouseEvent, txn: Transaction) => {
        e.stopPropagation();
        const message = generateMessage(txn);
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    };

    const handleCopyMessage = async (e: React.MouseEvent, txn: Transaction) => {
        e.stopPropagation();
        const message = generateMessage(txn);
        try {
            await navigator.clipboard.writeText(message);
            setCopiedId(txn.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (!user) {
        return null;
    }

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-3 sm:space-y-5 animate-fade-in">
                {/* Stats at top - Compact on mobile */}
                <div className="grid grid-cols-4 gap-2 sm:gap-4">
                    <div className="p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
                        <p className="text-[10px] sm:text-sm font-medium text-blue-600">Total</p>
                        <p className="text-lg sm:text-2xl font-bold">{transactions.length}</p>
                    </div>
                    <div className="p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
                        <p className="text-[10px] sm:text-sm font-medium text-green-600">Active</p>
                        <p className="text-lg sm:text-2xl font-bold">
                            {transactions.filter(t => t.status === 'OPEN').length}
                        </p>
                    </div>
                    <div className="p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-gray-500/10 to-gray-600/5 border border-gray-500/20">
                        <p className="text-[10px] sm:text-sm font-medium text-gray-600">Closed</p>
                        <p className="text-lg sm:text-2xl font-bold">
                            {transactions.filter(t => t.status === 'CLOSED').length}
                        </p>
                    </div>
                    <div className="p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20">
                        <p className="text-[10px] sm:text-sm font-medium text-orange-600">Out</p>
                        <p className="text-lg sm:text-2xl font-bold">
                            {transactions.filter(t => t.status === 'OPEN').reduce((sum, t) => sum + t.items.length, 0)}
                        </p>
                    </div>
                </div>

                {/* Search & Filters - Compact */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <div className="flex-1">
                        <Input
                            type="text"
                            placeholder="Search project, user, items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 sm:h-11"
                        />
                    </div>
                    <div className="flex gap-1.5 sm:gap-2">
                        <Button
                            variant={filterStatus === 'ALL' ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('ALL')}
                            className="flex-1 sm:flex-none h-10 sm:h-11 text-xs sm:text-sm"
                        >
                            All
                        </Button>
                        <Button
                            variant={filterStatus === 'OPEN' ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('OPEN')}
                            className="flex-1 sm:flex-none h-10 sm:h-11 text-xs sm:text-sm"
                        >
                            Active
                        </Button>
                        <Button
                            variant={filterStatus === 'CLOSED' ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('CLOSED')}
                            className="flex-1 sm:flex-none h-10 sm:h-11 text-xs sm:text-sm"
                        >
                            Closed
                        </Button>
                    </div>
                </div>

                {/* Transactions List */}
                <Card title={`${filteredTransactions.length} Transaction${filteredTransactions.length !== 1 ? 's' : ''}`}>
                    {loading ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                            Loading transactions...
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-lg font-medium mb-1">No transactions found</p>
                            <p className="text-sm">Try adjusting your filters or search query</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredTransactions.map((txn) => (
                                <div
                                    key={txn.id}
                                    className="p-4 rounded-lg border border-border bg-background/50 hover:bg-background/80 transition-all cursor-pointer group"
                                    onClick={() => router.push(`/transactions/${txn.id}`)}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[11px] font-bold text-[#0071e3] bg-[#0071e3]/10 px-1.5 py-0.5 rounded tracking-wider">{txn.id}</span>
                                                    <h3 className="font-semibold text-[17px] text-[#1d1d1f] truncate">
                                                        {txn.project || 'Unspecified Project'}
                                                    </h3>
                                                </div>
                                                <Badge variant={txn.status === 'OPEN' ? 'success' : 'default'}>
                                                    {txn.status}
                                                </Badge>
                                            </div>
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <p className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                    </svg>
                                                    {getUserName(txn.userId)}
                                                    {txn.additionalUsers && txn.additionalUsers.length > 0 && (
                                                        <span className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full ml-1">
                                                            +{txn.additionalUsers.length}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    {new Date(txn.timestampOut).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                </p>
                                                <p className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                    </svg>
                                                    {txn.items.length} item{txn.items.length !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex sm:flex-col gap-2 sm:items-end">
                                            <Button
                                                size="sm"
                                                className="flex-1 sm:flex-none bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
                                                onClick={(e) => handleShareWhatsApp(e, txn)}
                                            >
                                                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                                </svg>
                                                Share
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={(e) => handleCopyMessage(e, txn)}
                                                className="flex-1 sm:flex-none"
                                            >
                                                {copiedId === txn.id ? (
                                                    <>
                                                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                                        </svg>
                                                        Copy
                                                    </>
                                                )}
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/transactions/${txn.id}`);
                                                }}
                                                className="flex-1 sm:flex-none group-hover:border-primary group-hover:text-primary"
                                            >
                                                {txn.status === 'OPEN' ? 'Manage' : 'View'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </PullToRefresh>
    );
}
