'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShootForm } from '@/components/ShootForm';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { Shoot, User, Assignment } from '@/types';
import { Button } from '@/components/Button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { formatWhatsAppMessage, openWhatsApp } from '@/lib/whatsapp';
import { format, parseISO } from 'date-fns';
import { generateUUID } from '@/lib/id';

export default function NewShootPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        loadUsers();
        if (user && user.role !== 'ADMIN') {
            router.push('/admin/shoots');
        }
    }, [user, router]);

    const loadUsers = async () => {
        try {
            const data = await storage.getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    };



    const handleSubmit = async (data: Partial<Shoot>, crewIds: string[], inchargeId: string) => {
        setIsLoading(true);
        try {
            const shootId = generateUUID();

            const newShoot: Shoot = {
                ...data as Shoot,
                id: shootId,
                createdBy: user?.name || 'Admin',
            };

            await storage.saveShoot(newShoot);

            // Create assignment records
            const assignments: Assignment[] = crewIds.map(userId => ({
                id: generateUUID(),
                shootId: shootId,
                userId: userId,
                role: userId === inchargeId ? 'Incharge' : (users.find(u => u.id === userId)?.role || 'Crew'),
                status: 'PENDING'
            }));

            if (assignments.length > 0) {
                await storage.saveAssignments(assignments);
            }

            // Log activity
            if (user) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'CREATE',
                    entityId: shootId,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Created shoot "${newShoot.title}"`
                });
            }

            // No auto-redirect to WhatsApp
            // Redirect to the new shoot details page
            router.push(`/admin/shoots/${shootId}`);
        } catch (error) {
            console.error('Failed to create shoot:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="px-3 pb-3 pt-1 sm:px-6 sm:pb-6 space-y-4 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3">
                <Link href="/admin/shoots">
                    <Button variant="ghost" size="icon" className="rounded-full">
                        <ArrowLeft size={20} />
                    </Button>
                </Link>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">New Shoot</h1>
            </div>

            <div className="w-full">
                <ShootForm
                    users={users}
                    onSubmit={handleSubmit}
                    isLoading={isLoading}
                    buttonLabel="Create Shoot"
                />
            </div>
        </div>
    );
}
