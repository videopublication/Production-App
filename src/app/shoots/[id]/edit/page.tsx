'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ShootForm } from '@/components/ShootForm';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/hooks/useUsers';
import { useShoot } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { Shoot, Assignment } from '@/types';
import { generateUUID } from '@/lib/id';
import { format, parseISO } from 'date-fns';
import { sendPushNotification } from '@/lib/push-notifications';

export default function EditShootPage() {
    const router = useRouter();
    const { user } = useAuth();
    const params = useParams();
    const id = params?.id as string;
    const queryClient = useQueryClient();

    const { data: shoot, isLoading: isShootLoading } = useShoot(id);
    const { data: allUsers = [] } = useUsers();
    const { data: allAssignments = [] } = useAssignments();

    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.push('/shoots');
        }
    }, [user, router]);

    const isSubmittingRef = React.useRef(false);

    const handleSubmit = async (data: Partial<Shoot>, crewIds: string[], inchargeId: string) => {
        if (!shoot || isSubmittingRef.current || isLoading) return;

        isSubmittingRef.current = true;
        setIsLoading(true);
        try {
            // Update Shoot
            const updatedShoot: Shoot = {
                ...shoot,
                ...data,
            };
            await storage.saveShoot(updatedShoot);

            // Current assignments for THIS shoot
            const currentAssignments = allAssignments.filter(a => a.shootId === shoot.id);

            // Update Assignments
            // 1. Find removed assignments
            const existingCrewIds = currentAssignments.map(a => a.userId);
            const toRemove = currentAssignments.filter(a => !crewIds.includes(a.userId));
            if (toRemove.length > 0) {
                await Promise.all(toRemove.map(a => storage.deleteAssignment(a.id)));
            }

            // 2. Add new assignments
            const toAdd = crewIds.filter(uid => !existingCrewIds.includes(uid));
            const newAssignments: Assignment[] = toAdd.map(userId => ({
                id: generateUUID(),
                shootId: shoot.id,
                userId: userId,
                role: userId === inchargeId ? 'Incharge' : (allUsers.find(u => u.id === userId)?.role || 'Crew'),
                status: 'PENDING',
                departmentId: shoot.departmentId
            }));
            if (newAssignments.length > 0) {
                await storage.saveAssignments(newAssignments);

                // Notify newly added crew
                await Promise.all(newAssignments.map(async (assignment) => {
                    if (assignment.userId === user?.id) return;
                    
                    const title = 'New Shoot Assignment';
                    const message = `You have been added to shoot "${updatedShoot.title}" as ${assignment.role}.`;
                    
                    await storage.addNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shoot.id}`,
                        departmentId: shoot.departmentId
                    });

                    const assignedUser = allUsers.find(u => u.id === assignment.userId);
                    if (assignedUser?.fcmToken) {
                        sendPushNotification({
                            token: assignedUser.fcmToken,
                            title,
                            message,
                            link: `/shoots/${shoot.id}`
                        }).catch(e => console.error('Push notification failed', e));
                    }
                }));
            }

            // 3. Update existing roles if needed (e.g. if someone became incharge)
            const keptAssignments = currentAssignments.filter(a => crewIds.includes(a.userId));
            const assignmentsToUpdate: Assignment[] = [];

            keptAssignments.forEach(a => {
                const isNowIncharge = a.userId === inchargeId;
                const wasIncharge = a.role === 'Incharge';

                if (isNowIncharge && !wasIncharge) {
                    assignmentsToUpdate.push({ ...a, role: 'Incharge' });
                } else if (!isNowIncharge && wasIncharge) {
                    const userRole = allUsers.find(u => u.id === a.userId)?.role || 'Crew';
                    assignmentsToUpdate.push({ ...a, role: userRole });
                }
            });

            if (assignmentsToUpdate.length > 0) {
                await storage.saveAssignments(assignmentsToUpdate);

                // Notify crew of role changes
                await Promise.all(assignmentsToUpdate.map(async (assignment) => {
                    if (assignment.userId === user?.id) return;
                    
                    const title = 'Shoot Role Updated';
                    const message = `Your role in shoot "${updatedShoot.title}" has been updated to ${assignment.role}.`;
                    
                    await storage.addNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shoot.id}`,
                        departmentId: shoot.departmentId
                    });

                    const assignedUser = allUsers.find(u => u.id === assignment.userId);
                    if (assignedUser?.fcmToken) {
                        sendPushNotification({
                            token: assignedUser.fcmToken,
                            title,
                            message,
                            link: `/shoots/${shoot.id}`
                        }).catch(e => console.error('Push notification failed', e));
                    }
                }));
            }

            try {
                // Log activity
                const changes: string[] = [];
                if (updatedShoot.title !== shoot.title) changes.push(`title to "${updatedShoot.title}"`);
                if (updatedShoot.location !== shoot.location) changes.push(`location to "${updatedShoot.location}"`);

                if (updatedShoot.startTime) {
                    const newStart = format(parseISO(updatedShoot.startTime), 'MMM d, h:mm a');
                    const oldStart = shoot.startTime ? format(parseISO(shoot.startTime), 'MMM d, h:mm a') : '';
                    if (newStart !== oldStart) changes.push(`start time to "${newStart}"`);
                }

                const details = changes.length > 0
                    ? `Updated shoot${updatedShoot.shootNumber ? ` #${updatedShoot.shootNumber}` : ''}: ${changes.join(', ')}`
                    : 'Updated shoot details';

                if (user) {
                    await storage.addLog({
                        id: generateUUID(),
                        action: 'EDIT',
                        entityId: shoot.id,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: details,
                        departmentId: shoot.departmentId
                    });
                }

                await queryClient.invalidateQueries({ queryKey: ['shoots'] });
                await queryClient.invalidateQueries({ queryKey: ['assignments'] });
            } catch (nonCriticalError) {
                console.warn('Non-critical error during post-save operations:', nonCriticalError);
            }

            router.push(`/shoots/${shoot.id}`);
        } catch (error) {
            console.error('Failed to update shoot:', error);
            isSubmittingRef.current = false;
        } finally {
            setIsLoading(false);
        }
    };

    if (isShootLoading) {
        return <div className="p-6">Loading...</div>;
    }

    if (!shoot) return null;

    const currentCrewIds = allAssignments.filter(a => a.shootId === shoot.id).map(a => a.userId);
    const currentInchargeId = allAssignments.find(a => a.shootId === shoot.id && a.role === 'Incharge')?.userId;

    return (
        <div className="px-2 pb-3 pt-1 sm:px-6 sm:pb-6 space-y-4 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    Edit Shoot {shoot?.shootNumber ? <span className="text-gray-500 dark:text-gray-400">#{shoot.shootNumber}</span> : ''}
                </h1>
            </div>

            <ShootForm
                initialData={shoot}
                initialCrewIds={currentCrewIds}
                initialInchargeId={currentInchargeId}
                users={allUsers}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                buttonLabel="Save Changes"
            />
        </div>
    );
}
