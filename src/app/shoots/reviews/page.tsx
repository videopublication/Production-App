'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';
import { useAllShootReviews, useUpdateShootReviewStatus } from '@/hooks/useShootReviews';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { useToast } from '@/lib/toast-context';
import { Shoot, ShootReviewStatus } from '@/types';
import { ShootReviewModal } from '@/components/ShootReviewModal';
import { 
    Film, CheckCircle2, Clock, Search, Video, ExternalLink, 
    Star, MessageSquare, ArrowLeft, Check, RefreshCw, 
    ShieldCheck, Sparkles, Filter, ChevronRight, Play, Eye
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

type ReviewFilterTab = 'ALL' | 'PENDING' | 'DONE';

export default function ShootReviewsDashboard() {
    const { user } = useAuth();
    const { department } = useDepartment();
    const { showToast } = useToast();

    // Data Queries
    const { data: shoots = [], isLoading: loadingShoots } = useShoots();
    const { data: assignments = [], isLoading: loadingAssignments } = useAssignments();
    const { data: users = [] } = useUsers();
    const { data: allReviews = [], isLoading: loadingReviews } = useAllShootReviews();
    const { mutateAsync: updateStatus } = useUpdateShootReviewStatus();

    // UI State
    const [selectedTab, setSelectedTab] = useState<ReviewFilterTab>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedShoot, setSelectedShoot] = useState<Shoot | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
    const [togglingShootId, setTogglingShootId] = useState<string | null>(null);

    const isAuthorized = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '');

    // Map reviews by shootId for fast lookup
    const reviewsByShoot = useMemo(() => {
        const map = new Map<string, typeof allReviews>();
        allReviews.forEach(r => {
            const list = map.get(r.shootId) || [];
            list.push(r);
            map.set(r.shootId, list);
        });
        return map;
    }, [allReviews]);

    // KPI Summary Metrics
    const metrics = useMemo(() => {
        let pending = 0;
        let done = 0;

        shoots.forEach(s => {
            if (s.reviewStatus === 'DONE') {
                done++;
            } else {
                pending++;
            }
        });

        const total = shoots.length;
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

        return { pending, done, total, completionRate };
    }, [shoots]);

    // Filtered Shoots
    const filteredShoots = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return shoots.filter(shoot => {
            // Status Tab Filter
            if (selectedTab === 'PENDING' && shoot.reviewStatus === 'DONE') return false;
            if (selectedTab === 'DONE' && shoot.reviewStatus !== 'DONE') return false;

            // Search Query Filter
            if (query) {
                const titleMatch = shoot.title.toLowerCase().includes(query);
                const numberMatch = shoot.shootNumber?.toString().includes(query);
                const locationMatch = shoot.location?.toLowerCase().includes(query);
                
                // Check assigned crew names
                const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                const crewMatch = shootAssignments.some(a => {
                    const u = users.find(usr => usr.id === a.userId);
                    return u?.name.toLowerCase().includes(query);
                });

                if (!titleMatch && !numberMatch && !locationMatch && !crewMatch) {
                    return false;
                }
            }

            return true;
        });
    }, [shoots, selectedTab, searchQuery, assignments, users]);

    const handleOpenReview = (shoot: Shoot) => {
        setSelectedShoot(shoot);
        setIsReviewModalOpen(true);
    };

    const handleToggleQuickStatus = async (shoot: Shoot, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isAuthorized) {
            showToast('Only managers and admins can change review status', 'warning');
            return;
        }

        const newStatus: ShootReviewStatus = shoot.reviewStatus === 'DONE' ? 'PENDING' : 'DONE';
        setTogglingShootId(shoot.id);
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
        } finally {
            setTogglingShootId(null);
        }
    };

    const isLoading = loadingShoots || loadingAssignments || loadingReviews;

    return (
        <div className="max-w-7xl mx-auto w-full p-3 sm:p-6 space-y-4 sm:space-y-6 animate-fade-in pb-20">
            
            {/* Header / Breadcrumb */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Link 
                            href="/shoots"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft size={13} />
                            <span>Shoots</span>
                        </Link>
                        <span className="text-muted-foreground/40">•</span>
                        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            Video Publication
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                        <Film className="w-7 h-7 text-primary shrink-0" />
                        Shoot Video Reviews
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                        Review footage quality, give timestamped feedback, and track completion across department shoots.
                    </p>
                </div>

                <Link
                    href="/shoots"
                    className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border border-border shrink-0"
                >
                    View All Shoots
                </Link>
            </div>

            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                
                {/* Pending Reviews Card */}
                <div 
                    onClick={() => setSelectedTab('PENDING')}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${
                        selectedTab === 'PENDING'
                            ? 'bg-amber-500/15 border-amber-500/40 dark:bg-amber-950/40 dark:border-amber-700/60 ring-2 ring-amber-500/30'
                            : 'bg-card border-border hover:border-amber-400/50 hover:bg-amber-500/[0.04]'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock size={14} className="text-amber-500" />
                            Pending Reviews
                        </span>
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-amber-900 dark:text-amber-200 tracking-tight">
                            {metrics.pending}
                        </span>
                        <span className="text-xs font-medium text-amber-700/80 dark:text-amber-400/80">
                            shoots awaiting sign-off
                        </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                        Requires video inspection and feedback from crew/leads.
                    </p>
                </div>

                {/* Reviews Done Card */}
                <div 
                    onClick={() => setSelectedTab('DONE')}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${
                        selectedTab === 'DONE'
                            ? 'bg-emerald-500/15 border-emerald-500/40 dark:bg-emerald-950/40 dark:border-emerald-700/60 ring-2 ring-emerald-500/30'
                            : 'bg-card border-border hover:border-emerald-400/50 hover:bg-emerald-500/[0.04]'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            Reviews Done
                        </span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-emerald-900 dark:text-emerald-200 tracking-tight">
                            {metrics.done}
                        </span>
                        <span className="text-xs font-medium text-emerald-700/80 dark:text-emerald-400/80">
                            shoots verified
                        </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                        Approved by managers with completed reviews.
                    </p>
                </div>

                {/* Overall Completion Rate */}
                <div 
                    onClick={() => setSelectedTab('ALL')}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer shadow-xs relative overflow-hidden group ${
                        selectedTab === 'ALL'
                            ? 'bg-primary/15 border-primary/40 dark:bg-primary/20 ring-2 ring-primary/30'
                            : 'bg-card border-border hover:border-primary/40 hover:bg-primary/[0.03]'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles size={14} />
                            Completion Rate
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">
                            {metrics.done} / {metrics.total}
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
                            {metrics.completionRate}%
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                            quality sign-off
                        </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-muted rounded-full h-1.5 mt-3 overflow-hidden">
                        <div 
                            className="bg-primary h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${metrics.completionRate}%` }}
                        />
                    </div>
                </div>

            </div>

            {/* Filter Toolbar & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card border border-border p-2.5 sm:p-3 rounded-2xl shadow-2xs">
                
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl shrink-0">
                    <button
                        onClick={() => setSelectedTab('ALL')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                            selectedTab === 'ALL'
                                ? 'bg-background text-foreground shadow-2xs'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        All ({metrics.total})
                    </button>
                    <button
                        onClick={() => setSelectedTab('PENDING')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                            selectedTab === 'PENDING'
                                ? 'bg-amber-500 text-white shadow-2xs'
                                : 'text-amber-700 dark:text-amber-400 hover:text-amber-800'
                        }`}
                    >
                        <Clock size={12} />
                        Pending ({metrics.pending})
                    </button>
                    <button
                        onClick={() => setSelectedTab('DONE')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                            selectedTab === 'DONE'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-800'
                        }`}
                    >
                        <CheckCircle2 size={12} />
                        Done ({metrics.done})
                    </button>
                </div>

                {/* Search Input */}
                <div className="relative flex-1 sm:max-w-xs">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search shoot, crew, or location..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>

            </div>

            {/* Shoots Review List */}
            {isLoading ? (
                <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
                    <RefreshCw size={24} className="animate-spin text-primary" />
                    <p className="text-xs font-medium">Loading shoots and reviews...</p>
                </div>
            ) : filteredShoots.length === 0 ? (
                <div className="py-16 border border-dashed border-border rounded-3xl text-center bg-card/40 flex flex-col items-center justify-center p-6 space-y-2">
                    <Film size={36} className="text-muted-foreground/40 mb-1" />
                    <h3 className="text-sm font-bold text-foreground">No shoots found</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">
                        {searchQuery 
                            ? 'No shoot videos matched your search query. Try clearing the search.'
                            : selectedTab === 'PENDING'
                            ? 'Great job! All shoot reviews are currently marked as Done.'
                            : 'No shoots found under this filter.'
                        }
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredShoots.map(shoot => {
                        const isDone = shoot.reviewStatus === 'DONE';
                        const shootReviews = reviewsByShoot.get(shoot.id) || [];
                        const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                        const assignedCrew = shootAssignments.map(a => users.find(u => u.id === a.userId)).filter(Boolean);
                        
                        // Calculate average rating
                        const ratings = shootReviews.map(r => r.rating).filter(Boolean) as number[];
                        const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

                        return (
                            <div
                                key={shoot.id}
                                className={`rounded-2xl border transition-all duration-200 bg-card p-4 sm:p-5 shadow-2xs hover:shadow-md ${
                                    isDone 
                                        ? 'border-emerald-200/80 dark:border-emerald-900/40 hover:border-emerald-400/80' 
                                        : 'border-amber-200/80 dark:border-amber-900/40 hover:border-amber-400/80'
                                }`}
                            >
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    
                                    {/* Left: Shoot Info */}
                                    <div className="space-y-1.5 min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {shoot.shootNumber && (
                                                <span className="font-mono font-bold text-xs bg-muted text-foreground px-2 py-0.5 rounded-md">
                                                    #{shoot.shootNumber}
                                                </span>
                                            )}
                                            
                                            {/* Review Status Badge */}
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

                                            {/* Shoot Workflow Status */}
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted px-2 py-0.5 rounded-md">
                                                {shoot.status}
                                            </span>
                                        </div>

                                        <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                                            <Link 
                                                href={`/shoots/${shoot.id}`}
                                                className="hover:text-primary transition-colors"
                                                title={shoot.title}
                                            >
                                                {shoot.title}
                                            </Link>
                                        </h3>

                                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {shoot.startTime && (
                                                <span>
                                                    {format(parseISO(shoot.startTime), 'EEE, MMM d, yyyy')}
                                                </span>
                                            )}
                                            {shoot.location && (
                                                <>
                                                    <span>•</span>
                                                    <span className="truncate max-w-[200px]">{shoot.location}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Video Link & Actions */}
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        
                                        {/* Watch Video Link */}
                                        {shoot.reviewVideoUrl ? (
                                            <a
                                                href={shoot.reviewVideoUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                                                title="Open video in new tab"
                                            >
                                                <Play size={12} className="fill-current" />
                                                <span>Watch Video</span>
                                                <ExternalLink size={11} />
                                            </a>
                                        ) : (
                                            <button
                                                onClick={() => handleOpenReview(shoot)}
                                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 hover:bg-amber-100/70 transition-colors cursor-pointer"
                                            >
                                                <Video size={12} />
                                                <span>Add Video Link</span>
                                            </button>
                                        )}

                                        {/* Review / Feedback Modal Trigger */}
                                        <button
                                            type="button"
                                            onClick={() => handleOpenReview(shoot)}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
                                        >
                                            <MessageSquare size={13} />
                                            <span>
                                                {shootReviews.length > 0 ? `Review (${shootReviews.length})` : 'Review & Feedback'}
                                            </span>
                                        </button>

                                        {/* Quick Toggle Status for Managers/Admins */}
                                        {isAuthorized && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleToggleQuickStatus(shoot, e)}
                                                disabled={togglingShootId === shoot.id}
                                                className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                                                    isDone
                                                        ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                }`}
                                                title={isDone ? 'Reopen review as Pending' : 'Mark review as Done'}
                                            >
                                                {togglingShootId === shoot.id ? (
                                                    <RefreshCw size={12} className="animate-spin" />
                                                ) : isDone ? (
                                                    'Reopen'
                                                ) : (
                                                    <>
                                                        <Check size={12} />
                                                        <span>Mark Done</span>
                                                    </>
                                                )}
                                            </button>
                                        )}

                                        {/* Link to Shoot details */}
                                        <Link
                                            href={`/shoots/${shoot.id}`}
                                            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                            title="View Shoot Details"
                                        >
                                            <ChevronRight size={16} />
                                        </Link>

                                    </div>

                                </div>

                                {/* Card Sub-Bar: Crew Chips & Feedback Summary */}
                                <div className="mt-3 pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                    
                                    {/* Crew Chips */}
                                    <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
                                        <span className="font-semibold text-foreground">Crew:</span>
                                        {assignedCrew.length > 0 ? (
                                            <span>
                                                {assignedCrew.slice(0, 3).map(c => c?.name).join(', ')}
                                                {assignedCrew.length > 3 && ` +${assignedCrew.length - 3} more`}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground/60 italic">No crew assigned</span>
                                        )}
                                    </div>

                                    {/* Review Stats */}
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        {avgRating && (
                                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                                                <Star size={12} className="fill-amber-400 text-amber-400" />
                                                <span>{avgRating}/5</span>
                                            </div>
                                        )}

                                        <span className="font-medium">
                                            {shootReviews.length} feedback{shootReviews.length === 1 ? '' : 's'}
                                        </span>

                                        {shoot.reviewCompletedBy && isDone && (
                                            <span className="text-[11px] text-muted-foreground">
                                                Approved by <strong className="text-foreground">{shoot.reviewCompletedBy}</strong>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Shoot Review Modal */}
            <ShootReviewModal
                isOpen={isReviewModalOpen}
                onClose={() => {
                    setIsReviewModalOpen(false);
                    setSelectedShoot(null);
                }}
                shoot={selectedShoot}
                users={users}
            />
        </div>
    );
}
