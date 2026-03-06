'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Equipment } from '@/types';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';

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
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        location: '',
        brand: '',
        model: '',
        serialNumber: '',
    });

    const generateId = () => {
        const prefix = formData.category.substring(0, 3).toUpperCase() || 'EQP';
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `${prefix}-${random}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLoading) return;

        setIsLoading(true);

        try {
            const id = crypto.randomUUID();
            const barcode = generateId();

            const newItem: Equipment = {
                id,
                name: formData.name,
                category: formData.category,
                barcode,
                status: 'AVAILABLE',
                location: formData.location,
                condition: 'OK',
                metadata: {
                    brand: formData.brand,
                    model: formData.model,
                    serialNumber: formData.serialNumber,
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
                        <Input
                            label="Equipment Name"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Sony A7S III"
                        />
                        <Input
                            label="Category"
                            required
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                            placeholder="e.g. Camera"
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
                        <Input
                            label="Model"
                            value={formData.model}
                            onChange={e => setFormData({ ...formData, model: e.target.value })}
                            placeholder="e.g. ILCE-7SM3"
                        />
                        <Input
                            label="Serial Number"
                            value={formData.serialNumber}
                            onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                            placeholder="Optional"
                        />
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
