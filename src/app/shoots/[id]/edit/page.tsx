'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ShootForm } from '@/components/ShootForm';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/hooks/useUsers';
import { useShoot } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { Shoot, Assignment, PlannerDraftAssignment, AssignmentSegment } from '@/types';
import { generateUUID } from '@/lib/id';
import { format, parseISO } from 'date-fns';
import { sendPushNotification } from '@/lib/push-notifications';
import { getRoleLabel } from '@/lib/roles';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function EditShootPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { department, allDepartments } = useDepartment();
    const params = useParams();
    const searchParams = useSearchParams();
    const id = params?.id as string;
    const returnTo = searchParams.get('returnTo');
    const safeReturnTo = returnTo?.startsWith('/') ? returnTo : null;
    const queryClient = useQueryClient();

    const { data: shoot, isLoading: isShootLoading } = useShoot(id);
    const { data: allUsers = [] } = useUsers();
    const { data: allAssignments = [] } = useAssignments();
    const pageDepartment = allDepartments.find(dept => dept.id === shoot?.departmentId) || department;
    const labels = getDepartmentLabels(pageDepartment);

    const [isLoading, setIsLoading] = useState(false);
    const [draftAssignments, setDraftAssignments] = useState<PlannerDraftAssignment[]>([]);

    useEffect(() => {
        if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.push('/shoots');
        }
    }, [user, router]);

    useEffect(() => {
        if (!shoot) return;

        storage.getPlannerDraftAssignments(shoot.departmentId)
            .then(drafts => setDraftAssignments(drafts.filter(draft => draft.shootId === shoot.id)))
            .catch(error => {
                console.error('Failed to load draft assignments:', error);
                setDraftAssignments([]);
            });
    }, [shoot]);

    const isSubmittingRef = React.useRef(false);
    const getShootDetailsHref = (shootId: string) =>
        safeReturnTo ? `/shoots/${shootId}?returnTo=${encodeURIComponent(safeReturnTo)}` : `/shoots/${shootId}`;

    const handleSubmit = async (data: Partial<Shoot>, crewIds: string[], inchargeId: string) => {
        if (!shoot || isSubmittingRef.current || isLoading) return;

        // Guard: Cannot set status to Ready for Shoot without assigned cameramen / crew
        if ((data.status === 'READY_FOR_SHOOT' || data.status === 'CONFIRMED') && crewIds.length === 0) {
            alert('Please assign cameramen / crew before setting status to Ready for Shoot.');
            return;
        }

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
            const currentDraftAssignments = draftAssignments.filter(a => a.shootId === shoot.id);

            if (updatedShoot.status === 'DRAFT') {
                const toRemoveLive = currentAssignments;
                if (toRemoveLive.length > 0) {
                    await storage.deleteAssignmentSegmentsByAssignmentIds(toRemoveLive.map(a => a.id));
                    await Promise.all(toRemoveLive.map(a => storage.deleteAssignment(a.id)));
                }

                const selectedCrew = new Set(crewIds);
                const draftIdsToRemove = currentDraftAssignments
                    .filter(a => !selectedCrew.has(a.userId))
                    .map(a => a.id);

                if (draftIdsToRemove.length > 0) {
                    await storage.deletePlannerDraftAssignments(draftIdsToRemove);
                }

                const draftsToSave: PlannerDraftAssignment[] = crewIds.map(userId => {
                    const existing = currentDraftAssignments.find(a => a.userId === userId);
                    return {
                        id: existing?.id || generateUUID(),
                        shootId: shoot.id,
                        userId,
                        role: userId === inchargeId ? 'Incharge' : (allUsers.find(u => u.id === userId)?.role || 'Crew'),
                        createdBy: existing?.createdBy || user?.id,
                        createdAt: existing?.createdAt || new Date().toISOString(),
                        departmentId: shoot.departmentId
                    };
                });

                if (draftsToSave.length > 0) {
                    await storage.savePlannerDraftAssignments(draftsToSave);
                }

                if (user) {
                    await storage.addLog({
                        id: generateUUID(),
                        action: 'EDIT',
                        entityId: shoot.id,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Updated draft ${labels.workLower} details`,
                        departmentId: shoot.departmentId
                    });
                }

                await queryClient.invalidateQueries({ queryKey: ['shoots'] });
                await queryClient.invalidateQueries({ queryKey: ['assignments'] });
                router.push(getShootDetailsHref(shoot.id));
                return;
            }

            // Update Assignments
            // 1. Find removed assignments
            const existingCrewIds = currentAssignments.map(a => a.userId);
            const toRemove = currentAssignments.filter(a => !crewIds.includes(a.userId));
            if (toRemove.length > 0) {
                await storage.deleteAssignmentSegmentsByAssignmentIds(toRemove.map(a => a.id));
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
                const assignmentSegments: AssignmentSegment[] = newAssignments
                    .filter(() => !!updatedShoot.startTime && !!updatedShoot.endTime)
                    .map(assignment => ({
                        id: generateUUID(),
                        assignmentId: assignment.id,
                        shootId: shoot.id,
                        userId: assignment.userId,
                        startTime: updatedShoot.startTime,
                        endTime: updatedShoot.endTime!,
                        role: assignment.role,
                        createdBy: user?.id,
                        createdAt: new Date().toISOString(),
                        departmentId: shoot.departmentId
                    }));
                await storage.saveAssignmentSegments(assignmentSegments);

                // Notify newly added crew
                await Promise.all(newAssignments.map(async (assignment) => {
                    if (assignment.userId === user?.id) return;
                    
                    const title = `New ${labels.workSingular} Assignment`;
                    const message = `You have been added to ${labels.workLower} "${updatedShoot.title}" as ${getRoleLabel(assignment.role)}.`;
                    
                    await storage.addNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shoot.id}`,
                        departmentId: shoot.departmentId
                    });

                    sendPushNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shoot.id}`
                    }).catch(e => console.error('Push notification failed', e));
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
                    
                    const title = `${labels.workSingular} Role Updated`;
                    const message = `Your role in ${labels.workLower} "${updatedShoot.title}" has been updated to ${getRoleLabel(assignment.role)}.`;
                    
                    await storage.addNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shoot.id}`,
                        departmentId: shoot.departmentId
                    });

                    sendPushNotification({
                        userId: assignment.userId,
                        title,
                        message,
                        link: `/shoots/${shoot.id}`
                    }).catch(e => console.error('Push notification failed', e));
                }));
            }

            if (currentDraftAssignments.length > 0) {
                await storage.deletePlannerDraftAssignments(currentDraftAssignments.map(a => a.id));
            }

            // Synchronize any linked open transactions with the updated shoot crew
            try {
                const linkedTxns = await storage.getTransactions(undefined, undefined, undefined, 'OPEN', undefined, undefined, shoot.departmentId);
                const shootTxns = linkedTxns.filter(t => t.shootId === shoot.id);
                for (const t of shootTxns) {
                    const primaryUserId = inchargeId || (crewIds.length > 0 ? crewIds[0] : t.userId);
                    const additionalUsers = crewIds.filter(id => id !== primaryUserId);
                    await storage.updateTransaction(t.id, {
                        userId: primaryUserId,
                        additionalUsers: additionalUsers,
                        project: updatedShoot.title || t.project
                    });
                }
                await queryClient.invalidateQueries({ queryKey: ['transactions'] });
            } catch (syncTxnErr) {
                console.warn('Failed to sync linked transaction crew:', syncTxnErr);
            }

            if (shoot.jiraTicketId && updatedShoot.status && updatedShoot.status !== shoot.status) {
                fetch('/api/jira/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketKey: shoot.jiraTicketId, status: updatedShoot.status })
                }).catch(err => console.debug('[Jira Status Sync]:', err));

                if (updatedShoot.status === 'READY_FOR_SHOOT' || updatedShoot.status === 'CONFIRMED') {
                    const assignedUsers = crewIds
                        .map(uid => allUsers.find(u => u.id === uid))
                        .filter((u): u is typeof allUsers[0] => Boolean(u));

                    if (assignedUsers.length > 0) {
                        const crewText = assignedUsers
                            .map(u => u.phone ? `${u.name}-${u.phone}` : u.name)
                            .join(', ');

                        const deptTitle = pageDepartment?.name
                            ? (pageDepartment.name === 'Video Publication' ? 'Video Publications' : pageDepartment.name)
                            : 'Video Publications';

                        const autoCommentBody = `Namaskaram\n\nPlease find the cameramen for this shoot & their contact numbers below\n${crewText}\n\nPranam\n${deptTitle}`;

                        fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}/comments`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                body: autoCommentBody,
                                isInternal: false,
                                authorName: user?.name || 'System'
                            })
                        }).catch(err => console.error('[Jira Auto Comment Error]:', err));
                    }
                }
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
                    ? `Updated ${labels.workLower}${updatedShoot.shootNumber ? ` #${updatedShoot.shootNumber}` : ''}: ${changes.join(', ')}`
                    : `Updated ${labels.workLower} details`;

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

            router.push(getShootDetailsHref(shoot.id));
        } catch (error) {
            console.error(`Failed to update ${labels.workLower}:`, error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isShootLoading) {
        return <div className="p-6">Loading...</div>;
    }

    if (!shoot) return null;

    const liveShootAssignments = allAssignments.filter(a => a.shootId === shoot.id);
    const initialShootAssignments = shoot.status === 'DRAFT' ? draftAssignments : liveShootAssignments;
    const currentCrewIds = initialShootAssignments.map(a => a.userId);
    const currentInchargeId = initialShootAssignments.find(a => a.role === 'Incharge')?.userId;

    return (
        <div className="px-2 pb-3 pt-1 sm:px-6 sm:pb-6 space-y-4 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    Edit {labels.workSingular} {shoot?.shootNumber ? <span className="text-gray-500 dark:text-gray-400">#{shoot.shootNumber}</span> : ''}
                </h1>
            </div>

            <ShootForm
                key={`${shoot.id}-${shoot.status}-${currentCrewIds.join(',')}-${currentInchargeId || ''}`}
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
