'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLeaves } from '@/hooks/useLeaves';
import { useUsers } from '@/hooks/useUsers';
import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useDepartment } from '@/lib/department-context';
import {
    format, parseISO, differenceInCalendarDays,
    isWithinInterval, startOfDay, endOfDay,
    startOfMonth, endOfMonth,
} from 'date-fns';
import {
    Plus, Calendar, Download, Search, ExternalLink, X,
    ChevronRight, AlertTriangle, CheckCircle2, Clock,
    Users, CalendarCheck2, ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/Button';
import { Leave, Shoot } from '@/types';
import { storage } from '@/lib/storage';
import { useToast } from '@/lib/toast-context';
import { AdminLeaveModal } from '@/components/AdminLeaveModal';
import { LeaveDetailDrawer } from '@/components/LeaveDetailDrawer';
import { sendPushNotification } from '@/lib/push-notifications';
import { initials, roleAvatarClass, roleLabel } from '@/lib/user-display';

type LeaveStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

function leaveDays(startDate: string, endDate: string) {
    return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
}

const EMPTY_STATES: Record<LeaveStatus, { title: string; subtitle: string }> = {
    ALL: { title: 'No leave requests', subtitle: 'No leave requests have been submitted yet.' },
    PENDING: { title: "You're all caught up!", subtitle: 'There are no pending leave requests to review.' },
    APPROVED: { title: 'No approved leaves', subtitle: 'No leave requests have been approved yet.' },
    REJECTED: { title: 'No rejected leaves', subtitle: 'No leave requests have been rejected.' },
};

export default function LeavesPage() {
    const { user } = useAuth();
    const { leaves, isLoading, isRefetching, addLeave, updateLeave, deleteLeave, refetch } = useLeaves();
    const { data: users = [] } = useUsers();
    const { data: shoots = [] } = useShoots();
    const { data: assignments = [] } = useAssignments();
    const { department } = useDepartment();
    const { showToast } = useToast();

    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

    const [statusFilter, setStatusFilter] = useState<LeaveStatus>(
        ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '') ? 'PENDING' : 'ALL'
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const monthInputRef = useRef<HTMLInputElement>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

    // Detail Drawer state
    const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);

    // Pull-to-refresh
    const [pullStart, setPullStart] = useState(0);
    const [pullDistance, setPullDistance] = useState(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0) setPullStart(e.touches[0].clientY);
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (pullStart > 0) {
            const distance = e.touches[0].clientY - pullStart;
            if (distance > 0) setPullDistance(Math.min(distance * 0.4, 80));
        }
    };
    const handleTouchEnd = async () => {
        if (pullDistance > 50) {
            setIsRefreshing(true);
            await refetch();
            setIsRefreshing(false);
        }
        setPullStart(0);
        setPullDistance(0);
    };

    // Apply form state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');

    const today = new Date();

    const statsData = useMemo(() => {
        const pending = leaves.filter(l => l.status === 'PENDING').length;
        const onLeaveToday = leaves.filter(l =>
            l.status === 'APPROVED' &&
            isWithinInterval(today, {
                start: startOfDay(parseISO(l.startDate)),
                end: endOfDay(parseISO(l.endDate)),
            })
        ).length;
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);
        const approvedThisMonth = leaves.filter(l =>
            l.status === 'APPROVED' &&
            (isWithinInterval(parseISO(l.startDate), { start: monthStart, end: monthEnd }) ||
                isWithinInterval(parseISO(l.endDate), { start: monthStart, end: monthEnd }))
        ).length;
        return { pending, onLeaveToday, approvedThisMonth };
    }, [leaves]); // eslint-disable-line react-hooks/exhaustive-deps

    const myStats = useMemo(() => {
        if (isAdmin) return null;
        const myLeaves = leaves.filter(l => l.userId === user?.id);
        const yearStart = new Date(today.getFullYear(), 0, 1);
        const daysThisYear = myLeaves
            .filter(l => l.status === 'APPROVED' && parseISO(l.startDate) >= yearStart)
            .reduce((sum, l) => sum + leaveDays(l.startDate, l.endDate), 0);
        const pending = myLeaves.filter(l => l.status === 'PENDING').length;
        return { daysThisYear, pending };
    }, [leaves, user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

    // Shoot conflict calculation helper
    const getShootConflictsForLeave = useMemo(() => {
        return (leave: Leave): Shoot[] => {
            const userAssignments = assignments.filter(
                a => a.userId === leave.userId && a.status !== 'DECLINED'
            );
            if (userAssignments.length === 0) return [];

            const leaveStart = startOfDay(parseISO(leave.startDate));
            const leaveEnd = endOfDay(parseISO(leave.endDate));

            return shoots.filter(s => {
                if (s.status === 'CLOSED' || s.status === 'CANCELLED') return false;
                const hasAssignment = userAssignments.some(a => a.shootId === s.id);
                if (!hasAssignment) return false;

                const shootStart = startOfDay(parseISO(s.startTime));
                const shootEnd = endOfDay(parseISO(s.endTime || s.startTime));
                return shootStart <= leaveEnd && shootEnd >= leaveStart;
            });
        };
    }, [assignments, shoots]);

    const filteredLeaves = useMemo(() => {
        return leaves.filter((leave: Leave) => {
            if (!isAdmin && leave.userId !== user?.id) return false;
            if (statusFilter !== 'ALL' && leave.status !== statusFilter) return false;

            if (searchQuery && isAdmin) {
                const employee = users.find(u => u.id === leave.userId);
                const name = (employee?.name || employee?.email || '').toLowerCase();
                const reasonText = (leave.reason || '').toLowerCase();
                const q = searchQuery.toLowerCase();
                if (!name.includes(q) && !reasonText.includes(q)) return false;
            }

            if (monthFilter) {
                const [year, month] = monthFilter.split('-').map(Number);
                const filterStart = startOfMonth(new Date(year, month - 1));
                const filterEnd = endOfMonth(new Date(year, month - 1));
                const leaveStart = parseISO(leave.startDate);
                const leaveEnd = parseISO(leave.endDate);
                if (leaveEnd < filterStart || leaveStart > filterEnd) return false;
            }

            return true;
        });
    }, [leaves, isAdmin, user, statusFilter, searchQuery, monthFilter, users]);

    // Active selected leave for drawer
    const selectedLeave = useMemo(() => {
        if (!selectedLeaveId) return null;
        return leaves.find(l => l.id === selectedLeaveId) || null;
    }, [leaves, selectedLeaveId]);

    const selectedLeaveApplicant = useMemo(() => {
        if (!selectedLeave) return null;
        return users.find(u => u.id === selectedLeave.userId) || null;
    }, [selectedLeave, users]);

    const selectedLeaveApprover = useMemo(() => {
        if (!selectedLeave || !selectedLeave.approverId) return null;
        return users.find(u => u.id === selectedLeave.approverId) || null;
    }, [selectedLeave, users]);

    const selectedLeaveConflicts = useMemo(() => {
        if (!selectedLeave) return [];
        return getShootConflictsForLeave(selectedLeave);
    }, [selectedLeave, getShootConflictsForLeave]);

    const handleExport = () => {
        const rows = filteredLeaves.map(leave => {
            const employee = users.find(u => u.id === leave.userId);
            const approver = users.find(u => u.id === leave.approverId);
            return [
                employee?.name || employee?.email || 'Unknown',
                leave.startDate,
                leave.endDate,
                leaveDays(leave.startDate, leave.endDate),
                `"${(leave.reason || '').replace(/"/g, '""')}"`,
                leave.status,
                approver?.name || approver?.email || '',
                leave.createdAt ? format(parseISO(leave.createdAt), 'yyyy-MM-dd') : '',
            ].join(',');
        });
        const csv = ['Employee,Start Date,End Date,Days,Reason,Status,Approved By,Applied On', ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leaves-${monthFilter || format(today, 'yyyy-MM')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleAdminLeaveSubmit = async (data: { userId: string; startDate: string; endDate: string; reason: string }) => {
        try {
            const res = await fetch('/api/admin/leaves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: data.userId,
                    departmentId: activeDepartmentId || undefined,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    reason: data.reason,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to record absence');
            }
            showToast('Absence recorded successfully', 'success');
            refetch();
        } catch (error) {
            console.error('Failed to record absence:', error);
            showToast('Failed to record absence', 'error');
        }
    };

    const handleApplySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        const newStart = new Date(startDate);
        const newEnd = new Date(endDate);
        newStart.setHours(0, 0, 0, 0);
        newEnd.setHours(23, 59, 59, 999);

        const hasOverlap = leaves.some(leave => {
            if (leave.userId !== user?.id) return false;
            if (leave.status === 'REJECTED') return false;
            const existingStart = new Date(leave.startDate);
            const existingEnd = new Date(leave.endDate);
            existingStart.setHours(0, 0, 0, 0);
            existingEnd.setHours(23, 59, 59, 999);
            return newStart <= existingEnd && newEnd >= existingStart;
        });

        if (hasOverlap) {
            showToast('You already have a leave request that overlaps with these dates.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await addLeave({
                userId: user!.id,
                departmentId: activeDepartmentId || undefined,
                startDate,
                endDate,
                reason,
                status: 'PENDING',
            });

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'CREATE',
                entityId: user!.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Applied for leave from ${format(parseISO(startDate), 'MMM d, yyyy')} to ${format(parseISO(endDate), 'MMM d, yyyy')}. Reason: ${reason}`,
                departmentId: activeDepartmentId || undefined,
            });

            const admins = users.filter(u =>
                u.status === 'ACTIVE' &&
                (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') &&
                u.departmentId === activeDepartmentId &&
                u.id !== user?.id
            );
            const title = 'New Leave Request';
            const message = `${user?.name} has requested leave from ${format(parseISO(startDate), 'MMM d')} to ${format(parseISO(endDate), 'MMM d')}.`;

            await Promise.all(admins.map(async (admin) => {
                await storage.addNotification({ userId: admin.id, departmentId: activeDepartmentId, title, message, link: '/leaves' });
            }));

            if (admins.length > 0) {
                sendPushNotification({ userIds: admins.map(admin => admin.id), title, message, link: '/leaves' })
                    .catch(e => console.error('Failed to send leave request push notifications', e));
            }

            fetch('/api/send-leave-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    applicantName: user?.name,
                    startDate: format(parseISO(startDate), 'MMM d, yyyy'),
                    endDate: format(parseISO(endDate), 'MMM d, yyyy'),
                    reason,
                    departmentId: activeDepartmentId,
                }),
            }).catch(e => console.error('Failed to trigger email notification', e));

            setIsApplying(false);
            setStartDate('');
            setEndDate('');
            setReason('');
            showToast('Leave application submitted', 'success');
        } catch (error) {
            console.error('Failed to apply for leave:', error);
            showToast('Failed to apply for leave. Please try again.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditSubmit = async (leave: Leave, updates: { startDate: string; endDate: string; reason: string }) => {
        const ownerId = leave.userId;
        const newStart = new Date(updates.startDate);
        const newEnd = new Date(updates.endDate);
        newStart.setHours(0, 0, 0, 0);
        newEnd.setHours(23, 59, 59, 999);

        const hasOverlap = leaves.some(l => {
            if (l.id === leave.id || l.userId !== ownerId) return false;
            if (l.status === 'REJECTED') return false;
            const s = new Date(l.startDate); s.setHours(0, 0, 0, 0);
            const e = new Date(l.endDate); e.setHours(23, 59, 59, 999);
            return newStart <= e && newEnd >= s;
        });

        if (hasOverlap) {
            showToast('These dates overlap with another leave request.', 'error');
            throw new Error('Overlap detected');
        }

        const isOwnLeave = leave.userId === user?.id;
        try {
            if (isAdmin && !isOwnLeave) {
                const res = await fetch('/api/admin/leaves', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: leave.id,
                        startDate: updates.startDate,
                        endDate: updates.endDate,
                        reason: updates.reason
                    }),
                });
                if (!res.ok) {
                    const b = await res.json().catch(() => ({}));
                    throw new Error(b.error || 'Failed to update leave');
                }
                refetch();
            } else {
                await updateLeave({
                    id: leave.id,
                    updates: {
                        startDate: updates.startDate,
                        endDate: updates.endDate,
                        reason: updates.reason
                    }
                });
            }
            showToast('Leave request updated', 'success');
        } catch (error) {
            console.error('Failed to update leave:', error);
            showToast('Failed to update leave request', 'error');
            throw error;
        }
    };

    const handleCancelLeave = async (id: string) => {
        try {
            await deleteLeave(id);
            showToast('Leave request cancelled', 'success');
            if (selectedLeaveId === id) setSelectedLeaveId(null);
        } catch (error) {
            console.error('Failed to cancel leave:', error);
            showToast('Failed to cancel leave request', 'error');
        }
    };

    const handleAdminDeleteLeave = async (leave: Leave) => {
        const who = users.find(u => u.id === leave.userId)?.name || 'this member';
        if (!window.confirm(`Delete this leave/absence for ${who}? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/admin/leaves?id=${encodeURIComponent(leave.id)}`, { method: 'DELETE' });
            if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                throw new Error(b.error || 'Failed to delete leave');
            }
            showToast('Leave deleted', 'success');
            if (selectedLeaveId === leave.id) setSelectedLeaveId(null);
            refetch();
        } catch (error) {
            console.error('Failed to delete leave:', error);
            showToast('Failed to delete leave', 'error');
        }
    };

    const handleStatusUpdate = async (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING', applicantId: string) => {
        const verb = status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Reopened';
        try {
            const isOwnLeave = applicantId === user?.id;
            if (isAdmin && !isOwnLeave) {
                const res = await fetch('/api/admin/leaves', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, status }),
                });
                if (!res.ok) {
                    const b = await res.json().catch(() => ({}));
                    throw new Error(b.error || 'Failed to update leave status');
                }
                refetch();
            } else {
                await updateLeave({ id, updates: { status, approverId: status === 'PENDING' ? undefined : user?.id } });
            }

            const applicant = users.find(u => u.id === applicantId);
            const applicantName = applicant?.name || applicant?.email || 'Unknown User';
            const notifTitle = `Leave Request ${verb}`;
            const notifMessage = status === 'PENDING'
                ? `Your leave request has been reopened for review by ${user?.name}.`
                : `Your leave request has been ${status.toLowerCase()} by ${user?.name}.`;

            if (applicant) {
                sendPushNotification({ userId: applicant.id, title: notifTitle, message: notifMessage, link: '/leaves' })
                    .catch(e => console.error('Failed to send push notification to applicant', e));
            }

            Promise.all([
                storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: id,
                    userId: user!.id,
                    timestamp: new Date().toISOString(),
                    details: `${verb} leave request from ${applicantName}`,
                    departmentId: activeDepartmentId || undefined,
                }),
                storage.addNotification({
                    userId: applicantId,
                    departmentId: activeDepartmentId,
                    title: notifTitle,
                    message: notifMessage,
                    link: '/leaves',
                }),
            ]).catch(e => console.error('Failed to add log/notification', e));
            showToast(`Leave ${verb.toLowerCase()}`, 'success');
        } catch (error) {
            console.error('Failed to update leave status:', error);
            showToast('Failed to update leave status.', 'error');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                        <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
                        Approved
                    </span>
                );
            case 'REJECTED':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60">
                        <X size={12} className="text-rose-600 dark:text-rose-400" />
                        Rejected
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                        <Clock size={12} className="text-amber-600 dark:text-amber-400" />
                        Pending
                    </span>
                );
        }
    };

    if (isLoading) {
        return (
            <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 lg:px-6 py-4 space-y-4">
                <div className="flex justify-between items-center">
                    <div className="space-y-2">
                        <div className="h-7 bg-gray-200 dark:bg-gray-800 rounded-lg w-36 animate-pulse" />
                        <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded-md w-52 animate-pulse" />
                    </div>
                    <div className="h-9 bg-gray-200 dark:bg-gray-800 rounded-xl w-32 animate-pulse hidden sm:block" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
                    ))}
                </div>
                <div className="h-96 bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200 dark:border-gray-800 animate-pulse" />
            </div>
        );
    }

    return (
        <div
            className="w-full max-w-[1600px] mx-auto px-3 sm:px-5 lg:px-6 py-2.5 sm:py-4 space-y-3.5 sm:space-y-4 pb-24 md:pb-6 relative transition-transform duration-200 ease-out"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={pullDistance !== 0 ? { transform: `translateY(${pullDistance}px)` } : undefined}
        >
            {/* Pull-to-refresh indicator */}
            <div className="absolute top-0 left-0 right-0 flex justify-center -mt-10 transition-opacity duration-200" style={{ opacity: pullDistance > 10 ? 1 : 0 }}>
                {isRefetching || isRefreshing ? (
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-full p-2 flex items-center justify-center animate-spin">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-full p-2 flex items-center justify-center">
                        <svg className={`w-4 h-4 text-gray-500 transition-transform ${pullDistance > 50 ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Top Executive Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                            Leaves & Team Time Off
                        </h1>
                        <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                            {filteredLeaves.length} {filteredLeaves.length === 1 ? 'request' : 'requests'}
                        </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Review leave applications, manage team availability, and check for shoot conflicts.
                    </p>
                </div>

                {/* Top Actions */}
                <div className="flex items-center flex-wrap gap-2 shrink-0">
                    <Link
                        href="/calendar"
                        className="h-9 px-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] text-xs font-semibold text-gray-700 dark:text-gray-300 hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                        <Calendar size={14} className="text-gray-400" />
                        <span>Calendar</span>
                        <ExternalLink size={12} className="opacity-60" />
                    </Link>

                    {isAdmin && (
                        <>
                            <button
                                onClick={handleExport}
                                className="h-9 px-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center gap-1.5 shadow-2xs"
                            >
                                <Download size={14} className="text-gray-400" />
                                <span>Export CSV</span>
                            </button>
                            <button
                                onClick={() => setIsAdminModalOpen(true)}
                                className="h-9 px-3.5 rounded-xl bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                            >
                                <Plus size={15} />
                                <span>Record Absence</span>
                            </button>
                        </>
                    )}

                    {!isAdmin && (
                        <Button
                            onClick={() => setIsApplying(!isApplying)}
                            className="h-9 rounded-xl px-4 text-xs font-bold gap-1.5 shadow-xs"
                        >
                            {isApplying ? <X size={15} /> : <Plus size={15} />}
                            {isApplying ? 'Cancel Form' : 'Apply for Leave'}
                        </Button>
                    )}
                </div>
            </div>

            {/* KPI Ribbon (Clean, modern Apple-style cards) */}
            {isAdmin ? (
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                    <div
                        onClick={() => setStatusFilter('PENDING')}
                        className={`p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer bg-white dark:bg-[#1c1c1e] ${
                            statusFilter === 'PENDING'
                                ? 'border-amber-400 dark:border-amber-500 shadow-xs ring-1 ring-amber-400/40'
                                : 'border-gray-200/80 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 shadow-2xs'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                                    <Clock size={14} />
                                </div>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    Pending Review
                                </span>
                            </div>
                            {statsData.pending > 0 && (
                                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            )}
                        </div>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-2xl font-black text-gray-900 dark:text-white">
                                {statsData.pending}
                            </span>
                            <span className="text-[11px] text-gray-400">
                                awaiting action
                            </span>
                        </div>
                    </div>

                    <div className="p-3 sm:p-3.5 rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] shadow-2xs">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                                    <Users size={14} />
                                </div>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    Out Today
                                </span>
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-2xl font-black text-gray-900 dark:text-white">
                                {statsData.onLeaveToday}
                            </span>
                            <span className="text-[11px] text-gray-400">
                                staff member{statsData.onLeaveToday === 1 ? '' : 's'}
                            </span>
                        </div>
                    </div>

                    <div
                        onClick={() => setStatusFilter('APPROVED')}
                        className={`p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer bg-white dark:bg-[#1c1c1e] ${
                            statusFilter === 'APPROVED'
                                ? 'border-emerald-400 dark:border-emerald-500 shadow-xs ring-1 ring-emerald-400/40'
                                : 'border-gray-200/80 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 shadow-2xs'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                                    <CalendarCheck2 size={14} />
                                </div>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    Approved This Month
                                </span>
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-2xl font-black text-gray-900 dark:text-white">
                                {statsData.approvedThisMonth}
                            </span>
                            <span className="text-[11px] text-gray-400">
                                approved leaves
                            </span>
                        </div>
                    </div>
                </div>
            ) : myStats && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] shadow-2xs">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                                <Calendar size={14} />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                Days Taken This Year
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-2xl font-black text-gray-900 dark:text-white">{myStats.daysThisYear}</span>
                            <span className="text-[11px] text-gray-400">approved days</span>
                        </div>
                    </div>
                    <div
                        onClick={() => setStatusFilter('PENDING')}
                        className="p-3.5 rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] shadow-2xs cursor-pointer hover:border-gray-300 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                                <Clock size={14} />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                Pending Approvals
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-2xl font-black text-gray-900 dark:text-white">{myStats.pending}</span>
                            <span className="text-[11px] text-gray-400">awaiting manager</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Apply Form (Slide down when triggered) */}
            {isApplying && (
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1c1c1e] shadow-sm border border-gray-200 dark:border-gray-800 animate-in fade-in slide-in-from-top-3">
                    <div className="flex items-center justify-between mb-3.5">
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Calendar size={16} className="text-primary" />
                            Submit Leave Application
                        </h2>
                        <button
                            type="button"
                            onClick={() => setIsApplying(false)}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            Cancel
                        </button>
                    </div>

                    <form onSubmit={handleApplySubmit} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    required
                                    min={startDate}
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                Reason for Absence
                            </label>
                            <textarea
                                required
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                                placeholder="Explain reason for leave and handoff coverage if applicable..."
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setIsApplying(false)}
                                disabled={isSubmitting}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !startDate || !endDate || !reason.trim()}
                                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Unified High-Density Filter & Search Toolbar */}
            <div className="p-2 sm:p-2.5 rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] shadow-2xs space-y-2">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
                    {/* Status segmented tabs */}
                    <div className="inline-flex p-1 bg-gray-100/90 dark:bg-gray-800/80 rounded-xl overflow-x-auto shrink-0">
                        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as LeaveStatus[]).map(status => {
                            const isSelected = statusFilter === status;
                            return (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                        isSelected
                                            ? 'bg-white dark:bg-[#252528] text-gray-900 dark:text-white shadow-2xs'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    <span>{status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}</span>
                                    {status === 'PENDING' && statsData.pending > 0 && (
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                            isSelected
                                                ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                                                : 'bg-amber-200/70 text-amber-900'
                                        }`}>
                                            {statsData.pending}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Search & Month Picker */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 lg:max-w-xl lg:justify-end">
                        <div className="relative flex-1">
                            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder={isAdmin ? "Search member or reason..." : "Search reason..."}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="h-8.5 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-8.5 pr-7 text-xs text-gray-900 dark:text-white outline-none transition-all placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-primary"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Clear search"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {isAdmin && (
                            <div
                                className="relative cursor-pointer shrink-0 sm:w-[150px]"
                                onClick={() => {
                                    const el = monthInputRef.current;
                                    if (!el) return;
                                    if (typeof el.showPicker === 'function') el.showPicker();
                                    else el.focus();
                                }}
                            >
                                <Calendar size={13} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-400" />
                                <input
                                    ref={monthInputRef}
                                    type="month"
                                    value={monthFilter}
                                    onChange={e => setMonthFilter(e.target.value)}
                                    aria-label="Filter by month"
                                    className={`h-8.5 w-full cursor-pointer rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-8 pr-2.5 text-xs outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary ${
                                        monthFilter ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400'
                                    }`}
                                />
                            </div>
                        )}

                        {(searchQuery || monthFilter) && (
                            <button
                                onClick={() => { setSearchQuery(''); setMonthFilter(''); }}
                                className="h-8.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* List & High-Density Table Area */}
            <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] shadow-2xs overflow-hidden">
                {filteredLeaves.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3 text-gray-400">
                            <Calendar size={22} />
                        </div>
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white">{EMPTY_STATES[statusFilter].title}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                            {EMPTY_STATES[statusFilter].subtitle}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Desktop / Laptop High-Density Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-gray-50/75 dark:bg-[#18181a] border-b border-gray-100 dark:border-gray-800 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider items-center">
                            <div className="col-span-3">Team Member</div>
                            <div className="col-span-3">Dates & Duration</div>
                            <div className="col-span-3">Reason</div>
                            <div className="col-span-1">Conflicts</div>
                            <div className="col-span-1">Status</div>
                            <div className="col-span-1 text-right">Details</div>
                        </div>

                        {/* Leave Rows */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
                            {filteredLeaves.map((leave: Leave) => {
                                const employee = users.find(u => u.id === leave.userId);
                                const approver = users.find(u => u.id === leave.approverId);
                                const days = leaveDays(leave.startDate, leave.endDate);
                                const sameYear = parseISO(leave.startDate).getFullYear() === parseISO(leave.endDate).getFullYear();
                                const endFmt = format(parseISO(leave.endDate), 'MMM d, yyyy');
                                const rangeLabel = leave.startDate === leave.endDate
                                    ? endFmt
                                    : `${format(parseISO(leave.startDate), sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${endFmt}`;

                                const conflicts = getShootConflictsForLeave(leave);
                                const hasConflicts = conflicts.length > 0;
                                const isSelected = selectedLeaveId === leave.id;

                                return (
                                    <div
                                        key={leave.id}
                                        onClick={() => setSelectedLeaveId(leave.id)}
                                        className={`transition-all cursor-pointer group ${
                                            isSelected
                                                ? 'bg-blue-50/50 dark:bg-blue-950/20'
                                                : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40'
                                        }`}
                                    >
                                        {/* Desktop / Laptop Grid Row */}
                                        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 items-center">
                                            {/* Col 1: Member (3 cols) */}
                                            <div className="col-span-3 flex items-center gap-3 min-w-0">
                                                <div
                                                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-2xs ${roleAvatarClass(employee?.role)}`}
                                                >
                                                    {initials(employee?.name || employee?.email)}
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="block text-xs font-bold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors">
                                                        {employee?.name || employee?.email || 'Unknown User'}
                                                    </span>
                                                    <span className="block text-[11px] text-gray-400 truncate">
                                                        {roleLabel(employee?.role)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Col 2: Dates & Duration (3 cols) */}
                                            <div className="col-span-3 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                                                        <Calendar size={13} className="text-gray-400 shrink-0" />
                                                        {rangeLabel}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shrink-0 border border-blue-100 dark:border-blue-900/30">
                                                        {days} {days === 1 ? 'day' : 'days'}
                                                    </span>
                                                </div>
                                                <span className="block text-[11px] text-gray-400 mt-0.5">
                                                    Applied {format(parseISO(leave.createdAt || new Date().toISOString()), 'MMM d')}
                                                </span>
                                            </div>

                                            {/* Col 3: Reason Preview (3 cols - generous reading room) */}
                                            <div className="col-span-3 min-w-0 pr-2">
                                                <p className="text-xs text-gray-600 dark:text-gray-300 truncate" title={leave.reason}>
                                                    {leave.reason || '—'}
                                                </p>
                                                {leave.status !== 'PENDING' && approver && (
                                                    <p className="text-[10px] text-gray-400 truncate mt-0.5">
                                                        {leave.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {approver.name || approver.email}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Col 4: Shoot Conflicts (1 col) */}
                                            <div className="col-span-1 min-w-0">
                                                {hasConflicts ? (
                                                    <span
                                                        title={`${conflicts.length} active shoot conflict(s) detected`}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                                    >
                                                        <AlertTriangle size={11} className="text-amber-600 dark:text-amber-400 shrink-0" />
                                                        <span>{conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                                        <CheckCircle2 size={12} className="shrink-0" />
                                                        <span>Clear</span>
                                                    </span>
                                                )}
                                            </div>

                                            {/* Col 5: Status (1 col) */}
                                            <div className="col-span-1 shrink-0">
                                                {getStatusBadge(leave.status)}
                                            </div>

                                            {/* Col 6: Review Detail Button (1 col - Clean, no noisy raw buttons) */}
                                            <div className="col-span-1 flex items-center justify-end shrink-0">
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 group-hover:bg-primary group-hover:text-white transition-all shadow-2xs">
                                                    <span>Review</span>
                                                    <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                                                </span>
                                            </div>
                                        </div>

                                        {/* Mobile Card Layout (<768px) */}
                                        <div className="md:hidden p-3.5 space-y-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 ${roleAvatarClass(employee?.role)}`}
                                                    >
                                                        {initials(employee?.name || employee?.email)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="block text-xs font-bold text-gray-900 dark:text-white truncate">
                                                            {employee?.name || employee?.email || 'Unknown User'}
                                                        </span>
                                                        <span className="block text-[10px] text-gray-400">
                                                            {roleLabel(employee?.role)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0">
                                                    {getStatusBadge(leave.status)}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                                                    <Calendar size={13} className="text-gray-400" />
                                                    {rangeLabel}
                                                </span>
                                                <span className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                                                    {days} {days === 1 ? 'day' : 'days'}
                                                </span>
                                                {hasConflicts && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                                        <AlertTriangle size={11} />
                                                        {conflicts.length} Shoot Conflict{conflicts.length > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>

                                            {leave.reason && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                                    {leave.reason}
                                                </p>
                                            )}

                                            <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800/70 text-[11px] text-gray-400">
                                                <span>Tap to review details</span>
                                                <ChevronRight size={14} className="text-gray-400" />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Leave Detail Slide-over Drawer */}
            <LeaveDetailDrawer
                isOpen={!!selectedLeave}
                leave={selectedLeave}
                onClose={() => setSelectedLeaveId(null)}
                applicant={selectedLeaveApplicant}
                approver={selectedLeaveApprover}
                currentUser={user}
                isAdmin={isAdmin}
                conflictingShoots={selectedLeaveConflicts}
                onStatusUpdate={handleStatusUpdate}
                onEditSubmit={handleEditSubmit}
                onDelete={handleAdminDeleteLeave}
                onCancel={handleCancelLeave}
            />

            {/* Admin Record Absence Modal */}
            <AdminLeaveModal
                isOpen={isAdminModalOpen}
                onClose={() => setIsAdminModalOpen(false)}
                onSubmit={handleAdminLeaveSubmit}
                users={users}
            />
        </div>
    );
}
