'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Equipment } from '@/types';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { getNextEquipmentBarcode } from '@/lib/equipment-barcodes';
import { isConnectorCategory, buildConnectorName, buildConnectorCode, EndGender } from '@/lib/connectors';

export default function AddItemPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { department } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    useEffect(() => {
        if (user && !['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.replace('/inventory');
        }
    }, [user, router]);
    const [isLoading, setIsLoading] = useState(false);
    const [existingItems, setExistingItems] = useState<Equipment[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        location: '',
        brand: '',
        model: '',
        size: '',
        serialNumber: '',
        endA: '',
        endAGender: '' as EndGender,
        endB: '',
        endBGender: '' as EndGender,
    });

    // Load current stock so we can live-preview the auto barcode.
    useEffect(() => {
        let cancelled = false;
        storage.getEquipment(activeDepartmentId).then(list => { if (!cancelled) setExistingItems(list); }).catch(() => {});
        return () => { cancelled = true; };
    }, [activeDepartmentId]);

    const isConn = isConnectorCategory(formData.category);
    // For connectors, Name + Model are derived from the two ends.
    const connName = buildConnectorName(formData.endA, formData.endAGender, formData.endB, formData.endBGender);
    const connCode = buildConnectorCode(formData.endA, formData.endAGender, formData.endB, formData.endBGender);
    const effectiveName = isConn ? connName : formData.name;
    const effectiveModel = isConn ? connCode : formData.model;

    // Autocomplete list of connector ends already used.
    const endSuggestions = useMemo(() => {
        const set = new Set<string>();
        for (const it of existingItems) {
            if (it.metadata?.endA) set.add(it.metadata.endA.trim());
            if (it.metadata?.endB) set.add(it.metadata.endB.trim());
        }
        return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
    }, [existingItems]);

    // Barcode that will be assigned on save (auto).
    const previewBarcode = useMemo(() => {
        if (!formData.category.trim()) return '';
        return getNextEquipmentBarcode(
            { category: formData.category, model: effectiveModel, serialNumber: formData.serialNumber },
            existingItems
        );
    }, [formData.category, effectiveModel, formData.serialNumber, existingItems]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLoading) return;
        if (isConn && !connName.trim()) { alert('Add at least one connector end (End A / End B).'); return; }

        setIsLoading(true);

        try {
            const id = crypto.randomUUID();
            const existingList = await storage.getEquipment(activeDepartmentId);
            const barcode = getNextEquipmentBarcode({
                category: formData.category,
                model: effectiveModel || effectiveName,
                serialNumber: formData.serialNumber,
            }, existingList);

            const newItem: Equipment = {
                id,
                name: effectiveName,
                category: formData.category,
                barcode,
                status: 'AVAILABLE',
                location: formData.location,
                condition: 'OK',
                serialNumber: formData.serialNumber || undefined,
                metadata: {
                    brand: formData.brand,
                    model: effectiveModel,
                    size: formData.size || undefined,
                    serialNumber: formData.serialNumber,
                    ...(isConn ? {
                        endA: formData.endA.trim() || undefined,
                        endAGender: formData.endAGender || undefined,
                        endB: formData.endB.trim() || undefined,
                        endBGender: formData.endBGender || undefined,
                    } : {}),
                },
                departmentId: activeDepartmentId || undefined
            };

            await storage.addEquipment(newItem);

            // Log creation
            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'CREATE',
                    entityId: newItem.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Added new equipment: ${newItem.name} (${newItem.barcode})`,
                    departmentId: activeDepartmentId || undefined
                });
            }

            // Generate QR Code (just to verify it works, in real app we might save it or print it)
            const QRCode = (await import('qrcode')).default;
            const qrDataUrl = await QRCode.toDataURL(JSON.stringify({ id, barcode }));
            console.log('Generated QR:', qrDataUrl);

            router.push('/inventory');
        } catch (error) {
            console.error('Failed to add item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Add New Equipment</h1>
                <Button variant="ghost" size="sm" onClick={() => router.back()}>Cancel</Button>
            </div>

            <Card>
                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        {!isConn && (
                            <Input
                                label="Equipment Name"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Sony A7S III"
                            />
                        )}
                        <Input
                            label="Category"
                            required
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                            placeholder="e.g. Camera / Connector / Cable"
                        />
                        <Input
                            label="Location"
                            required
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                            placeholder="e.g. Shelf A"
                        />
                        <Input
                            label="Brand"
                            value={formData.brand}
                            onChange={e => setFormData({ ...formData, brand: e.target.value })}
                            placeholder="e.g. Sony"
                        />
                        {!isConn && (
                            <Input
                                label="Model"
                                value={formData.model}
                                onChange={e => setFormData({ ...formData, model: e.target.value })}
                                placeholder="e.g. ILCE-7SM3"
                            />
                        )}
                        <Input
                            label="Size (optional)"
                            value={formData.size}
                            onChange={e => setFormData({ ...formData, size: e.target.value })}
                            placeholder="e.g. Small / Big / 100Wh"
                        />
                        <Input
                            label="Serial Number"
                            value={formData.serialNumber}
                            onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                            placeholder="Optional"
                        />
                    </div>

                    {/* Connector / cable ends builder — auto-fills Name + Model code */}
                    {isConn && (
                        <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-primary">Connector ends</p>
                            <datalist id="conn-ends">
                                {endSuggestions.map(e => <option key={e} value={e} />)}
                            </datalist>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">End A</label>
                                    <div className="flex gap-2">
                                        <input list="conn-ends" value={formData.endA} onChange={e => setFormData({ ...formData, endA: e.target.value })} placeholder="e.g. XLR"
                                            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
                                        <select value={formData.endAGender} onChange={e => setFormData({ ...formData, endAGender: e.target.value as EndGender })}
                                            className="h-10 w-16 rounded-xl border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary">
                                            <option value="">—</option>
                                            <option value="M">M</option>
                                            <option value="F">F</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">End B</label>
                                    <div className="flex gap-2">
                                        <input list="conn-ends" value={formData.endB} onChange={e => setFormData({ ...formData, endB: e.target.value })} placeholder="e.g. Phono"
                                            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
                                        <select value={formData.endBGender} onChange={e => setFormData({ ...formData, endBGender: e.target.value as EndGender })}
                                            className="h-10 w-16 rounded-xl border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary">
                                            <option value="">—</option>
                                            <option value="M">M</option>
                                            <option value="F">F</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                                <span className="text-muted-foreground">Name: <span className="font-semibold text-foreground">{connName || '—'}</span></span>
                                <span className="text-muted-foreground">Model code: <span className="font-mono font-semibold text-foreground">{connCode || '—'}</span></span>
                            </div>
                        </div>
                    )}

                    {/* Auto barcode preview */}
                    <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Barcode (auto)</span>
                            {previewBarcode ? (
                                <span className="font-mono text-sm font-semibold text-primary">{previewBarcode}</span>
                            ) : (
                                <span className="text-xs text-muted-foreground italic">Pick a category to preview</span>
                            )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Category prefix + model code + next number. Generated automatically on save.</p>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 sm:pt-4">
                        <Button variant="ghost" type="button" onClick={() => router.back()} className="sm:hidden">Cancel</Button>
                        <Button type="submit" isLoading={isLoading} className="w-full sm:w-auto">
                            Add Equipment
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
