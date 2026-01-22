'use client';

import { format, parseISO } from 'date-fns';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ShootForm } from '@/components/ShootForm';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { Shoot, User, Assignment } from '@/types';
import { Button } from '@/components/Button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EditShootPage() {
    const router = useRouter();
    const { user } = useAuth();
    const params = useParams();
    const id = params?.id as string;

    const [shoot, setShoot] = useState<Shoot | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);

    useEffect(() => {
        if (id) {
            loadData();
        }
    }, [id]);

    const loadData = async () => {
        try {
            const [allShoots, allAssignments, allUsers] = await Promise.all([
                storage.getShoots(),
                storage.getAssignments(),
                storage.getUsers()
            ]);

            const foundShoot = allShoots.find(s => s.id === id || s.shootNumber?.toString() === id);
            if (foundShoot) {
                setShoot(foundShoot);
                // Make sure we filter using the UUID, not the URL param (which might be "23")
                setAssignments(allAssignments.filter(a => a.shootId === foundShoot.id));
                setUsers(allUsers);
            } else {
                router.push('/admin/shoots');
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setIsFetching(false);
        }
    };

    const handleSubmit = async (data: Partial<Shoot>, crewIds: string[], inchargeId: string) => {
        if (!shoot) return;

        setIsLoading(true);
        try {
            // Update Shoot
            const updatedShoot: Shoot = {
                ...shoot,
                ...data,
            };
            await storage.saveShoot(updatedShoot);

            // Update Assignments
            // 1. Find removed assignments
            const existingCrewIds = assignments.map(a => a.userId);
            const toRemove = assignments.filter(a => !crewIds.includes(a.userId));
            if (toRemove.length > 0) {
                await Promise.all(toRemove.map(a => storage.deleteAssignment(a.id)));
            }

            // 2. Add new assignments
            const toAdd = crewIds.filter(uid => !existingCrewIds.includes(uid));
            const newAssignments: Assignment[] = toAdd.map(userId => ({
                id: crypto.randomUUID(),
                shootId: shoot.id, // Use UUID
                userId: userId,
                role: userId === inchargeId ? 'Incharge' : (users.find(u => u.id === userId)?.role || 'Crew'),
                status: 'PENDING'
            }));
            if (newAssignments.length > 0) {
                await storage.saveAssignments(newAssignments);
            }

            // 3. Update existing roles if needed (e.g. if someone became incharge)
            // Getting existing assignments that are still in crewIds
            const keptAssignments = assignments.filter(a => crewIds.includes(a.userId));
            const assignmentsToUpdate: Assignment[] = [];

            keptAssignments.forEach(a => {
                const isNowIncharge = a.userId === inchargeId;
                const wasIncharge = a.role === 'Incharge';

                if (isNowIncharge && !wasIncharge) {
                    assignmentsToUpdate.push({ ...a, role: 'Incharge' });
                } else if (!isNowIncharge && wasIncharge) {
                    // Revert to user role
                    const userRole = users.find(u => u.id === a.userId)?.role || 'Crew';
                    assignmentsToUpdate.push({ ...a, role: userRole });
                }
            });

            if (assignmentsToUpdate.length > 0) {
                await storage.saveAssignments(assignmentsToUpdate);
            }

            // Log activity
            // Log activity: Calculate detailed changes
            const changes: string[] = [];

            // Check for field changes (checking explicit fields we care about)
            if (updatedShoot.title !== shoot.title) changes.push(`title to "${updatedShoot.title}"`);
            if (updatedShoot.location !== shoot.location) changes.push(`location to "${updatedShoot.location}"`);

            // Dates - Check with formatting to handle timezone differences cleanly and log readable values
            if (updatedShoot.startTime) {
                const newStart = format(parseISO(updatedShoot.startTime), 'MMM d, h:mm a');
                const oldStart = shoot.startTime ? format(parseISO(shoot.startTime), 'MMM d, h:mm a') : '';
                if (newStart !== oldStart) changes.push(`start time to "${newStart}"`);
            }
            if (updatedShoot.endTime) {
                const newEnd = format(parseISO(updatedShoot.endTime), 'MMM d, h:mm a');
                const oldEnd = shoot.endTime ? format(parseISO(shoot.endTime), 'MMM d, h:mm a') : '';
                if (newEnd !== oldEnd) changes.push(`end time to "${newEnd}"`);
            }

            // Crew changes
            const addedCrewNames = toAdd.map(id => users.find(u => u.id === id)?.name).filter(Boolean);
            const removedCrewNames = toRemove.map(a => users.find(u => u.id === a.userId)?.name).filter(Boolean);

            if (addedCrewNames.length > 0) changes.push(`added crew: ${addedCrewNames.join(', ')}`);
            if (removedCrewNames.length > 0) changes.push(`removed crew: ${removedCrewNames.join(', ')}`);

            // Incharge change
            if (inchargeId !== (assignments.find(a => a.role === 'Incharge')?.userId)) {
                const newInchargeName = users.find(u => u.id === inchargeId)?.name;
                if (newInchargeName) changes.push(`set incharge to ${newInchargeName}`);
                else if (!inchargeId) changes.push('removed incharge');
            }

            const details = changes.length > 0
                ? `Updated shoot${updatedShoot.shootNumber ? ` #${updatedShoot.shootNumber}` : ''}: ${changes.join(', ')}`
                : 'Updated shoot details';

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id, // Use UUID
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: details
                });
            }

            router.push(`/admin/shoots/${shoot.id}`);
        } catch (error) {
            console.error('Failed to update shoot:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isFetching) {
        return <div className="p-6">Loading...</div>;
    }

    if (!shoot) return null;

    // Derived initial states
    const currentCrewIds = assignments.map(a => a.userId);
    const currentInchargeId = assignments.find(a => a.role === 'Incharge')?.userId;

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Link href={`/admin/shoots/${id}`}>
                    <Button variant="ghost" size="icon" className="rounded-full">
                        <ArrowLeft size={20} />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold text-[#1d1d1f]">
                    Edit Shoot {shoot?.shootNumber ? <span className="text-gray-500">#{shoot.shootNumber}</span> : ''}
                </h1>
            </div>

            <ShootForm
                initialData={shoot}
                initialCrewIds={currentCrewIds}
                initialInchargeId={currentInchargeId}
                users={users}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                buttonLabel="Save Changes"
            />
        </div>
    );
}
