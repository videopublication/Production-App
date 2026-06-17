'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLeaves } from '@/hooks/useLeaves';
import { useUsers } from '@/hooks/useUsers';
import { useDepartment } from '@/lib/department-context';
import {
    format, parseISO, differenceInCalendarDays,
    isWithinInterval, startOfDay, endOfDay,
    startOfMonth, endOfMonth,
} from 'date-fns';
import {
    Plus, CheckCircle, XCircle, Calendar,
    Download, Search, ExternalLink, Check, X,
    Pencil,
} from 'lucide-react';
import { Button } from '@/components/Button';
import { Leave } from '@/types';
import { storage } from '@/lib/storage';
import { useToast } from '@/lib/toast-context';
import { AdminLeaveModal } from '@/components/AdminLeaveModal';
import { sendPushNotification } from '@/lib/push-notifications';

type LeaveStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

function leaveDays(startDate: string, endDate: string) {
    return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
}

function getInitials(name?: string | null, email?: string | null) {
    if (name) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return parts[0].slice(0, 2).toUpperCase();
    }
    return (email || '??').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
];
function avatarColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
    const { department } = useDepartment();
    const { showToast } = useToast();

    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

    const [statusFilter, setStatusFilter] = useState<LeaveStatus>(
        ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '') ? 'PENDING' : 'ALL'
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    // Inline edit state
    const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
    const [editStart, setEditStart] = useState('');
    const [editEnd, setEditEnd] = useState('');
    const [editReason, setEditReason] = useState('');
    const [isEditSubmitting, setIsEditSubmitting] = useState(false);

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

    const filteredLeaves = useMemo(() => {
        return leaves.filter((leave: Leave) => {
            if (!isAdmin && leave.userId !== user?.id) return false;
            if (statusFilter !== 'ALL' && leave.status !== statusFilter) return false;

            if (searchQuery && isAdmin) {
                const employee = users.find(u => u.id === leave.userId);
                const name = (employee?.name || employee?.email || '').toLowerCase();
                if (!name.includes(searchQuery.toLowerCase())) return false;
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

    const handleExport = () => {
        const rows = filteredLeaves.map(leave => {
            const employee = users.find(u => u.id === leave.userId);
            const approver = users.find(u => u.id === leave.approverId);
            return [
                employee?.name || employee?.email || 'Unknown',
                leave.startDate,
                leave.endDate,
                leaveDays(leave.startDate, leave.endDate),
                `"${leave.reason.replace(/"/g, '""')}"`,
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
            await addLeave({
                userId: data.userId,
                departmentId: activeDepartmentId || undefined,
                startDate: data.startDate,
                endDate: data.endDate,
                reason: data.reason,
                status: 'APPROVED',
                approverId: user?.id,
            });
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

    const startEdit = (leave: Leave) => {
        setEditingLeaveId(leave.id);
        setEditStart(leave.startDate);
        setEditEnd(leave.endDate);
        setEditReason(leave.reason);
    };

    const cancelEdit = () => {
        setEditingLeaveId(null);
        setEditStart('');
        setEditEnd('');
        setEditReason('');
    };

    const handleEditSubmit = async (leaveId: string) => {
        if (!editStart || !editEnd || !editReason) return;

        // Overlap check excluding this leave
        const newStart = new Date(editStart);
        const newEnd = new Date(editEnd);
        newStart.setHours(0, 0, 0, 0);
        newEnd.setHours(23, 59, 59, 999);

        const hasOverlap = leaves.some(l => {
            if (l.id === leaveId || l.userId !== user?.id) return false;
            if (l.status === 'REJECTED') return false;
            const s = new Date(l.startDate); s.setHours(0, 0, 0, 0);
            const e = new Date(l.endDate); e.setHours(23, 59, 59, 999);
            return newStart <= e && newEnd >= s;
        });

        if (hasOverlap) {
            showToast('These dates overlap with another leave request.', 'error');
            return;
        }

        setIsEditSubmitting(true);
        try {
            await updateLeave({ id: leaveId, updates: { startDate: editStart, endDate: editEnd, reason: editReason } });
            showToast('Leave request updated', 'success');
            cancelEdit();
        } catch (error) {
            console.error('Failed to update leave:', error);
            showToast('Failed to update leave request', 'error');
        } finally {
            setIsEditSubmitting(false);
        }
    };

    const handleCancelLeave = async (id: string) => {
        setCancellingId(id);
        try {
            await deleteLeave(id);
            showToast('Leave request cancelled', 'success');
        } catch (error) {
            console.error('Failed to cancel leave:', error);
            showToast('Failed to cancel leave request', 'error');
        } finally {
            setCancellingId(null);
        }
    };

    const handleStatusUpdate = async (id: string, status: 'APPROVED' | 'REJECTED', applicantId: string) => {
        try {
            await updateLeave({ id, updates: { status, approverId: user?.id } });

            const applicant = users.find(u => u.id === applicantId);
            const applicantName = applicant?.name || applicant?.email || 'Unknown User';
            const notifTitle = `Leave Request ${status.charAt(0) + status.slice(1).toLowerCase()}`;
            const notifMessage = `Your leave request has been ${status.toLowerCase()} by ${user?.name}.`;

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
                    details: `${status === 'APPROVED' ? 'Approved' : 'Rejected'} leave request from ${applicantName}`,
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
        } catch (error) {
            console.error('Failed to update leave status:', error);
            showToast('Failed to update leave status.', 'error');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED':
                return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Approved</span>;
            case 'REJECTED':
                return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Rejected</span>;
            default:
                return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</span>;
        }
    };

    if (isLoading) {
        return (
            <div className="px-2 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="space-y-3">
                        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-md w-32 animate-pulse" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-md w-48 animate-pulse" />
                    </div>
                    <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-36 animate-pulse hidden sm:block" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />)}
                </div>
                <div className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-9 w-24 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse" />
                            ))}
                        </div>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="p-4 sm:p-5 space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
                                        <div className="space-y-2">
                                            <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded-md w-32 animate-pulse" />
                                            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-md w-24 animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="h-6 w-20 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
                                </div>
                                <div className="h-16 bg-gray-100 dark:bg-gray-900 rounded-lg animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto min-h-[calc(100vh-80px)] pb-28 md:pb-6 relative transition-transform duration-200 ease-out"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ transform: `translateY(${pullDistance}px)` }}
        >
            {/* Pull-to-refresh indicator */}
            <div className="absolute top-0 left-0 right-0 flex justify-center -mt-12 transition-opacity duration-200" style={{ opacity: pullDistance > 10 ? 1 : 0 }}>
                {isRefetching || isRefreshing ? (
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-full p-2 flex items-center justify-center animate-spin">
                        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-full p-2 flex items-center justify-center">
                        <svg className={`w-5 h-5 text-gray-500 transition-transform ${pullDistance > 50 ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Header */}
            <div className="space-y-3 sm:flex sm:items-end sm:justify-between sm:gap-4 sm:space-y-0">
                <div className="min-w-0">
                    <h1 className="text-3xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Leaves</h1>
                    <p className="mt-1 text-[15px] text-gray-500 dark:text-gray-400">Manage your time off requests</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:flex-wrap">
                    <Link
                        href="/calendar"
                        className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-gray-300 px-3 text-[14px] font-semibold text-gray-600 transition-colors hover:border-primary hover:text-primary dark:border-gray-700 dark:text-gray-300 dark:hover:border-primary dark:hover:text-primary"
                    >
                        <Calendar size={17} />
                        <span>Calendar</span>
                        <ExternalLink size={13} className="hidden sm:block" />
                    </Link>
                    {isAdmin && (
                        <>
                            <Button onClick={handleExport} variant="outline" className="h-11 rounded-2xl gap-2 shrink-0 px-3 sm:px-5">
                                <Download size={16} /> Export CSV
                            </Button>
                            <Button
                                onClick={() => setIsAdminModalOpen(true)}
                                className="col-span-2 h-12 rounded-2xl gap-2 shrink-0 bg-amber-600 hover:bg-amber-700 text-white border-none dark:bg-amber-700/80 dark:hover:bg-amber-600 sm:col-span-1"
                            >
                                <Plus size={18} /> Record Absence
                            </Button>
                        </>
                    )}
                    {!isAdmin && (
                        <Button onClick={() => setIsApplying(!isApplying)} className="col-span-2 h-12 rounded-2xl gap-2 shrink-0 sm:col-span-1">
                            {isApplying ? <XCircle size={18} /> : <Plus size={18} />}
                            {isApplying ? 'Cancel' : 'Apply for Leave'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats bar */}
            {isAdmin ? (
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="min-w-0 rounded-2xl border border-yellow-500/10 bg-yellow-500/5 p-3 dark:bg-[#1c1c1e] sm:p-4">
                        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-xs">Pending</p>
                        <p className="mt-1 text-3xl font-bold leading-none text-yellow-500 dark:text-yellow-400">{statsData.pending}</p>
                        <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-500 sm:text-xs">awaiting review</p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-red-500/10 bg-red-500/5 p-3 dark:bg-[#1c1c1e] sm:p-4">
                        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-xs">On Leave</p>
                        <p className="mt-1 text-3xl font-bold leading-none text-red-500 dark:text-red-400">{statsData.onLeaveToday}</p>
                        <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-500 sm:text-xs">today</p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-green-500/10 bg-green-500/5 p-3 dark:bg-[#1c1c1e] sm:p-4">
                        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-xs">This Month</p>
                        <p className="mt-1 text-3xl font-bold leading-none text-green-500 dark:text-green-400">{statsData.approvedThisMonth}</p>
                        <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-500 sm:text-xs">approved</p>
                    </div>
                </div>
            ) : myStats && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 dark:bg-[#1c1c1e]">
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Days Taken</p>
                        <p className="mt-1 text-3xl font-bold leading-none text-primary">{myStats.daysThisYear}</p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">this year</p>
                    </div>
                    <div className="rounded-2xl border border-yellow-500/10 bg-yellow-500/5 p-4 dark:bg-[#1c1c1e]">
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pending</p>
                        <p className="mt-1 text-3xl font-bold leading-none text-yellow-500 dark:text-yellow-400">{myStats.pending}</p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">awaiting approval</p>
                    </div>
                </div>
            )}

            {/* Apply form */}
            {isApplying && (
                <div className="bg-white dark:bg-[#1c1c1e] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 animate-in fade-in slide-in-from-top-4">
                    <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">New Leave Application</h2>
                    <form onSubmit={handleApplySubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    required
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                                <input
                                    type="date"
                                    required
                                    min={startDate}
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                            <textarea
                                required
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                placeholder="Please provide your reason for leave..."
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" type="button" onClick={() => setIsApplying(false)} disabled={isSubmitting}>Cancel</Button>
                            <Button variant="primary" type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Submitting...' : 'Submit Application'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {/* List + filters */}
            <div className="overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1c1c1e]">
                <div className="space-y-3 border-b border-gray-200 p-3 dark:border-gray-800 sm:p-4">
                    {/* Status tabs */}
                    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as LeaveStatus[]).map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border px-3 text-[14px] font-bold transition-all active:scale-[0.98] ${statusFilter === status
                                    ? 'border-primary/25 bg-primary text-white shadow-lg shadow-primary/20'
                                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                                    }`}
                            >
                                <span className="min-w-0 truncate">
                                    {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                </span>
                                {status === 'PENDING' && statsData.pending > 0 && (
                                    <span className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-black ${statusFilter === status
                                        ? 'bg-white/20 text-white'
                                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                                        }`}>
                                        {statsData.pending}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Search + month filter (admin only) */}
                    {isAdmin && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px\,1fr)_180px_auto]">
                            <div className="relative flex-1">
                                <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="h-11 w-full rounded-2xl border border-gray-300 bg-white pl-10 pr-3 text-[15px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="relative">
                                <Calendar size={18} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="month"
                                    value={monthFilter}
                                    onChange={e => setMonthFilter(e.target.value)}
                                    aria-label="Filter by month"
                                    className={`h-11 w-full rounded-2xl border border-gray-300 bg-white pl-10 pr-3 text-[15px] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 ${monthFilter ? 'text-gray-900 dark:text-white' : 'text-transparent dark:text-transparent'}`}
                                />
                                {!monthFilter && (
                                    <span className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 text-[15px] text-gray-400">
                                        Month
                                    </span>
                                )}
                            </div>
                            {(searchQuery || monthFilter) && (
                                <button
                                    onClick={() => { setSearchQuery(''); setMonthFilter(''); }}
                                    className="h-11 rounded-2xl border border-gray-300 px-4 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-3 p-3 sm:space-y-0 sm:p-0 sm:divide-y sm:divide-gray-200 sm:dark:divide-gray-800">
                    {filteredLeaves.length === 0 ? (
                        <div className="p-10 text-center">
                            <Calendar className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="font-medium text-gray-700 dark:text-gray-300">{EMPTY_STATES[statusFilter].title}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{EMPTY_STATES[statusFilter].subtitle}</p>
                        </div>
                    ) : (
                        filteredLeaves.map((leave: Leave) => {
                            const employee = users.find(u => u.id === leave.userId);
                            const approver = users.find(u => u.id === leave.approverId);
                            const days = leaveDays(leave.startDate, leave.endDate);
                            const canCancel = leave.userId === user?.id && leave.status === 'PENDING';
                            const canEdit = leave.userId === user?.id && leave.status === 'PENDING';
                            const isEditing = editingLeaveId === leave.id;

                            return (
                                <div key={leave.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-[#242426] dark:hover:bg-gray-800/60 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-5 sm:shadow-none sm:dark:bg-transparent">
                                    {/* Employee header — always shown */}
                                    <div className="mb-4 flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(leave.userId)}`}>
                                                {getInitials(employee?.name, employee?.email)}
                                            </div>
                                            <div className="min-w-0">
                                                <span className="block truncate text-[17px] font-bold leading-tight text-gray-900 dark:text-white sm:text-base">
                                                    {employee?.name || employee?.email || 'Unknown Employee'}
                                                </span>
                                                <span className="mt-1 block text-xs text-gray-500">
                                                    Applied {format(parseISO(leave.createdAt || new Date().toISOString()), 'MMM d, yyyy')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {getStatusBadge(leave.status)}
                                            {/* Per-card calendar deep-link (admin only) */}
                                            {isAdmin && (
                                                <Link
                                                    href={`/calendar?user=${leave.userId}`}
                                                    title="View on Calendar"
                                                    className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary dark:hover:bg-gray-800"
                                                >
                                                    <Calendar size={17} />
                                                </Link>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline edit form */}
                                    {isEditing ? (
                                        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 space-y-3">
                                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Edit Leave Request</p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start Date</label>
                                                    <input
                                                        type="date"
                                                        value={editStart}
                                                        onChange={e => setEditStart(e.target.value)}
                                                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End Date</label>
                                                    <input
                                                        type="date"
                                                        min={editStart}
                                                        value={editEnd}
                                                        onChange={e => setEditEnd(e.target.value)}
                                                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason</label>
                                                <textarea
                                                    value={editReason}
                                                    onChange={e => setEditReason(e.target.value)}
                                                    rows={2}
                                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                                                />
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={cancelEdit}
                                                    disabled={isEditSubmitting}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                >
                                                    <X size={14} /> Discard
                                                </button>
                                                <button
                                                    onClick={() => handleEditSubmit(leave.id)}
                                                    disabled={isEditSubmitting || !editStart || !editEnd || !editReason}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                                >
                                                    <Check size={14} /> {isEditSubmitting ? 'Saving...' : 'Save Changes'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Date + reason card */}
                                            <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800/60 dark:bg-[#2c2c2e] sm:bg-gray-50 sm:px-4 sm:py-3 sm:dark:bg-[#252528]">
                                                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                                    <div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-gray-900 dark:text-white">
                                                        <Calendar size={16} className="shrink-0 text-gray-500" />
                                                        {format(parseISO(leave.startDate), 'MMM d, yyyy')}
                                                        <span className="text-gray-400">to</span>
                                                        {format(parseISO(leave.endDate), 'MMM d, yyyy')}
                                                    </div>
                                                    <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                        {days} {days === 1 ? 'day' : 'days'}
                                                    </span>
                                                </div>
                                                <p className="text-[14px] leading-relaxed text-gray-600 dark:text-gray-400">{leave.reason}</p>
                                            </div>

                                            {/* Approver info */}
                                            {leave.status !== 'PENDING' && approver && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-3">
                                                    <CheckCircle size={14} className={leave.status === 'APPROVED' ? 'text-green-500' : 'text-red-500'} />
                                                    {leave.status === 'APPROVED' ? 'Approved' : 'Rejected'} by{' '}
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{approver.name || approver.email}</span>
                                                </p>
                                            )}

                                            {/* Action buttons */}
                                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                                                {/* Admin approve/reject — compact horizontal pills */}
                                                {isAdmin && leave.status === 'PENDING' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleStatusUpdate(leave.id, 'APPROVED', leave.userId)}
                                                            className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-green-500 px-4 text-sm font-bold text-white transition-colors hover:bg-green-600 sm:h-auto sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
                                                        >
                                                            <Check size={13} /> Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(leave.id, 'REJECTED', leave.userId)}
                                                            className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-red-300 px-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10 sm:h-auto sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
                                                        >
                                                            <X size={13} /> Reject
                                                        </button>
                                                    </>
                                                )}

                                                {/* Crew actions on their own pending leaves */}
                                                {canEdit && (
                                                    <button
                                                        onClick={() => startEdit(leave)}
                                                        className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-gray-300 px-4 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 sm:h-auto sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
                                                    >
                                                        <Pencil size={13} /> Edit
                                                    </button>
                                                )}
                                                {canCancel && (
                                                    <button
                                                        onClick={() => handleCancelLeave(leave.id)}
                                                        disabled={cancellingId === leave.id}
                                                        className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-gray-300 px-4 text-sm font-bold text-gray-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:text-red-400 sm:h-auto sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
                                                    >
                                                        <XCircle size={13} />
                                                        {cancellingId === leave.id ? 'Cancelling...' : 'Cancel Request'}
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <AdminLeaveModal
                isOpen={isAdminModalOpen}
                onClose={() => setIsAdminModalOpen(false)}
                onSubmit={handleAdminLeaveSubmit}
                users={users}
            />
        </div>
    );
}
