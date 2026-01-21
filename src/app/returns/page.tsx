'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Condition } from '@/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { useEquipment, useUpdateEquipment } from '@/hooks/useEquipment';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function ReturnsPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { data: allItems = [], isLoading: isInventoryLoading } = useEquipment();
    const { mutateAsync: updateEquipment } = useUpdateEquipment();
    const { showToast } = useToast();
    const isOnline = useOnlineStatus();

    // Derive checked out items from cached inventory
    const checkedOutItems = React.useMemo(() => {
        if (!user || !allItems) return [];
        return allItems.filter(i => i.status === 'CHECKED_OUT' && i.assignedTo === user.id);
    }, [user, allItems]);

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [conditions, setConditions] = useState<Record<string, Condition>>({});

    useEffect(() => {
        if (authLoading) return;

        if (!user) router.push('/login');
    }, [user, router, authLoading]);

    if (authLoading || isInventoryLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const toggleSelection = (id: string) => {
        if (selectedItems.includes(id)) {
            setSelectedItems(selectedItems.filter(i => i !== id));
            const newConditions = { ...conditions };
            delete newConditions[id];
            setConditions(newConditions);
        } else {
            setSelectedItems([...selectedItems, id]);
            setConditions({ ...conditions, [id]: 'OK' });
        }
    };

    const handleConditionChange = (id: string, condition: Condition) => {
        setConditions({ ...conditions, [id]: condition });
    };

    const handleSubmitReturn = async () => {
        if (selectedItems.length === 0) return;

        if (!isOnline) {
            showToast('You are offline. Please connect to the internet to return items.', 'error');
            return;
        }

        try {
            await Promise.all(selectedItems.map(async (id) => {
                await updateEquipment({
                    id,
                    updates: {
                        status: 'PENDING_VERIFICATION',
                        condition: conditions[id]
                    }
                });

                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'RETURN',
                        entityId: id,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Submitted for return (Condition: ${conditions[id] || 'OK'})`
                    });
                }
            }));

            // Send Push Notification to Managers
            try {
                const allUsers = await storage.getUsers();
                const managers = allUsers.filter(u =>
                    (u.role === 'MANAGER' || u.role === 'ADMIN') && u.fcmToken
                );

                if (managers.length > 0) {
                    const tokens = managers.map(m => m.fcmToken).filter(Boolean) as string[];
                    await Promise.all(tokens.map(token =>
                        fetch('/api/send-notification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                token,
                                title: 'Items Returned',
                                message: `${user?.name || 'A user'} has returned ${selectedItems.length} items. Verification required.`,
                                link: '/verification'
                            })
                        })
                    ));
                }
            } catch (e) {
                console.error("Failed to send notifications", e);
            }

            showToast('Items submitted for verification', 'success');
            setSelectedItems([]);
            setConditions({});
        } catch (error) {
            console.error('Submit return failed:', error);
            showToast('Failed to return items. Please check your connection and try again.', 'error');
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Returns</h1>
                <Button
                    onClick={handleSubmitReturn}
                    disabled={selectedItems.length === 0 || !isOnline}
                    className="w-full sm:w-auto"
                    size="sm"
                >
                    {!isOnline ? 'Offline' : `Return Selected (${selectedItems.length})`}
                </Button>
            </div>

            {!isOnline && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800 animate-in slide-in-from-top-2">
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm font-medium">
                        You are currently offline. Please connect to the internet to submit returns.
                    </p>
                </div>
            )}

            {checkedOutItems.length === 0 ? (
                <div className="text-center py-10 sm:py-12 border-2 border-dashed border-border rounded-lg text-muted-foreground text-sm">
                    You have no items to return.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                    {checkedOutItems.map((item) => (
                        <Card
                            key={item.id}
                            className={`cursor-pointer transition-all ${selectedItems.includes(item.id) ? 'ring-2 ring-primary border-transparent' : ''}`}
                        >
                            <div className="flex items-start justify-between mb-3 sm:mb-4" onClick={() => toggleSelection(item.id)}>
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-base sm:text-lg truncate">{item.name}</h3>
                                    <p className="text-xs sm:text-sm text-muted-foreground truncate">{item.barcode}</p>
                                </div>
                                <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 ${selectedItems.includes(item.id) ? 'border-primary bg-primary text-white' : 'border-muted'}`}>
                                    {selectedItems.includes(item.id) && (
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            {selectedItems.includes(item.id) && (
                                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border space-y-1.5 sm:space-y-2">
                                    <label className="text-xs sm:text-sm font-medium">Return Condition:</label>
                                    <select
                                        className="w-full h-9 sm:h-10 rounded-md border border-input bg-transparent px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        value={conditions[item.id] || 'OK'}
                                        onChange={(e) => handleConditionChange(item.id, e.target.value as Condition)}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <option value="OK">OK</option>
                                        <option value="SCRATCHES">Scratches</option>
                                        <option value="NOT_FUNCTIONING">Not Functioning</option>
                                        <option value="NEEDS_BATTERY">Needs Battery</option>
                                        <option value="LOOSE_MOUNT">Loose Mount</option>
                                        <option value="DAMAGED">Damaged</option>
                                    </select>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
