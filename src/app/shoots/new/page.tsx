'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShootForm } from '@/components/ShootForm';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/hooks/useUsers';
import { Shoot, Assignment } from '@/types';
import { generateUUID } from '@/lib/id';
import { useDepartment } from '@/lib/department-context';
import { sendPushNotification } from '@/lib/push-notifications';
import { getRoleLabel } from '@/lib/roles';

export default function NewShootPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const { department } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;
    const { data: users = [] } = useUsers();
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.push('/shoots');
        }
    }, [user, router]);

    // Get date from query params (if any) - from Calendar
    const dateParam = searchParams.get('date');
    const initialData: Partial<Shoot> = {};

    if (dateParam) {
        // Default to 10:00 AM on the selected date to ensure it lands on the correct day in all timezones
        initialData.startTime = `${dateParam}T10:00:00`;
    }

    const isSubmittingRef = React.useRef(false);

    const handleSubmit = async (data: Partial<Shoot>, crewIds: string[], inchargeId: string) => {
        if (isSubmittingRef.current || isLoading) return;

        isSubmittingRef.current = true;
        setIsLoading(true);
        try {
            const shootId = generateUUID();

            const newShoot: Shoot = {
                ...data as Shoot,
                id: shootId,
                createdBy: user?.id || '',
                departmentId: activeDepartmentId || undefined,
            };

            await storage.saveShoot(newShoot);

            // Create assignment records
            const assignments: Assignment[] = crewIds.map(userId => ({
                id: generateUUID(),
                shootId: shootId,
                userId: userId,
                role: userId === inchargeId ? 'Incharge' : (users.find(u => u.id === userId)?.role || 'Crew'),
                status: 'PENDING',
                departmentId: activeDepartmentId || undefined
            }));

            if (assignments.length > 0) {
                await storage.saveAssignments(assignments);

                // Send notifications to assigned crew
                await Promise.all(assignments.map(async (assignment) => {
                    // Don't notify the person creating the shoot about their own assignment
                    if (assignment.userId === user?.id) return;
                    
                    const title = 'New Shoot Assignment';
                    const message = `You have been assigned to shoot "${newShoot.title}" as ${getRoleLabel(assignment.role)}.`;
                    
                    await storage.addNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shootId}`,
                        departmentId: activeDepartmentId || undefined
                    });

                    sendPushNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shootId}`
                    }).catch(e => console.error('Push notification failed', e));
                }));
            }

            try {
                // Log activity
                if (user) {
                    await storage.addLog({
                        id: generateUUID(),
                        action: 'CREATE',
                        entityId: shootId,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Created shoot "${newShoot.title}"`,
                        departmentId: activeDepartmentId || undefined
                    });
                }
            } catch (nonCriticalError) {
                console.warn('Non-critical error during post-create operations:', nonCriticalError);
            }

            // Redirect to the new shoot details page
            router.push(`/shoots/${shootId}`);
        } catch (error) {
            console.error('Failed to create shoot:', error);
            isSubmittingRef.current = false;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="px-2 pb-3 pt-1 sm:px-6 sm:pb-6 space-y-4 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">New Shoot</h1>
            </div>

            <div className="w-full">
                <ShootForm
                    users={users}
                    initialData={initialData}
                    onSubmit={handleSubmit}
                    isLoading={isLoading}
                    buttonLabel="Create Shoot"
                />
            </div>
        </div>
    );
}
