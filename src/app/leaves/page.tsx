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
                (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') &&
                u.departmentId === activeDepartmentId &&
                u.id !== user?.id
            );

            await Promise.all(admins.map(async (admin) => {
                const title = 'New Leave Request';
                const message = `${user?.name} has requested leave from ${format(parseISO(startDate), 'MMM d')} to ${format(parseISO(endDate), 'MMM d')}.`;
                await storage.addNotification({ userId: admin.id, departmentId: activeDepartmentId, title, message, link: '/leaves' });
                if (admin.fcmToken) {
                    fetch('/api/send-notification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: admin.fcmToken, title, message, link: '/leaves' }),
                    }).catch(e => console.error('Failed to send push notification to admin', e));
                }
            }));

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

            if (applicant?.fcmToken) {
                fetch('/api/send-notification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: applicant.fcmToken, title: notifTitle, message: notifMessage, link: '/leaves' }),
                }).catch(e => console.error('Failed to send push notification to applicant', e));
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
            className="px-2 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto min-h-[calc(100vh-80px)] pb-24 md:pb-6 relative transition-transform duration-200 ease-out"
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Leaves</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your time off requests</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        href="/calendar"
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                        <Calendar size={15} />
                        <span className="hidden sm:inline">View Calendar</span>
                        <ExternalLink size={12} />
                    </Link>
                    {isAdmin && (
                        <>
                            <Button onClick={handleExport} variant="outline" className="gap-2 shrink-0 hidden sm:flex">
                                <Download size={15} /> Export CSV
                            </Button>
                            <Button
                                onClick={() => setIsAdminModalOpen(true)}
                                className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700 text-white border-none dark:bg-amber-700/80 dark:hover:bg-amber-600"
                            >
                                <Plus size={18} /> Record Absence
                            </Button>
                        </>
                    )}
                    {!isAdmin && (
                        <Button onClick={() => setIsApplying(!isApplying)} className="gap-2 shrink-0">
                            {isApplying ? <XCircle size={18} /> : <Plus size={18} />}
                            {isApplying ? 'Cancel' : 'Apply for Leave'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats bar */}
            {isAdmin ? (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-[#1c1c1e] rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Pending</p>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{statsData.pending}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">awaiting review</p>
                    </div>
                    <div className="bg-white dark:bg-[#1c1c1e] rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">On Leave</p>
                        <p className="text-2xl font-bold text-red-500 dark:text-red-400 mt-1">{statsData.onLeaveToday}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">today</p>
                    </div>
                    <div className="bg-white dark:bg-[#1c1c1e] rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">This Month</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{statsData.approvedThisMonth}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">approved</p>
                    </div>
                </div>
            ) : myStats && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-[#1c1c1e] rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Days Taken</p>
                        <p className="text-2xl font-bold text-primary mt-1">{myStats.daysThisYear}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">this year</p>
                    </div>
                    <div className="bg-white dark:bg-[#1c1c1e] rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Pending</p>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{myStats.pending}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">awaiting approval</p>
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
            <div className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
                    {/* Status tabs */}
                    <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg w-full overflow-x-auto custom-scrollbar">
                        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as LeaveStatus[]).map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-4 py-2 flex-1 sm:flex-none rounded-md text-sm font-medium transition-colors whitespace-nowrap ${statusFilter === status
                                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                            >
                                {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                {status === 'PENDING' && statsData.pending > 0 && (
                                    <span className="ml-1.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                                        {statsData.pending}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Search + month filter (admin only) */}
                    {isAdmin && (
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search by name..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                            <input
                                type="month"
                                value={monthFilter}
                                onChange={e => setMonthFilter(e.target.value)}
                                className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                            {(searchQuery || monthFilter) && (
                                <button
                                    onClick={() => { setSearchQuery(''); setMonthFilter(''); }}
                                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="divide-y divide-gray-200 dark:divide-gray-800">
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
                                <div key={leave.id} className="p-3 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    {/* Employee header — always shown */}
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 ${avatarColor(leave.userId)}`}>
                                                {getInitials(employee?.name, employee?.email)}
                                            </div>
                                            <div className="min-w-0">
                                                <span className="font-semibold text-gray-900 dark:text-white block truncate">
                                                    {employee?.name || employee?.email || 'Unknown Employee'}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    Applied {format(parseISO(leave.createdAt || new Date().toISOString()), 'MMM d, yyyy')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {getStatusBadge(leave.status)}
                                            {/* Per-card calendar deep-link (admin only) */}
                                            {isAdmin && (
                                                <Link
                                                    href={`/calendar?user=${leave.userId}`}
                                                    title="View on Calendar"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                >
                                                    <Calendar size={15} />
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
                                            <div className="bg-gray-50 dark:bg-[#252528] rounded-lg p-3 sm:px-4 sm:py-3 border border-transparent dark:border-gray-800/60 mb-3">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                                                    <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium text-sm">
                                                        <Calendar size={14} className="text-gray-500 shrink-0" />
                                                        {format(parseISO(leave.startDate), 'MMM d, yyyy')}
                                                        <span className="text-gray-400">→</span>
                                                        {format(parseISO(leave.endDate), 'MMM d, yyyy')}
                                                    </div>
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                        {days} {days === 1 ? 'day' : 'days'}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">{leave.reason}</p>
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
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {/* Admin approve/reject — compact horizontal pills */}
                                                {isAdmin && leave.status === 'PENDING' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleStatusUpdate(leave.id, 'APPROVED', leave.userId)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                                                        >
                                                            <Check size={13} /> Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleStatusUpdate(leave.id, 'REJECTED', leave.userId)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                                        >
                                                            <X size={13} /> Reject
                                                        </button>
                                                    </>
                                                )}

                                                {/* Crew actions on their own pending leaves */}
                                                {canEdit && (
                                                    <button
                                                        onClick={() => startEdit(leave)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                    >
                                                        <Pencil size={13} /> Edit
                                                    </button>
                                                )}
                                                {canCancel && (
                                                    <button
                                                        onClick={() => handleCancelLeave(leave.id)}
                                                        disabled={cancellingId === leave.id}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
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
