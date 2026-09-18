'use client';

import React, { useState, useEffect } from 'react';
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
    X, Star, Video, ExternalLink, CheckCircle2, Clock, 
    MessageSquare, Tag, Trash2, Send, ShieldCheck, 
    AlertCircle, Sparkles, RefreshCw, Check, Link2, 
    Film, Edit2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ShootReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    shoot: Shoot | null;
    users: User[];
}

const REVIEW_TAGS = [
    'Audio Quality',
    'Lighting & Exposure',
    'Camera & Framing',
    'Pacing & Editing',
    'Color Grading',
    'Graphics / Titles',
    'General / Other'
];

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
    const [rating, setRating] = useState<number>(5);
    const [feedback, setFeedback] = useState<string>('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [videoUrlInput, setVideoUrlInput] = useState<string>('');
    const [isEditingVideoUrl, setIsEditingVideoUrl] = useState<boolean>(false);

    useEffect(() => {
        if (shoot) {
            setVideoUrlInput(shoot.reviewVideoUrl || '');
            setIsEditingVideoUrl(!shoot.reviewVideoUrl);
            setRating(5);
            setFeedback('');
            setSelectedTags([]);
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

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const handleSaveVideoUrl = async () => {
        if (!videoUrlInput.trim()) {
            showToast('Please enter a valid video link', 'warning');
            return;
        }
        try {
            await updateVideoUrl({ shootId: shoot.id, videoUrl: videoUrlInput.trim() });
            setIsEditingVideoUrl(false);
            showToast('Video link saved successfully', 'success');
        } catch (error) {
            showToast('Failed to save video link', 'error');
        }
    };

    const handleToggleStatus = async () => {
        const newStatus: ShootReviewStatus = isDone ? 'PENDING' : 'DONE';
        try {
            await updateStatus({
                shootId: shoot.id,
                status: newStatus,
                completedBy: user?.name || user?.email || 'Admin'
            });
            showToast(
                newStatus === 'DONE' ? 'Review marked as Done!' : 'Review reopened as Pending',
                'success'
            );
        } catch (error) {
            showToast('Failed to update review status', 'error');
        }
    };

    const handleSubmitFeedback = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedback.trim()) {
            showToast('Please enter your feedback note', 'warning');
            return;
        }

        try {
            await addReview({
                shootId: shoot.id,
                departmentId: shoot.departmentId,
                userId: user?.id || 'guest',
                userName: user?.name || user?.email || 'Anonymous',
                userRole: user?.role || 'CREW',
                rating,
                feedback: feedback.trim(),
                tags: selectedTags
            });
            setFeedback('');
            setSelectedTags([]);
            showToast('Feedback submitted successfully', 'success');
        } catch (error) {
            showToast('Failed to submit feedback', 'error');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-white dark:bg-[#1c1c1e] rounded-3xl border border-gray-200/90 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
                
                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-zinc-800 flex items-start justify-between gap-3 shrink-0 bg-gray-50/50 dark:bg-zinc-900/40">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            {shoot.shootNumber && (
                                <span className="font-mono font-bold text-xs bg-gray-200/80 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200 px-2 py-0.5 rounded-md">
                                    #{shoot.shootNumber}
                                </span>
                            )}
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                isDone 
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' 
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            }`}>
                                {isDone ? (
                                    <>
                                        <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
                                        <span>Review Done</span>
                                    </>
                                ) : (
                                    <>
                                        <Clock size={12} className="text-amber-600 dark:text-amber-400" />
                                        <span>Pending Review</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate leading-snug" title={shoot.title}>
                            {shoot.title}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
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
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">
                    
                    {/* Video URL Section */}
                    <div className="rounded-2xl border border-gray-200/80 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-900/30 p-3.5 sm:p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <label className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                                <Video size={14} className="text-primary" />
                                Shoot Video Link
                            </label>
                            {shoot.reviewVideoUrl && !isEditingVideoUrl && (
                                <button
                                    type="button"
                                    onClick={() => setIsEditingVideoUrl(true)}
                                    className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                                >
                                    <Edit2 size={11} />
                                    Change Link
                                </button>
                            )}
                        </div>

                        {isEditingVideoUrl ? (
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="url"
                                        value={videoUrlInput}
                                        onChange={(e) => setVideoUrlInput(e.target.value)}
                                        placeholder="Paste YouTube, Vimeo, Google Drive, or video link..."
                                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveVideoUrl}
                                    disabled={updatingVideoUrl}
                                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                                >
                                    {updatingVideoUrl ? 'Saving...' : 'Save'}
                                </button>
                                {shoot.reviewVideoUrl && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setVideoUrlInput(shoot.reviewVideoUrl || '');
                                            setIsEditingVideoUrl(false);
                                        }}
                                        className="px-2.5 py-2 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-gray-200/80 dark:border-zinc-800">
                                <a
                                    href={shoot.reviewVideoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1.5"
                                >
                                    <ExternalLink size={13} className="shrink-0" />
                                    <span className="truncate">{shoot.reviewVideoUrl}</span>
                                </a>
                                <a
                                    href={shoot.reviewVideoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors shrink-0 flex items-center gap-1"
                                >
                                    <span>Watch</span>
                                    <ExternalLink size={11} />
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Status Action Card for Managers/Admins */}
                    <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isDone 
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60' 
                            : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/60'
                    }`}>
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
                                {isDone ? (
                                    <span className="text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                                        Review is Completed
                                    </span>
                                ) : (
                                    <span className="text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                                        <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                                        Review is Pending
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] sm:text-xs text-muted-foreground">
                                {isDone ? (
                                    shoot.reviewCompletedBy 
                                        ? `Approved by ${shoot.reviewCompletedBy}${shoot.reviewCompletedAt ? ` on ${format(parseISO(shoot.reviewCompletedAt), 'MMM d, h:mm a')}` : ''}`
                                        : 'Shoot video has been reviewed and verified.'
                                ) : (
                                    'Crew & managers can add feedback. Mark done when all quality criteria pass.'
                                )}
                            </p>
                        </div>

                        {canManageStatus && (
                            <button
                                type="button"
                                onClick={handleToggleStatus}
                                disabled={updatingStatus}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer ${
                                    isDone
                                        ? 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-zinc-700 hover:bg-gray-100'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                                }`}
                            >
                                {updatingStatus ? (
                                    <span className="flex items-center gap-1">
                                        <RefreshCw size={12} className="animate-spin" />
                                        Updating...
                                    </span>
                                ) : isDone ? (
                                    'Re-open Review'
                                ) : (
                                    '✓ Mark as Review Done'
                                )}
                            </button>
                        )}
                    </div>

                    {/* Submit New Review Form */}
                    <form onSubmit={handleSubmitFeedback} className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 space-y-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles size={14} className="text-amber-500" />
                                Add Your Feedback
                            </span>

                            {/* Star Rating Picker */}
                            <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() => setRating(star)}
                                        className="p-1 text-gray-300 dark:text-zinc-600 hover:scale-110 transition-transform cursor-pointer"
                                        title={`${star} Star${star > 1 ? 's' : ''}`}
                                    >
                                        <Star 
                                            size={18} 
                                            className={star <= rating ? 'fill-amber-400 text-amber-400' : 'currentColor'} 
                                        />
                                    </button>
                                ))}
                                <span className="text-xs font-bold ml-1 text-amber-600 dark:text-amber-400">
                                    {rating}/5
                                </span>
                            </div>
                        </div>

                        {/* Aspect Tags */}
                        <div>
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 block mb-1.5">
                                Select Focus Areas (Optional):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {REVIEW_TAGS.map(tag => {
                                    const isSelected = selectedTags.includes(tag);
                                    return (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-200'
                                            }`}
                                        >
                                            {tag}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Feedback Text Area */}
                        <div>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                rows={3}
                                placeholder="Enter specific feedback, timestamp notes, edits required, audio/lighting observations..."
                                className="w-full p-3 text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-950 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                            />
                        </div>

                        {/* Submit Button */}
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={submittingReview || !feedback.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                                <Send size={12} />
                                <span>{submittingReview ? 'Submitting...' : 'Post Feedback'}</span>
                            </button>
                        </div>
                    </form>

                    {/* Feedback History List */}
                    <div className="space-y-3 pt-2">
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
                                <Film size={28} className="mx-auto text-gray-300 dark:text-zinc-700 mb-1.5" />
                                <p className="text-xs font-medium text-gray-600 dark:text-zinc-400">No feedback entries yet</p>
                                <p className="text-[11px] text-gray-400 dark:text-zinc-500">Be the first to review this shoot video above</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {reviews.map((rev) => {
                                    const canDelete = user?.id === rev.userId || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

                                    return (
                                        <div
                                            key={rev.id}
                                            className="p-3.5 rounded-2xl border border-gray-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-2xs space-y-2"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    {/* User Avatar Initial */}
                                                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                                                        {(rev.userName || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                                                                {rev.userName}
                                                            </span>
                                                            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                                                                rev.userRole === 'ADMIN' || rev.userRole === 'SUPER_ADMIN'
                                                                    ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800'
                                                                    : rev.userRole === 'MANAGER'
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800'
                                                                    : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                                                            }`}>
                                                                {rev.userRole}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-gray-400">
                                                            {format(parseISO(rev.createdAt), 'MMM d, yyyy • h:mm a')}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {/* Stars */}
                                                    {rev.rating && (
                                                        <div className="flex items-center gap-0.5 text-amber-500">
                                                            {Array.from({ length: rev.rating }).map((_, i) => (
                                                                <Star key={i} size={11} className="fill-amber-400 text-amber-400" />
                                                            ))}
                                                        </div>
                                                    )}

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

                                            {/* Tags */}
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

                                            {/* Feedback Text */}
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
                <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2 shrink-0 bg-gray-50/50 dark:bg-zinc-900/40">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
}
