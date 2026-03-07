'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLeaves } from '@/hooks/useLeaves';
import { useUsers } from '@/hooks/useUsers';
import { useDepartment } from '@/lib/department-context';
import { format, parseISO } from 'date-fns';
import { Plus, CheckCircle, XCircle, Clock, Calendar, Users, Filter, User } from 'lucide-react';
import { Button } from '@/components/Button';
import { Leave } from '@/types';
import { storage } from '@/lib/storage';
import { useToast } from '@/lib/toast-context';

type LeaveStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

export default function LeavesPage() {
    const { user } = useAuth();
    const { leaves, isLoading, isRefetching, addLeave, updateLeave, refetch } = useLeaves();
    const { data: users = [] } = useUsers();
    const { department } = useDepartment();
    const { showToast } = useToast();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    const [statusFilter, setStatusFilter] = useState<LeaveStatus>('ALL');
    const [isApplying, setIsApplying] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Pull to refresh state
    const [pullStart, setPullStart] = useState(0);
    const [pullDistance, setPullDistance] = useState(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0) {
            setPullStart(e.touches[0].clientY);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (pullStart > 0) {
            const y = e.touches[0].clientY;
            const distance = y - pullStart;
            if (distance > 0) { // dragging down
                // Add some resistance
                const maxDistance = 80;
                setPullDistance(Math.min(distance * 0.4, maxDistance));
            }
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

    // Form state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');

    const isAdminOrManager = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '');

    // Filter leaves based on role and selected status
    const filteredLeaves = leaves.filter((leave: Leave) => {
        // If not admin/manager, only show their own leaves
        if (!isAdminOrManager && leave.userId !== user?.id) return false;

        // Filter by status
        if (statusFilter !== 'ALL' && leave.status !== statusFilter) return false;

        return true;
    });

    const handleApplySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return; // Prevent multiple submissions

        // Check for overlapping leaves
        const newStart = new Date(startDate);
        const newEnd = new Date(endDate);
        newStart.setHours(0, 0, 0, 0);
        newEnd.setHours(23, 59, 59, 999);

        const hasOverlap = leaves.some(leave => {
            if (leave.userId !== user?.id) return false;
            // Allow re-applying if the previous one was rejected or cancelled
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
                status: 'PENDING'
            });

            // Log the leave application
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'CREATE',
                entityId: user!.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Applied for leave from ${format(parseISO(startDate), 'MMM d, yyyy')} to ${format(parseISO(endDate), 'MMM d, yyyy')}. Reason: ${reason}`,
                departmentId: activeDepartmentId || undefined
            });

            // Notify admins and managers in the same department
            const adminsAndManagers = users.filter(u =>
                (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN' || u.role === 'MANAGER') &&
                u.departmentId === activeDepartmentId &&
                u.id !== user?.id
            );

            for (const admin of adminsAndManagers) {
                await storage.addNotification({
                    userId: admin.id,
                    departmentId: activeDepartmentId,
                    title: 'New Leave Request',
                    message: `${user?.name} has requested leave from ${format(parseISO(startDate), 'MMM d')} to ${format(parseISO(endDate), 'MMM d')}.`,
                    link: '/leaves'
                });
            }

            // Send Email notification
            try {
                await fetch('/api/send-leave-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        applicantName: user?.name,
                        startDate: format(parseISO(startDate), 'MMM d, yyyy'),
                        endDate: format(parseISO(endDate), 'MMM d, yyyy'),
                        reason,
                        departmentId: activeDepartmentId
                    })
                });
            } catch (e) {
                console.error('Failed to trigger email notification', e);
            }

            setIsApplying(false);
            setStartDate('');
            setEndDate('');
            setReason('');
        } catch (error) {
            console.error('Failed to apply for leave:', error);
            alert('Failed to apply for leave. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStatusUpdate = async (id: string, status: 'APPROVED' | 'REJECTED', applicantId: string) => {
        try {
            await updateLeave({ id, updates: { status, approverId: user?.id } });

            // Find the applicant's name for better log messages
            const applicant = users.find(u => u.id === applicantId);
            const applicantName = applicant?.name || 'Unknown User';

            // Log the approval/rejection
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `${status === 'APPROVED' ? 'Approved' : 'Rejected'} leave request from ${applicantName}`,
                departmentId: activeDepartmentId || undefined
            });

            // Notify the user about their leave status change
            await storage.addNotification({
                userId: applicantId,
                departmentId: activeDepartmentId,
                title: `Leave Request ${status.charAt(0) + status.slice(1).toLowerCase()}`,
                message: `Your leave request has been ${status.toLowerCase()} by ${user?.name}.`,
                link: '/leaves'
            });

        } catch (error) {
            console.error('Failed to update leave status:', error);
            alert('Failed to update leave status.');
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
            <div className="px-4 py-6 sm:p-6 space-y-6 max-w-5xl mx-auto pb-24 md:pb-6">
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="space-y-3">
                        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-md w-32 animate-pulse"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-md w-48 animate-pulse"></div>
                    </div>
                    <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-36 animate-pulse hidden sm:block"></div>
                </div>

                <div className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-9 w-24 bg-gray-200 dark:bg-gray-800 rounded-md animate-pulse"></div>
                            ))}
                        </div>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="p-4 sm:p-5">
                                <div className="flex flex-col sm:flex-row justify-between gap-4">
                                    <div className="space-y-4 flex-1">
                                        <div className="flex justify-between items-center">
                                            <div className="flex gap-3 items-center">
                                                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"></div>
                                                <div className="space-y-2">
                                                    <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded-md w-32 animate-pulse"></div>
                                                    <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-md w-24 animate-pulse"></div>
                                                </div>
                                            </div>
                                            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse"></div>
                                        </div>
                                        <div className="h-20 bg-gray-100 dark:bg-gray-900 rounded-lg animate-pulse"></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="px-4 py-6 sm:p-6 space-y-6 max-w-5xl mx-auto min-h-[calc(100vh-80px)] pb-24 md:pb-6 relative transition-transform duration-200 ease-out"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ transform: `translateY(${pullDistance}px)` }}
        >
            {/* Pull to refresh indicator */}
            <div className="absolute top-0 left-0 right-0 flex justify-center -mt-12 opacity-0 transition-opacity duration-200" style={{ opacity: pullDistance > 10 ? 1 : 0 }}>
                {isRefetching || isRefreshing ? (
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-full p-2 flex items-center justify-center animate-spin">
                        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Leaves</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your time off requests</p>
                </div>
                {!isAdminOrManager && (
                    <Button onClick={() => setIsApplying(!isApplying)} className="gap-2">
                        {isApplying ? <XCircle size={18} /> : <Plus size={18} />}
                        {isApplying ? 'Cancel' : 'Apply for Leave'}
                    </Button>
                )}
            </div>

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
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            <div className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg w-full overflow-x-auto custom-scrollbar">
                        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as LeaveStatus[]).map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-4 py-2 flex-1 sm:flex-none rounded-md text-sm font-medium transition-colors whitespace-nowrap ${statusFilter === status
                                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
                            >
                                {status === 'ALL' ? 'All Requests' : status.charAt(0) + status.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {filteredLeaves.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            <Calendar className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                            <p>No leave requests found.</p>
                        </div>
                    ) : (
                        filteredLeaves.map((leave: Leave) => {
                            const employee = users.find(u => u.id === leave.userId);
                            const approver = users.find(u => u.id === leave.approverId);

                            return (
                                <div key={leave.id} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                        <div className="space-y-3 flex-1">
                                            <div className="flex items-center justify-between sm:justify-start gap-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full">
                                                        <User size={16} className="text-blue-600 dark:text-blue-400" />
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-gray-900 dark:text-white block sm:inline">
                                                            {employee?.name || 'Unknown Employee'}
                                                        </span>
                                                        <span className="text-xs text-gray-500 ml-0 sm:ml-2">Applied on {format(parseISO(leave.createdAt || new Date().toISOString()), 'MMM d, yyyy')}</span>
                                                    </div>
                                                </div>
                                                {getStatusBadge(leave.status)}
                                            </div>

                                            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 sm:px-4 sm:py-3 text-sm text-gray-700 dark:text-gray-300">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mb-2 text-xs sm:text-sm font-medium">
                                                    <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                                                        <Calendar size={14} className="text-gray-500" />
                                                        {format(parseISO(leave.startDate), 'MMM d, yyyy')}
                                                        <span className="text-gray-400 mx-1">→</span>
                                                        {format(parseISO(leave.endDate), 'MMM d, yyyy')}
                                                    </div>
                                                </div>
                                                <p className="mt-2 text-gray-600 dark:text-gray-400">{leave.reason}</p>
                                            </div>

                                            {leave.status !== 'PENDING' && approver && (
                                                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                                    <CheckCircle size={14} className={leave.status === 'APPROVED' ? 'text-green-500' : 'text-red-500'} />
                                                    {leave.status === 'APPROVED' ? 'Approved' : 'Rejected'} by <span className="font-medium text-gray-700 dark:text-gray-300">{approver.name}</span>
                                                </p>
                                            )}
                                        </div>

                                        {isAdminOrManager && leave.status === 'PENDING' && (
                                            <div className="flex sm:flex-col gap-2 shrink-0 pt-2 sm:pt-0">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => handleStatusUpdate(leave.id, 'APPROVED', leave.userId)}
                                                    className="flex-1 sm:flex-none border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-900/30 dark:text-green-400 dark:hover:bg-green-900/20"
                                                >
                                                    <CheckCircle size={16} className="mr-2" /> Approve
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => handleStatusUpdate(leave.id, 'REJECTED', leave.userId)}
                                                    className="flex-1 sm:flex-none border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20"
                                                >
                                                    <XCircle size={16} className="mr-2" /> Reject
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
