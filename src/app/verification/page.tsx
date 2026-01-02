'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Equipment, User } from '@/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';

type SortField = 'item' | 'project' | 'user' | 'date';
type SortDirection = 'asc' | 'desc';

import { Skeleton } from '@/components/Skeleton';

export default function VerificationPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(true); // Data loading state
    const [pendingItems, setPendingItems] = useState<Equipment[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
        if (typeof window !== 'undefined') {
            return (sessionStorage.getItem('verificationViewMode') as 'card' | 'table') || 'card';
        }
        return 'card';
    });

    useEffect(() => {
        sessionStorage.setItem('verificationViewMode', viewMode);
    }, [viewMode]);

    // Selection state
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    // Sorting state
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const loadItems = React.useCallback(async () => {
        // Removed setIsLoading(true) to allow seamless updates
        try {
            const items = await storage.getEquipment();
            const txns = await storage.getTransactions();
            const usersList = await storage.getUsers();

            setPendingItems(items.filter(i => i.status === 'PENDING_VERIFICATION'));
            setTransactions(txns);
            setUsers(usersList);
        } catch (error) {
            console.error("Failed to load items", error);
        } finally {
            setIsLoading(false);
        }
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
        loadItems();
    }, [user, router, loadItems, authLoading]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const getUserName = (userId?: string) => {
        if (!userId) return 'Unknown';
        const foundUser = users.find(u => u.id === userId);
        return foundUser ? foundUser.name : 'Unknown';
    };

    const getItemTransaction = (itemId: string) => {
        return transactions.find(t => t.items.includes(itemId));
    };

    const formatTxnId = (id: string) => {
        if (id.startsWith('TXN-')) return id;
        return `TXN-${id.substring(0, 6).toUpperCase()}`;
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Today';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    // Sorted items for table view
    const sortedItems = useMemo(() => {
        return [...pendingItems].sort((a, b) => {
            const txnA = getItemTransaction(a.id);
            const txnB = getItemTransaction(b.id);

            let comparison = 0;

            switch (sortField) {
                case 'item':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'project':
                    const projA = txnA?.project || 'Unspecified';
                    const projB = txnB?.project || 'Unspecified';
                    comparison = projA.localeCompare(projB);
                    break;
                case 'user':
                    const userA = getUserName(a.assignedTo);
                    const userB = getUserName(b.assignedTo);
                    comparison = userA.localeCompare(userB);
                    break;
                case 'date':
                    const dateA = new Date(a.lastActivity || 0).getTime();
                    const dateB = new Date(b.lastActivity || 0).getTime();
                    comparison = dateA - dateB;
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [pendingItems, sortField, sortDirection, transactions, users, getItemTransaction, getUserName]);

    // Group items by transaction/project for card view
    const groupedItems = useMemo(() => {
        const groups: { [key: string]: { project: string; txnId: string; date: string; items: Equipment[] } } = {};

        pendingItems.forEach(item => {
            const txn = getItemTransaction(item.id);
            const key = txn?.id || 'no-txn';

            if (!groups[key]) {
                groups[key] = {
                    project: txn?.project && txn.project.trim() !== '' ? txn.project : 'General Return',
                    txnId: txn ? formatTxnId(txn.id) : '',
                    date: formatDate(item.lastActivity),
                    items: []
                };
            }
            groups[key].items.push(item);
        });

        return Object.values(groups);
    }, [pendingItems, transactions, getItemTransaction]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Selection handlers
    const toggleItemSelection = (itemId: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
        } else {
            newSelected.add(itemId);
        }
        setSelectedItems(newSelected);
    };

    const toggleGroupSelection = (items: Equipment[]) => {
        const newSelected = new Set(selectedItems);
        const allSelected = items.every(i => newSelected.has(i.id));

        if (allSelected) {
            items.forEach(i => newSelected.delete(i.id));
        } else {
            items.forEach(i => newSelected.add(i.id));
        }
        setSelectedItems(newSelected);
    };

    const selectAll = () => {
        if (selectedItems.size === pendingItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(pendingItems.map(item => item.id)));
        }
    };

    const clearSelection = () => {
        setSelectedItems(new Set());
    };

    const handleVerify = async (id: string, status: 'AVAILABLE' | 'DAMAGED' | 'MAINTENANCE') => {
        try {
            const items = await storage.getEquipment();
            const item = items.find(i => i.id === id);

            if (!item) {
                showToast('Item not found', 'error');
                return;
            }

            await storage.updateEquipment(id, {
                status,
                assignedTo: null as any,
                lastActivity: new Date().toISOString()
            });

            const allTransactions = await storage.getTransactions();
            const relatedTransaction = allTransactions.find(
                t => t.status === 'OPEN' && t.items.includes(id)
            );

            if (user) {
                const projectText = relatedTransaction ? ` for project "${relatedTransaction.project || 'Unspecified'}"` : '';
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'VERIFY',
                    entityId: id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Verified item "${item.name}" (${item.barcode}) as ${status}${projectText}`
                });
            }

            if (relatedTransaction) {
                const updatedItems = await storage.getEquipment();
                const transactionItems = updatedItems.filter(
                    i => relatedTransaction.items.includes(i.id)
                );

                const allItemsReturned = transactionItems.every(
                    i => i.status !== 'CHECKED_OUT' && i.status !== 'PENDING_VERIFICATION'
                );

                if (allItemsReturned) {
                    await storage.updateTransaction(relatedTransaction.id, {
                        status: 'CLOSED'
                    });

                    if (user) {
                        await storage.addLog({
                            id: crypto.randomUUID(),
                            action: 'EDIT',
                            entityId: relatedTransaction.id,
                            userId: user.id,
                            timestamp: new Date().toISOString(),
                            details: `Transaction automatically closed - all items returned and verified`,
                        });
                    }
                    showToast(`Item verified! Transaction closed.`, 'success');
                } else {
                    showToast('Item verified successfully!', 'success');
                }
            } else {
                showToast('Item verified successfully', 'success');
            }

            loadItems();
        } catch (error) {
            console.error('Error verifying item:', error);
            showToast('Failed to verify item', 'error');
        }
    };

    const handleBulkVerify = async (status: 'AVAILABLE' | 'DAMAGED' | 'MAINTENANCE') => {
        if (selectedItems.size === 0) return;

        const count = selectedItems.size;
        for (const itemId of selectedItems) {
            await handleVerify(itemId, status);
        }

        clearSelection();
        showToast(`Verified ${count} items`, 'success');
    };

    const selectionMode = selectedItems.size > 0;

    // Sort indicator component
    const SortIndicator = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return (
                <svg className="w-3 h-3 opacity-30 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            );
        }
        return sortDirection === 'asc' ? (
            <svg className="w-3 h-3 text-primary ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="w-3 h-3 text-primary ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    };

    return (
        <div className="space-y-8 select-none mobile-safe-bottom">
            {/* Page Header */}
            <div className="flex flex-col gap-5 pb-4 border-b border-gray-200/50">
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Verification</h1>
                        <p className="text-[15px] text-gray-500 font-medium mt-1">Review recently returned equipment</p>
                    </div>

                    {/* View Toggle */}
                    <div className="hidden sm:flex items-center gap-2 p-1 bg-gray-100/80 rounded-lg backdrop-blur-sm">
                        <button onClick={() => setViewMode('card')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'card' ? 'bg-white shadow text-primary' : 'text-gray-400 hover:text-gray-600'}`} title="Grid View">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        </button>
                        <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'table' ? 'bg-white shadow text-primary' : 'text-gray-400 hover:text-gray-600'}`} title="List View">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                        </button>
                    </div>
                </div>

                {/* Main Select All Toggle (Always Visible if items exist) */}
                {pendingItems.length > 0 && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-3 w-3 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                            </span>
                            <span className="text-sm font-semibold text-gray-600">
                                {pendingItems.length} items waiting for action
                            </span>
                        </div>

                        {!selectionMode && (
                            <button
                                onClick={selectAll}
                                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                                Select All
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Floating Selection Toolbar - Premium Actions */}
            <div className={`
                fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 
                transition-all duration-300 ease-out origin-bottom
                ${selectionMode ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-24 opacity-0 scale-95 pointer-events-none'}
            `}>
                <div className="flex items-center p-2.5 rounded-2xl bg-[#0F172A] shadow-2xl border border-white/10 text-white min-w-[320px]">

                    {/* Left: Count & Clear */}
                    <div className="flex items-center gap-3 px-2">
                        <span className="font-semibold whitespace-nowrap text-[15px]">
                            {selectedItems.size} <span className="hidden sm:inline">Selected</span>
                            <span className="sm:hidden">Item{selectedItems.size !== 1 ? 's' : ''}</span>
                        </span>
                        <button
                            onClick={clearSelection}
                            className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-all"
                            title="Clear Selection"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Vertical Divider */}
                    <div className="h-6 w-px bg-white/20 mx-3"></div>

                    {/* Middle: Select All (Conditional) */}
                    {selectedItems.size < pendingItems.length && (
                        <button
                            onClick={selectAll}
                            className="mr-3 text-sm font-medium text-gray-300 hover:text-white whitespace-nowrap transition-colors"
                        >
                            Select All
                        </button>
                    )}

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={() => handleBulkVerify('AVAILABLE')}
                            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold text-sm active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-primary/30"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Verify</span>
                        </button>

                        <div className="flex items-center gap-1 pl-1">
                            <button
                                onClick={() => handleBulkVerify('DAMAGED')}
                                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-white/10 active:scale-95 transition-all"
                                title="Mark Damaged"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => handleBulkVerify('MAINTENANCE')}
                                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                                title="Send to Service"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <circle cx="15" cy="12" r="3" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content States */}
            {isLoading ? (
                viewMode === 'table' ? (
                    <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden shadow-sm">
                        <div className="p-4 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex gap-4">
                                    <Skeleton className="h-12 w-full rounded-xl" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-[180px] w-full rounded-xl" />
                        ))}
                    </div>
                )
            ) : pendingItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-primary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">All Verified</h3>
                    <p className="text-gray-500 mt-1 max-w-sm">
                        There are no items pending verification. Great job!
                    </p>
                </div>
            ) : viewMode === 'table' ? (
                /* ========== TABLE VIEW ========== */
                <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="w-12 px-5 py-3">
                                        <div className="flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.size === pendingItems.length && pendingItems.length > 0}
                                                onChange={selectAll}
                                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                                            />
                                        </div>
                                    </th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('item')} className="flex items-center text-xs font-semibold text-gray-500 hover:text-gray-800">Item <SortIndicator field="item" /></button></th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('project')} className="flex items-center text-xs font-semibold text-gray-500 hover:text-gray-800">Project <SortIndicator field="project" /></button></th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('user')} className="flex items-center text-xs font-semibold text-gray-500 hover:text-gray-800">Returned By <SortIndicator field="user" /></button></th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('date')} className="flex items-center text-xs font-semibold text-gray-500 hover:text-gray-800">Date <SortIndicator field="date" /></button></th>
                                    <th className="px-5 py-3 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {sortedItems.map((item) => {
                                    const txn = getItemTransaction(item.id);
                                    const isSelected = selectedItems.has(item.id);

                                    return (
                                        <tr key={item.id} onClick={() => toggleItemSelection(item.id)} className={`group transition-all duration-200 cursor-pointer ${isSelected ? 'bg-primary/5' : 'hover:bg-gray-50/80'}`}>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-center">
                                                    <input type="checkbox" checked={isSelected} onChange={() => toggleItemSelection(item.id)} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer" />
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-gray-900">{item.name}</p>
                                                        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.barcode}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-gray-900">{txn?.project || 'General'}</span>
                                                    <span className="text-[11px] text-gray-400">{txn ? formatTxnId(txn.id) : ''}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-white shadow-sm flex items-center justify-center text-[10px] font-bold text-gray-600">
                                                        {getUserName(item.assignedTo).charAt(0)}
                                                    </div>
                                                    <span className="text-gray-600">{getUserName(item.assignedTo)}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-gray-500">{formatDate(item.lastActivity)}</td>
                                            <td className="px-5 py-4">
                                                {!selectionMode && (
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
                                                        <button onClick={() => handleVerify(item.id, 'AVAILABLE')} className="px-4 py-1.5 rounded-full bg-primary/10 hover:bg-primary text-xs font-semibold text-primary hover:text-white transition-all hover:scale-105 active:scale-95">Verify</button>
                                                        <div className="h-4 w-px bg-gray-200 mx-1"></div>
                                                        <button onClick={() => handleVerify(item.id, 'DAMAGED')} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></button>
                                                        <button onClick={() => handleVerify(item.id, 'MAINTENANCE')} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="15" cy="12" r="3" /></svg></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* ========== CARD VIEW ========== */
                /* ========== CARD VIEW ========== */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {sortedItems.map((item) => {
                        const txn = getItemTransaction(item.id);
                        const isSelected = selectedItems.has(item.id);

                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleItemSelection(item.id)}
                                className={`
                                    group bg-white rounded-xl p-5 border transition-all duration-300 cursor-pointer h-full flex flex-col relative
                                    ${isSelected
                                        ? 'border-primary ring-1 ring-primary shadow-sm'
                                        : 'border-gray-200 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5'
                                    }
                                `}
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-[15px] font-bold text-gray-900 leading-snug truncate group-hover:text-primary transition-colors">
                                            {item.name}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                                                {txn?.project || 'General'}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`
                                        text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 uppercase tracking-wider
                                        ${item.condition === 'OK' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-yellow-50 text-yellow-700 border border-yellow-100'}
                                    `}>
                                        {item.condition === 'OK' ? 'Good' : item.condition.replace('_', ' ')}
                                    </span>
                                </div>

                                {/* Details */}
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600 border border-gray-200">
                                            {getUserName(item.assignedTo)?.charAt(0)}
                                        </div>
                                        <span className="truncate">
                                            {getUserName(item.assignedTo)}
                                        </span>
                                    </div>

                                    <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                                        <span className="font-mono text-[10px] text-gray-400">{item.barcode}</span>
                                        <span className="text-[10px] text-gray-400">{formatDate(item.lastActivity)}</span>
                                    </div>
                                </div>

                                {/* Hover Action Bar - visible only on hover AND when not selecting */}
                                {!isSelected && !selectionMode && (
                                    <div className="absolute inset-x-4 bottom-4 pt-2 bg-white/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-2 translate-y-2 group-hover:translate-y-0">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleVerify(item.id, 'AVAILABLE');
                                            }}
                                            className="flex-1 h-8 rounded-lg bg-primary text-white font-medium text-xs hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            Verify
                                        </button>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleVerify(item.id, 'DAMAGED'); }}
                                                className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-100 hover:border-red-100 transition-all"
                                                title="Mark Damaged"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleVerify(item.id, 'MAINTENANCE'); }}
                                                className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg border border-gray-100 hover:border-amber-100 transition-all"
                                                title="Send to Maintenance"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="15" cy="12" r="3" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Checkbox overlay */}
                                {selectionMode && (
                                    <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                                        <div className={`
                                            w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200
                                            ${isSelected ? 'bg-primary border-primary' : 'bg-white border-gray-300'}
                                        `}>
                                            {isSelected && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
