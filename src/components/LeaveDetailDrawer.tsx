'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import {
    X, Calendar, AlertTriangle, CheckCircle2,
    XCircle, RotateCcw, Pencil, Trash2, ExternalLink,
    Clock, Mail, Briefcase, Check, ArrowRight, Video,
    FileText, User as UserIcon
} from 'lucide-react';
import { Leave, User, Shoot } from '@/types';
import { initials, roleAvatarClass, roleLabel } from '@/lib/user-display';
import { useDepartment } from '@/lib/department-context';

interface LeaveDetailDrawerProps {
    leave: Leave | null;
    isOpen: boolean;
    onClose: () => void;
    applicant?: User | null;
    approver?: User | null;
    currentUser?: User | null;
    isAdmin: boolean;
    conflictingShoots?: Shoot[];
    onStatusUpdate: (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING', applicantId: string) => Promise<void>;
    onEditSubmit: (leave: Leave, updates: { startDate: string; endDate: string; reason: string }) => Promise<void>;
    onDelete?: (leave: Leave) => Promise<void>;
    onCancel?: (id: string) => Promise<void>;
}

const DRAWER_TRANSITION = { type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] } as const;

export const LeaveDetailDrawer: React.FC<LeaveDetailDrawerProps> = ({
    leave,
    isOpen,
    onClose,
    applicant,
    approver,
    currentUser,
    isAdmin,
    conflictingShoots = [],
    onStatusUpdate,
    onEditSubmit,
    onDelete,
    onCancel,
}) => {
    const [mounted, setMounted] = useState(false);
    const { allDepartments } = useDepartment();

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editStart, setEditStart] = useState('');
    const [editEnd, setEditEnd] = useState('');
    const [editReason, setEditReason] = useState('');
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Reset edit form when active leave changes
    useEffect(() => {
        if (leave) {
            setEditStart(leave.startDate);
            setEditEnd(leave.endDate);
            setEditReason(leave.reason);
            setIsEditing(false);
        }
    }, [leave]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                if (isEditing) {
                    setIsEditing(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isEditing, onClose]);

    if (!mounted || !leave) return null;

    const days = differenceInCalendarDays(parseISO(leave.endDate), parseISO(leave.startDate)) + 1;
    const isOwnLeave = leave.userId === currentUser?.id;
    const canEdit = (isOwnLeave && leave.status === 'PENDING') || isAdmin;
    const canCancel = isOwnLeave && leave.status === 'PENDING';
    const canDelete = isAdmin && !canCancel && !!onDelete;

    const applicantDepartment = allDepartments.find(d => d.id === applicant?.departmentId)?.name || 'General';

    const handleSaveEdit = async () => {
        if (!editStart || !editEnd || !editReason.trim()) return;
        setIsSubmittingEdit(true);
        try {
            await onEditSubmit(leave, {
                startDate: editStart,
                endDate: editEnd,
                reason: editReason.trim(),
            });
            setIsEditing(false);
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    const handleAction = async (actionFn: () => Promise<void>) => {
        setIsActionLoading(true);
        try {
            await actionFn();
        } finally {
            setIsActionLoading(false);
        }
    };

    const statusBadge = () => {
        switch (leave.status) {
            case 'APPROVED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                        Approved
                    </span>
                );
            case 'REJECTED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <XCircle size={13} className="text-rose-600 dark:text-rose-400" />
                        Rejected
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        <Clock size={13} className="text-amber-600 dark:text-amber-400" />
                        Pending Review
                    </span>
                );
        }
    };

    const drawerJSX = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={DRAWER_TRANSITION}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9998]"
                    />

                    {/* Drawer Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={DRAWER_TRANSITION}
                        style={{ willChange: 'transform' }}
                        className="fixed top-0 right-0 h-full w-full max-w-[480px] sm:max-w-[520px] bg-white dark:bg-[#1c1c1e] shadow-2xl z-[9999] flex flex-col border-l border-gray-200 dark:border-gray-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-[#18181a]">
                            <div className="flex items-center gap-3">
                                {statusBadge()}
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Request #{leave.id.slice(-6).toUpperCase()}
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                aria-label="Close detail panel"
                                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Drawer Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {/* Member Card */}
                            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#252528] border border-gray-200/80 dark:border-gray-800 flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <div
                                        className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-base shrink-0 shadow-sm ${roleAvatarClass(applicant?.role)}`}
                                    >
                                        {initials(applicant?.name || applicant?.email)}
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">
                                            {applicant?.name || applicant?.email || 'Unknown User'}
                                        </h2>
                                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                {roleLabel(applicant?.role)}
                                            </span>
                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-200/70 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 font-medium">
                                                {applicantDepartment}
                                            </span>
                                        </div>
                                        {applicant?.email && (
                                            <p className="text-[12px] text-gray-400 dark:text-gray-400 flex items-center gap-1.5 mt-1 truncate">
                                                <Mail size={12} className="shrink-0 text-gray-400" />
                                                <span className="truncate">{applicant.email}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Dates & Duration Card */}
                            {isEditing ? (
                                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                                            <Pencil size={13} /> Edit Leave Dates & Reason
                                        </h3>
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                Start Date
                                            </label>
                                            <input
                                                type="date"
                                                value={editStart}
                                                onChange={e => setEditStart(e.target.value)}
                                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                End Date
                                            </label>
                                            <input
                                                type="date"
                                                min={editStart}
                                                value={editEnd}
                                                onChange={e => setEditEnd(e.target.value)}
                                                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                            Reason
                                        </label>
                                        <textarea
                                            value={editReason}
                                            onChange={e => setEditReason(e.target.value)}
                                            rows={3}
                                            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                                            placeholder="Enter reason for leave..."
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2 pt-1">
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            disabled={isSubmittingEdit}
                                            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            Discard
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={isSubmittingEdit || !editStart || !editEnd || !editReason.trim()}
                                            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-xs"
                                        >
                                            {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#252528] border border-gray-200/80 dark:border-gray-800 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                            <Calendar size={13} /> Time Off Period
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                            {days} {days === 1 ? 'Day' : 'Days'} Total
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                        <div className="p-3 rounded-xl bg-white dark:bg-[#1c1c1e] border border-gray-200/70 dark:border-gray-800/80">
                                            <span className="text-[11px] font-semibold uppercase text-gray-400 block mb-0.5">Start Date</span>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                                                {format(parseISO(leave.startDate), 'EEE, MMM d, yyyy')}
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-white dark:bg-[#1c1c1e] border border-gray-200/70 dark:border-gray-800/80">
                                            <span className="text-[11px] font-semibold uppercase text-gray-400 block mb-0.5">End Date</span>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                                                {format(parseISO(leave.endDate), 'EEE, MMM d, yyyy')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-1 text-xs">
                                        <Link
                                            href={`/calendar?user=${leave.userId}&date=${leave.startDate}`}
                                            className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold"
                                        >
                                            <Calendar size={13} />
                                            <span>View in Team Calendar</span>
                                            <ExternalLink size={12} />
                                        </Link>
                                        {canEdit && (
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
                                            >
                                                <Pencil size={12} /> Edit Dates
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Shoot Conflict Detection Section */}
                            <div className="space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                    <Video size={13} /> Production Shoot Conflicts
                                </span>

                                {conflictingShoots.length > 0 ? (
                                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 dark:bg-amber-950/20 dark:border-amber-800/50 space-y-3">
                                        <div className="flex items-start gap-2.5">
                                            <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                                            <div>
                                                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300">
                                                    {conflictingShoots.length} Shoot Conflict{conflictingShoots.length > 1 ? 's' : ''} Detected
                                                </h4>
                                                <p className="text-xs text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                                                    This member is assigned to active shoot{conflictingShoots.length > 1 ? 's' : ''} overlapping with this leave request:
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-2 pt-1">
                                            {conflictingShoots.map(shoot => (
                                                <Link
                                                    key={shoot.id}
                                                    href={`/shoots/${shoot.id}`}
                                                    target="_blank"
                                                    className="p-3 rounded-xl bg-white/90 dark:bg-[#1c1c1e] border border-amber-200/80 dark:border-amber-900/50 flex items-center justify-between gap-3 hover:border-amber-400 transition-colors group"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            {shoot.shootNumber && (
                                                                <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                                                    #{shoot.shootNumber}
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors">
                                                                {shoot.title}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                                                            <Calendar size={11} />
                                                            {format(parseISO(shoot.startTime), 'MMM d, yyyy h:mm a')}
                                                            {shoot.location && ` • ${shoot.location}`}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                                                        <span>View</span>
                                                        <ExternalLink size={12} />
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
                                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        <div className="text-xs">
                                            <span className="font-bold">No shoot conflicts.</span>
                                            <span className="text-emerald-700/80 dark:text-emerald-400/80 ml-1">
                                                This member is not assigned to any scheduled shoots during this period.
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Reason for Leave */}
                            <div className="space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                    <FileText size={13} /> Stated Reason
                                </span>
                                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#252528] border border-gray-200/80 dark:border-gray-800 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                                    {leave.reason || 'No specific reason provided.'}
                                </div>
                            </div>

                            {/* Decision & Audit Trail */}
                            <div className="space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                    <Clock size={13} /> Activity & Decision History
                                </span>
                                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#252528] border border-gray-200/80 dark:border-gray-800 space-y-3 text-xs">
                                    <div className="flex items-start gap-2.5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white">Applied</p>
                                            <p className="text-gray-500 dark:text-gray-400">
                                                {format(parseISO(leave.createdAt || new Date().toISOString()), 'MMM d, yyyy h:mm a')}
                                            </p>
                                        </div>
                                    </div>

                                    {leave.status !== 'PENDING' && (
                                        <div className="flex items-start gap-2.5 pt-2 border-t border-gray-200/60 dark:border-gray-800/80">
                                            <div
                                                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${leave.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                            />
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white">
                                                    {leave.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                                                </p>
                                                <p className="text-gray-500 dark:text-gray-400">
                                                    {approver ? (
                                                        <>By <span className="font-medium text-gray-700 dark:text-gray-300">{approver.name || approver.email}</span> ({roleLabel(approver.role)})</>
                                                    ) : (
                                                        'Decided by Admin/Manager'
                                                    )}
                                                    {leave.updatedAt && (
                                                        <> on {format(parseISO(leave.updatedAt), 'MMM d, yyyy h:mm a')}</>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {leave.status === 'PENDING' && (
                                        <div className="flex items-start gap-2.5 pt-2 border-t border-gray-200/60 dark:border-gray-800/80">
                                            <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                            <div>
                                                <p className="font-semibold text-amber-700 dark:text-amber-400">Awaiting Manager Review</p>
                                                <p className="text-gray-400">Pending approval from department admins.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Drawer Actions Footer */}
                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-[#18181a] space-y-2">
                            {/* Admin Decision Actions */}
                            {isAdmin && (
                                <div className="flex items-center gap-2">
                                    {leave.status !== 'APPROVED' && (
                                        <button
                                            onClick={() => handleAction(() => onStatusUpdate(leave.id, 'APPROVED', leave.userId))}
                                            disabled={isActionLoading}
                                            className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
                                        >
                                            <Check size={14} /> Approve Leave
                                        </button>
                                    )}
                                    {leave.status !== 'REJECTED' && (
                                        <button
                                            onClick={() => handleAction(() => onStatusUpdate(leave.id, 'REJECTED', leave.userId))}
                                            disabled={isActionLoading}
                                            className="flex-1 h-10 rounded-xl border border-rose-300 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 hover:bg-rose-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                                        >
                                            <X size={14} /> Reject Leave
                                        </button>
                                    )}
                                    {leave.status !== 'PENDING' && (
                                        <button
                                            onClick={() => handleAction(() => onStatusUpdate(leave.id, 'PENDING', leave.userId))}
                                            disabled={isActionLoading}
                                            className="px-3 h-10 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                                            title="Reopen leave for review"
                                        >
                                            <RotateCcw size={13} /> Reopen
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Secondary Actions (Edit, Cancel, Delete) */}
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <div className="flex items-center gap-2">
                                    {canEdit && !isEditing && (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 transition-colors"
                                        >
                                            <Pencil size={13} /> Edit
                                        </button>
                                    )}
                                </div>

                                <div>
                                    {canCancel && onCancel && (
                                        <button
                                            onClick={() => handleAction(() => onCancel(leave.id))}
                                            disabled={isActionLoading}
                                            className="h-9 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                        >
                                            <XCircle size={13} /> Cancel Request
                                        </button>
                                    )}
                                    {canDelete && onDelete && (
                                        <button
                                            onClick={() => handleAction(() => onDelete(leave))}
                                            disabled={isActionLoading}
                                            className="h-9 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                        >
                                            <Trash2 size={13} /> Delete Record
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(drawerJSX, document.body);
};
