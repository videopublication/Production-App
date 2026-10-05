'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shoot, ShootReview, ShootReviewStatus, User } from '@/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { 
    useShootReviews, 
    useAddShootReview, 
    useDeleteShootReview, 
    useUpdateShootReviewStatus, 
    useUpdateShootVideoUrl 
} from '@/hooks/useShootReviews';
import { 
    X, Video, ExternalLink, CheckCircle2, Clock, 
    MessageSquare, Send, RefreshCw, Check, Link2, 
    Film, Edit2, Copy, Trash2, ArrowUpRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { isServerStoragePath, isDirectVideoUrl } from '@/lib/shootReviewWorkflow';

interface ShootReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    shoot: Shoot | null;
    users: User[];
}

// Temporary toggle: Keep false until data management team builds storage paths
const SHOW_FOOTAGE_PATHS = false;

export function ShootReviewModal({ isOpen, onClose, shoot, users }: ShootReviewModalProps) {
    const { user } = useAuth();
    const { showToast } = useToast();

    // Data hooks
    const { data: reviews = [], isLoading: loadingReviews } = useShootReviews(shoot?.id || '');
    const { mutateAsync: addReview, isPending: submittingReview } = useAddShootReview();
    const { mutateAsync: deleteReview } = useDeleteShootReview();
    const { mutateAsync: updateStatus, isPending: updatingStatus } = useUpdateShootReviewStatus();
    const { mutateAsync: updateVideoUrl, isPending: updatingVideoUrl } = useUpdateShootVideoUrl();

    // Form state
    const [feedback, setFeedback] = useState<string>('');
    const [videoUrlInput, setVideoUrlInput] = useState<string>('');
    const [isEditingVideoUrl, setIsEditingVideoUrl] = useState<boolean>(false);
    const [hasCopiedPath, setHasCopiedPath] = useState<boolean>(false);
    const [isSubmittingAndDone, setIsSubmittingAndDone] = useState<boolean>(false);

    useEffect(() => {
        if (shoot) {
            setVideoUrlInput(shoot.reviewVideoUrl || '');
            setIsEditingVideoUrl(!shoot.reviewVideoUrl);
            setFeedback('');
            setHasCopiedPath(false);
            setIsSubmittingAndDone(false);
        }
    }, [shoot]);

    // Handle ESC key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !shoot) return null;

    const isDone = shoot.reviewStatus === 'DONE';
    const canManageStatus = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '');

    const handleSaveVideoUrl = async () => {
        if (!videoUrlInput.trim()) {
            showToast('Please enter a video link or server footage path', 'warning');
            return;
        }
        try {
            await updateVideoUrl({ shootId: shoot.id, videoUrl: videoUrlInput.trim() });
            setIsEditingVideoUrl(false);
            showToast('Footage location saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save footage location', 'error');
        }
    };

    // Submits feedback, optionally marking review as DONE atomically
    const handleSubmitFeedback = async (andMarkDone: boolean = false) => {
        if (!feedback.trim()) {
            showToast('Please enter your feedback notes before submitting', 'warning');
            return;
        }

        if (andMarkDone) setIsSubmittingAndDone(true);

        try {
            await addReview({
                shootId: shoot.id,
                departmentId: shoot.departmentId,
                userId: user?.id || 'guest',
                userName: user?.name || user?.email || 'Crew Member',
                userRole: user?.role || 'CREW',
                feedback: feedback.trim()
            });

            if (andMarkDone) {
                await updateStatus({
                    shootId: shoot.id,
                    status: 'DONE',
                    completedBy: user?.name || user?.email || 'Reviewer'
                });
                showToast('Review submitted and marked as Done! ✓', 'success');
                onClose();
            } else {
                showToast('Feedback submitted successfully!', 'success');
            }

            setFeedback('');
        } catch (error) {
            showToast('Failed to submit feedback', 'error');
        } finally {
            setIsSubmittingAndDone(false);
        }
    };

    const handleReopen = async () => {
        try {
            await updateStatus({
                shootId: shoot.id,
                status: 'PENDING'
            });
            showToast('Review re-opened for feedback', 'info');
        } catch (error) {
            showToast('Failed to re-open review', 'error');
        }
    };

    const handleDeleteReview = async (reviewId: string) => {
        if (!confirm('Are you sure you want to remove this feedback?')) return;
        try {
            await deleteReview({ id: reviewId, shootId: shoot.id });
            showToast('Feedback removed', 'info');
        } catch (error) {
            showToast('Failed to delete review', 'error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
            <div className="w-full sm:max-w-xl bg-white dark:bg-[#1c1c1e] rounded-t-[28px] sm:rounded-3xl border-t sm:border border-gray-200/90 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden">
                
                {/* Mobile Drawer Drag Indicator */}
                <div className="sm:hidden flex justify-center pt-2.5 pb-0.5 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-700" />
                </div>

                {/* Modal Header */}
                <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-gray-100 dark:border-zinc-800 flex items-start justify-between gap-3 shrink-0 bg-gray-50/60 dark:bg-zinc-900/40">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                            {shoot.shootNumber ? (
                                <Link
                                    href={`/shoots/${shoot.id}`}
                                    className="font-mono font-bold text-xs bg-gray-200/80 hover:bg-primary/10 dark:bg-zinc-800 text-primary hover:text-primary hover:underline px-2 py-0.5 rounded-md inline-flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Open Shoot Page"
                                >
                                    <span>#{shoot.shootNumber}</span>
                                    <ArrowUpRight size={10} className="opacity-70" />
                                </Link>
                            ) : null}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                                isDone 
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' 
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            }`}>
                                {isDone ? (
                                    <>
                                        <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
                                        <span>Review Done</span>
                                    </>
                                ) : (
                                    <>
                                        <Clock size={11} className="text-amber-600 dark:text-amber-400" />
                                        <span>Pending Review</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate leading-snug" title={shoot.title}>
                            {shoot.title}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {shoot.startTime ? format(parseISO(shoot.startTime), 'MMM d, yyyy') : ''} • {shoot.location || 'Location TBD'}
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4 space-y-4 custom-scrollbar">
                    
                    {/* Optional Footage Location (Hidden by default until data team builds server paths) */}
                    {SHOW_FOOTAGE_PATHS && (
                        <div className="rounded-2xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-900/30 p-3 sm:p-3.5">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <label className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                                    <Video size={14} className="text-primary" />
                                    Footage Location
                                </label>
                                {shoot.reviewVideoUrl && !isEditingVideoUrl && (
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingVideoUrl(true)}
                                        className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                                    >
                                        <Edit2 size={11} />
                                        Change
                                    </button>
                                )}
                            </div>

                            {isEditingVideoUrl ? (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={videoUrlInput}
                                            onChange={(e) => setVideoUrlInput(e.target.value)}
                                            placeholder="Drive link OR server path..."
                                            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSaveVideoUrl}
                                        disabled={updatingVideoUrl}
                                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                                    >
                                        {updatingVideoUrl ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-2 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-gray-200/80 dark:border-zinc-800">
                                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                                        {shoot.reviewVideoUrl}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(shoot.reviewVideoUrl || '');
                                            setHasCopiedPath(true);
                                            showToast('Path copied to clipboard!', 'success');
                                            setTimeout(() => setHasCopiedPath(false), 2000);
                                        }}
                                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 shrink-0 flex items-center gap-1 cursor-pointer"
                                    >
                                        {hasCopiedPath ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                        <span>{hasCopiedPath ? 'Copied' : 'Copy'}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Status Summary Banner */}
                    <div className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        isDone 
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/50' 
                            : 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-800/50'
                    }`}>
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
                                {isDone ? (
                                    <span className="text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                        <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                                        Review Closed / Done
                                    </span>
                                ) : (
                                    <span className="text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                                        <Clock size={15} className="text-blue-600 dark:text-blue-400" />
                                        Review in Progress
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400">
                                {isDone ? (
                                    shoot.reviewCompletedBy 
                                        ? `Completed by ${shoot.reviewCompletedBy}${shoot.reviewCompletedAt ? ` on ${format(parseISO(shoot.reviewCompletedAt), 'MMM d, h:mm a')}` : ''}. Review is closed and locked.`
                                        : 'Shoot review is marked as Done and locked.'
                                ) : reviews.length === 0 ? (
                                    'To complete this review, enter your rating and shoot feedback notes below.'
                                ) : (
                                    `${reviews.length} feedback note${reviews.length === 1 ? '' : 's'} logged.`
                                )}
                            </p>
                        </div>

                        {/* Status Action Buttons (Reopen only for Admin/Manager when closed) */}
                        {canManageStatus && isDone && (
                            <div className="shrink-0 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleReopen}
                                    disabled={updatingStatus}
                                    className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl text-xs font-semibold text-gray-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer shadow-2xs"
                                >
                                    Reopen Review
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Add Feedback Form - Only available when review is active/open */}
                    {isDone ? (
                        <div className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/40 p-4 text-center space-y-1.5">
                            <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">
                                This review is closed. No additional feedback can be posted.
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                {canManageStatus
                                    ? 'Admins can click "Reopen Review" above if more feedback is needed.'
                                    : 'Review has been finalized. Contact an admin if you need to reopen it.'}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5 sm:p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <MessageSquare size={14} className="text-primary" />
                                    Add Your Feedback
                                </span>
                            </div>

                            {/* Feedback Textarea */}
                            <div>
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="Enter your shoot feedback notes..."
                                    rows={4}
                                    className="w-full p-3 text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => handleSubmitFeedback(false)}
                                    disabled={submittingReview || !feedback.trim()}
                                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                                >
                                    <Send size={12} />
                                    <span>{submittingReview && !isSubmittingAndDone ? 'Saving...' : 'Post Note Only'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleSubmitFeedback(true)}
                                    disabled={submittingReview || !feedback.trim()}
                                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                                    title="Submits feedback and closes this review as completed"
                                >
                                    <CheckCircle2 size={13} />
                                    <span>{isSubmittingAndDone ? 'Completing...' : 'Submit & Mark Done ✓'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Feedback History List */}
                    <div className="space-y-2.5 pt-1">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                <MessageSquare size={13} className="text-primary" />
                                Feedback History ({reviews.length})
                            </h3>
                        </div>

                        {loadingReviews ? (
                            <div className="text-center py-6 text-xs text-muted-foreground flex items-center justify-center gap-2">
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Loading feedback history...</span>
                            </div>
                        ) : reviews.length === 0 ? (
                            <div className="text-center py-6 border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl bg-gray-50/40 dark:bg-zinc-900/20">
                                <Film size={26} className="mx-auto text-gray-300 dark:text-zinc-700 mb-1.5" />
                                <p className="text-xs font-medium text-gray-600 dark:text-zinc-400">No feedback entries yet</p>
                                <p className="text-[11px] text-gray-400 dark:text-zinc-500">Be the first crew member to share feedback above</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {reviews.map((rev) => {
                                    const canDelete = !isDone && (user?.id === rev.userId || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || ''));

                                    return (
                                        <div
                                            key={rev.id}
                                            className="p-3 sm:p-3.5 rounded-2xl border border-gray-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-2xs space-y-2"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                                        {(rev.userName || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                                                {rev.userName}
                                                            </span>
                                                            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.2 rounded border bg-gray-100 text-gray-600 border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                                                                {rev.userRole}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-gray-400 block">
                                                            {format(parseISO(rev.createdAt), 'MMM d, yyyy • h:mm a')}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {canDelete && (
                                                        <button
                                                            onClick={() => handleDeleteReview(rev.id)}
                                                            className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                                                            title="Delete feedback"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {rev.tags && rev.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {rev.tags.map(t => (
                                                        <span
                                                            key={t}
                                                            className="text-[10px] font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 px-2 py-0.5 rounded-md"
                                                        >
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            <p className="text-xs text-gray-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                                {rev.feedback}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>

                {/* Modal Footer */}
                <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2 shrink-0 bg-gray-50/60 dark:bg-zinc-900/40">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 transition-colors cursor-pointer text-center"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
}
