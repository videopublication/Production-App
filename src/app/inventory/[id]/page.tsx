'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Equipment, EquipmentStatus, Condition } from '@/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { useAuth } from '@/lib/auth';
import QRCode from 'qrcode';
import Image from 'next/image';
import jsPDF from 'jspdf';

import { useEquipmentItem, useUpdateEquipment } from '@/hooks/useEquipment';
import { useUsers } from '@/hooks/useUsers';

export default function ItemDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();

    const id = params?.id as string;
    const { data: item, isLoading } = useEquipmentItem(id);
    const { mutateAsync: updateEquipment } = useUpdateEquipment();
    const { data: users = [] } = useUsers();

    const [qrCode, setQrCode] = useState<string>('');
    const [assignedUser, setAssignedUser] = useState<string>('');

    // Management state
    const [isEditing, setIsEditing] = useState(false);
    const [editStatus, setEditStatus] = useState<EquipmentStatus>('AVAILABLE');
    const [editCondition, setEditCondition] = useState<Condition>('OK');
    const [editLocation, setEditLocation] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        if (item) {
            // Initialize edit fields
            setEditStatus(item.status);
            setEditCondition(item.condition);
            setEditLocation(item.location);

            // QR & Assigned User Logic
            const generateQR = async () => {
                try {
                    const data = JSON.stringify({ id: item.id, barcode: item.barcode });
                    const QRCode = (await import('qrcode')).default;
                    const url = await QRCode.toDataURL(data, { width: 300 });
                    setQrCode(url);
                } catch (err) {
                    console.error(err);
                }
            };
            generateQR();

            if (item.assignedTo) {
                const foundUser = users.find(u => u.id === item.assignedTo);
                setAssignedUser(foundUser ? foundUser.name : item.assignedTo);
            }
        }
    }, [item, users]);

    // Check if current user can manage equipment
    const canManage = user && (user.role === 'MANAGER' || user.role === 'ADMIN');

    // Handle save changes
    // Handle save changes
    const handleSaveChanges = async () => {
        if (!item || !canManage) return;

        setIsSaving(true);
        try {
            const updates = {
                status: editStatus,
                condition: editCondition,
                location: editLocation,
                // Clear assignedTo if status is AVAILABLE
                assignedTo: editStatus === 'AVAILABLE' ? null as any : item.assignedTo,
            };

            await updateEquipment({ id: item.id, updates });

            // Log update
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: item.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Updated item "${item.name}" (${item.barcode}). Status: ${editStatus}, Condition: ${editCondition}`
            });

            setIsEditing(false);
            setSaveMessage('Changes saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error('Failed to save:', err);
            setSaveMessage('Failed to save changes');
            setTimeout(() => setSaveMessage(''), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    // Cancel editing
    const handleCancelEdit = () => {
        if (item) {
            setEditStatus(item.status);
            setEditCondition(item.condition);
            setEditLocation(item.location);
        }
        setIsEditing(false);
    };

    const downloadLabel = () => {
        if (!item || !qrCode) return;

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: [50, 30] // 50mm x 30mm label
        });

        doc.addImage(qrCode, 'PNG', 2, 2, 26, 26);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(item.barcode, 30, 8);

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        const nameLines = doc.splitTextToSize(item.name, 18);
        doc.text(nameLines, 30, 12);

        doc.text(item.category, 30, 20);

        doc.save(`${item.barcode}-label.pdf`);
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'AVAILABLE': return 'success';
            case 'CHECKED_OUT': return 'orange';
            case 'PENDING_VERIFICATION': return 'warning';
            case 'DAMAGED': return 'destructive';
            case 'LOST': return 'destructive';
            case 'MAINTENANCE': return 'destructive';
            default: return 'default';
        }
    };

    if (!item) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            {/* Header Section - Clean Mobile Layout */}
            <div className="space-y-4">
                {/* Top Row: Back Button + Print Label */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span className="hidden sm:inline">Inventory</span>
                    </button>
                    <button
                        onClick={downloadLabel}
                        className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print QR
                    </button>
                </div>

                {/* Hero Section: Equipment Name + Status */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-border/30">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
                                {item.name}
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                {item.category} • {item.barcode}
                            </p>
                        </div>
                        <Badge variant={getStatusVariant(item.status) as any} className="shrink-0 text-xs font-semibold px-2.5 py-1">
                            {item.status.replace('_', ' ')}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <Card>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Item Details
                            </h3>
                            {/* Edit/Save buttons for managers/admins */}
                            {canManage && (
                                <div className="flex gap-2">
                                    {!isEditing ? (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Edit
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleCancelEdit}
                                                disabled={isSaving}
                                                className="text-sm text-muted-foreground hover:text-foreground font-medium"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveChanges}
                                                disabled={isSaving}
                                                className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                                            >
                                                {isSaving ? (
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                                Save
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Success/Error Message */}
                        {saveMessage && (
                            <div className={`mb-4 p-2 rounded-lg text-sm font-medium ${saveMessage.includes('success') ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                {saveMessage}
                            </div>
                        )}

                        <dl className="space-y-5 flex-1">
                            {/* Barcode ID - Not editable */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                    Barcode ID
                                </dt>
                                <dd className="font-mono text-sm bg-background px-2 py-1 rounded border border-border">{item.barcode}</dd>
                            </div>

                            {/* Category - Not editable */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    Category
                                </dt>
                                <dd className="text-sm font-medium">{item.category}</dd>
                            </div>

                            {/* Status - Editable for managers/admins */}
                            {canManage && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Status
                                    </dt>
                                    {isEditing ? (
                                        <select
                                            value={editStatus}
                                            onChange={(e) => setEditStatus(e.target.value as EquipmentStatus)}
                                            className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent"
                                        >
                                            <option value="AVAILABLE">Available</option>
                                            <option value="CHECKED_OUT">Checked Out</option>
                                            <option value="PENDING_VERIFICATION">Pending Verification</option>
                                            <option value="MAINTENANCE">Maintenance</option>
                                            <option value="DAMAGED">Damaged</option>
                                            <option value="LOST">Lost</option>
                                        </select>
                                    ) : (
                                        <Badge variant={getStatusVariant(item.status) as any}>
                                            {item.status.replace('_', ' ')}
                                        </Badge>
                                    )}
                                </div>
                            )}

                            {/* Location - Editable */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Location
                                </dt>
                                {isEditing && canManage ? (
                                    <input
                                        type="text"
                                        value={editLocation}
                                        onChange={(e) => setEditLocation(e.target.value)}
                                        className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-32 text-right"
                                    />
                                ) : (
                                    <dd className="text-sm font-medium">{item.location}</dd>
                                )}
                            </div>

                            {/* Condition - Editable */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Condition
                                </dt>
                                {isEditing && canManage ? (
                                    <select
                                        value={editCondition}
                                        onChange={(e) => setEditCondition(e.target.value as Condition)}
                                        className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent"
                                    >
                                        <option value="OK">OK</option>
                                        <option value="SCRATCHES">Scratches</option>
                                        <option value="NOT_FUNCTIONING">Not Functioning</option>
                                        <option value="NEEDS_BATTERY">Needs Battery</option>
                                        <option value="LOOSE_MOUNT">Loose Mount</option>
                                        <option value="DAMAGED">Damaged</option>
                                    </select>
                                ) : (
                                    <dd className="text-sm font-medium">{item.condition.replace('_', ' ')}</dd>
                                )}
                            </div>

                            {item.metadata?.brand && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground">Brand</dt>
                                    <dd className="text-sm font-medium">{item.metadata.brand}</dd>
                                </div>
                            )}
                            {item.metadata?.model && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground">Model</dt>
                                    <dd className="text-sm font-medium">{item.metadata.model}</dd>
                                </div>
                            )}
                        </dl>
                    </Card>

                    {item.status !== 'AVAILABLE' && item.assignedTo && (
                        <Card className="bg-primary/5 border-primary/20">
                            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-primary">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Current Assignment
                            </h3>
                            <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                                    {assignedUser.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Assigned to {assignedUser}</p>
                                    <p className="text-sm text-muted-foreground">Active since {new Date().toLocaleDateString()}</p>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>

                <div className="space-y-6 h-full">
                    <Card className="h-full flex flex-col items-center justify-center p-8">
                        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2 w-full">
                            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            QR Code
                        </h3>
                        <div className="flex flex-col items-center space-y-6 flex-1 justify-center">
                            {qrCode && (
                                <div className="bg-white p-4 rounded-xl shadow-lg shadow-white/5">
                                    <Image src={qrCode} alt="QR Code" width={200} height={200} className="w-auto h-auto" />
                                </div>
                            )}
                            <p className="text-sm text-center text-muted-foreground max-w-xs">
                                Scan this code to quickly access item details or add to checkout.
                            </p>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
