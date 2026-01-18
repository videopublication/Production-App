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

export default function NewShootPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await storage.getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    };



    const handleSubmit = async (data: Partial<Shoot>, crewIds: string[], inchargeId: string, shareOnWhatsApp = false) => {
        setIsLoading(true);
        try {
            const shootId = crypto.randomUUID();

            const newShoot: Shoot = {
                ...data as Shoot,
                id: shootId,
                createdBy: user?.name || 'Admin',
            };

            await storage.saveShoot(newShoot);

            // Create assignment records
            const assignments: Assignment[] = crewIds.map(userId => ({
                id: crypto.randomUUID(),
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
                    id: crypto.randomUUID(),
                    action: 'CREATE',
                    entityId: shootId,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Created shoot "${newShoot.title}"`
                });
            }

            if (shareOnWhatsApp) {
                const message = formatWhatsAppMessage(newShoot, assignments, users);
                openWhatsApp(message);
            }

            router.push('/admin/shoots');
        } catch (error) {
            console.error('Failed to create shoot:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/shoots">
                    <Button variant="ghost" size="icon" className="rounded-full">
                        <ArrowLeft size={20} />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold text-[#1d1d1f]">New Shoot</h1>
            </div>

            <div className="flex gap-3">
                <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                        const formElement = document.querySelector('form');
                        if (formElement) formElement.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    }}
                >
                    Create Shoot Only
                </Button>
                <ShootForm
                    users={users}
                    onSubmit={(data, crewIds, inchargeId) => handleSubmit(data, crewIds, inchargeId, true)}
                    isLoading={isLoading}
                    buttonLabel="Create & Share on WhatsApp"
                />
            </div>
        </div>
    );
}
