'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';
import { 
    useAllShootReviews, 
    useUpdateShootReviewStatus, 
    useBulkUpdateShootReviewStatus,
    useUpdateShootVideoUrl,
    useRemoveFromReview
} from '@/hooks/useShootReviews';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { useToast } from '@/lib/toast-context';
import { Shoot, ShootReviewStatus } from '@/types';
import { ShootReviewModal } from '@/components/ShootReviewModal';
import { 
    Film, CheckCircle2, Clock, Search, Video, ExternalLink, 
    ArrowLeft, Check, RefreshCw, 
    Filter, ChevronRight, Play, Grid3X3, 
    List, ArrowUpDown, ArrowUp, ArrowDown, X, Download, 
    CheckSquare, Square, ChevronLeft, Edit2, 
    Link2, SlidersHorizontal, AlertCircle, Calendar, MapPin, ArrowUpRight,
    FileVideo, HelpCircle, HardDrive, Copy, User as UserIcon, MessageSquare,
    Star, Eye
} from 'lucide-react';
import { format, parseISO, isToday, isAfter, isBefore } from 'date-fns';

type ViewMode = 'list' | 'card';
export type ReviewWorkflowTab = 'PENDING' | 'DONE' | 'ALL';
type VideoPresenceFilter = 'ALL' | 'HAS_VIDEO' | 'NO_VIDEO';
type TimeFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'PAST';
type RatingFilter = 'ALL' | 'RATED' | '4_PLUS' | 'UNRATED';
type SortField = 'shootNumber' | 'title' | 'date' | 'reviewStatus' | 'rating' | 'feedbackCount' | 'status';
type SortDirection = 'asc' | 'desc';

import { ShootWorkflowStage, getShootReviewStage, isServerStoragePath, getFootageSourceLabel } from '@/lib/shootReviewWorkflow';
export type { ShootWorkflowStage };
export { getShootReviewStage };

// Shared button styles (consistent 32px / 36px on 2xl sizing across the page)
const ICON_BTN =
    'inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const ICON_BTN_DANGER =
    'inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-background text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:border-red-900 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const TOOLBAR_BTN =
    'inline-flex items-center justify-center gap-1.5 h-8 2xl:h-9 px-3 rounded-lg text-xs 2xl:text-sm font-semibold border transition-all active:scale-[0.97] cursor-pointer shrink-0';
const SELECT_CLS =
    'w-full h-8 px-2.5 rounded-lg border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer';

const formatShootStatus = (status?: string) =>
    (status || '')
        .toLowerCase()
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');



export default function ShootReviewsDashboard() {
    const { user } = useAuth();
    const { department } = useDepartment();
    const { showToast } = useToast();

    // Data Queries
    const { data: shoots = [], isLoading: loadingShoots } = useShoots();
    const { data: assignments = [], isLoading: loadingAssignments } = useAssignments();
    const { data: users = [] } = useUsers();
    const { data: allReviews = [], isLoading: loadingReviews } = useAllShootReviews();
    
    // Mutations
    const { mutateAsync: updateStatus } = useUpdateShootReviewStatus();
    const { mutateAsync: bulkUpdateStatus, isPending: isBulkUpdating } = useBulkUpdateShootReviewStatus();

    // UI View State: Responsive default - Grid/Card on phone (< 768px), List on PC (>= 768px)
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        if (typeof window !== 'undefined') {
            try {
                // Clear obsolete unified key if it existed
                sessionStorage.removeItem('shootReviewsViewMode');
            } catch {
                // Ignore storage errors
            }
            const isMobile = window.innerWidth < 768;
            const key = isMobile ? 'shootReviewsMobileView' : 'shootReviewsDesktopView';
            try {
                const saved = sessionStorage.getItem(key);
                if (saved === 'card' || saved === 'list') return saved as ViewMode;
            } catch {
                // Ignore
            }
            return isMobile ? 'card' : 'list';
        }
        return 'list';
    });

    React.useEffect(() => {
        const handleResize = () => {
            const isMobile = window.innerWidth < 768;
            const key = isMobile ? 'shootReviewsMobileView' : 'shootReviewsDesktopView';
            try {
                const saved = sessionStorage.getItem(key);
                if (saved === 'card' || saved === 'list') {
                    setViewMode(saved as ViewMode);
                    return;
                }
            } catch {
                // Ignore
            }
            setViewMode(isMobile ? 'card' : 'list');
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleSetViewMode = (mode: ViewMode) => {
        setViewMode(mode);
        if (typeof window !== 'undefined') {
            const isMobile = window.innerWidth < 768;
            const key = isMobile ? 'shootReviewsMobileView' : 'shootReviewsDesktopView';
            try {
                sessionStorage.setItem(key, mode);
            } catch {
                // Ignore
            }
        }
    };
    // Default to 'PENDING' reviews awaiting feedback
    const [selectedTab, setSelectedTab] = useState<ReviewWorkflowTab>('PENDING');
    const [videoFilter, setVideoFilter] = useState<VideoPresenceFilter>('ALL');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
    const [shootStatusFilter, setShootStatusFilter] = useState<string>('ALL');
    const [ratingFilter, setRatingFilter] = useState<RatingFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

    // Sorting & Pagination
    const [sortField, setSortField] = useState<SortField>('shootNumber');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [pageSize, setPageSize] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Selection & Bulk Actions
    const [selectedShootIds, setSelectedShootIds] = useState<string[]>([]);
    const [selectedShoot, setSelectedShoot] = useState<Shoot | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
    const [togglingShootId, setTogglingShootId] = useState<string | null>(null);
    const [removingShootId, setRemovingShootId] = useState<string | null>(null);
    const { mutateAsync: removeFromReview } = useRemoveFromReview();

    const isAuthorized = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '');

    // Map reviews by shootId for fast O(1) lookup
    const reviewsByShoot = useMemo(() => {
        const map = new Map<string, typeof allReviews>();
        allReviews.forEach(r => {
            const list = map.get(r.shootId) || [];
            list.push(r);
            map.set(r.shootId, list);
        });
        return map;
    }, [allReviews]);

    // Categorized Workflow Metrics - STRICTLY scoped to shoots marked by Admin as reviewRequired!
    const metrics = useMemo(() => {
        let pending = 0;
        let done = 0;

        const visibleShoots = shoots.filter(s => {
            if (s.isNonShoot) return false;
            // Admin only decides: review MUST be required!
            if (!s.reviewRequired) return false;

            // For crew role, only show shoots where they are the assigned reviewer (or assigned crew)
            if (user?.role === 'CREW') {
                const isAssignedReviewer = s.reviewAssignedTo === user.id;
                const isAssignedCrew = assignments.some(a => a.shootId === s.id && a.userId === user.id);
                return isAssignedReviewer || isAssignedCrew;
            }
            return true;
        });

        visibleShoots.forEach(s => {
            if (s.reviewStatus === 'DONE') {
                done++;
            } else {
                pending++;
            }
        });

        const total = visibleShoots.length;
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

        return {
            total,
            pending,
            done,
            completionRate
        };
    }, [shoots, assignments, user]);

    // Handle Sorting Trigger
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
        setCurrentPage(1);
    };

    // Filter & Sort Pipeline
    const filteredAndSortedShoots = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const now = new Date();

        const result = shoots.filter(shoot => {
            // Exclude Non-Shoot / Internal tasks from video reviews
            if (shoot.isNonShoot) return false;

            // CRITICAL RULE: Admin only decides which shoot review is required!
            // All other shoots MUST NOT appear in the reviews hub!
            if (!shoot.reviewRequired) return false;

            // For crew role, only show shoots assigned to them
            if (user?.role === 'CREW') {
                const isAssignedReviewer = shoot.reviewAssignedTo === user.id;
                const isAssignedCrew = assignments.some(a => a.shootId === shoot.id && a.userId === user.id);
                if (!isAssignedReviewer && !isAssignedCrew) return false;
            }

            const isDone = shoot.reviewStatus === 'DONE';

            // 1. Workflow Tab Filter
            if (selectedTab === 'PENDING' && isDone) return false;
            if (selectedTab === 'DONE' && !isDone) return false;

            // 2. Video Presence Filter
            if (videoFilter === 'HAS_VIDEO' && !shoot.reviewVideoUrl) return false;
            if (videoFilter === 'NO_VIDEO' && !!shoot.reviewVideoUrl) return false;

            // 3. Shoot Status Filter
            if (shootStatusFilter !== 'ALL' && shoot.status !== shootStatusFilter) return false;

            // 4. Time Filter
            if (timeFilter !== 'ALL' && shoot.startTime) {
                try {
                    const sDate = parseISO(shoot.startTime);
                    if (timeFilter === 'TODAY' && !isToday(sDate)) return false;
                    if (timeFilter === 'UPCOMING' && !isAfter(sDate, now)) return false;
                    if (timeFilter === 'PAST' && !isBefore(sDate, now)) return false;
                } catch {
                    // Ignore date parse errors
                }
            }

            // 5. Rating Filter
            const shootReviews = reviewsByShoot.get(shoot.id) || [];
            const ratings = shootReviews.map(r => r.rating).filter(Boolean) as number[];
            const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

            if (ratingFilter === 'RATED' && avgRating === null) return false;
            if (ratingFilter === 'UNRATED' && avgRating !== null) return false;
            if (ratingFilter === '4_PLUS' && (avgRating === null || avgRating < 4)) return false;

            // 6. Search Query Filter
            if (query) {
                const titleMatch = (shoot.title || '').toLowerCase().includes(query);
                const numberMatch = shoot.shootNumber?.toString().includes(query);
                const locationMatch = (shoot.location || '').toLowerCase().includes(query);
                const reviewerMatch = (shoot.reviewAssignedToName || '').toLowerCase().includes(query);
                const pocMatch = (shoot.pocName || '').toLowerCase().includes(query);

                // Assigned crew check
                const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                const crewMatch = shootAssignments.some(a => {
                    const u = users.find(usr => usr.id === a.userId);
                    return u?.name.toLowerCase().includes(query);
                });

                if (!titleMatch && !numberMatch && !locationMatch && !reviewerMatch && !pocMatch && !crewMatch) {
                    return false;
                }
            }

            return true;
        });

        // Sorting
        result.sort((a, b) => {
            let comp = 0;
            switch (sortField) {
                case 'shootNumber':
                    comp = (a.shootNumber || 0) - (b.shootNumber || 0);
                    break;
                case 'title':
                    comp = (a.title || '').localeCompare(b.title || '');
                    break;
                case 'date': {
                    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
                    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
                    comp = timeA - timeB;
                    break;
                }
                case 'reviewStatus': {
                    const stA = a.reviewStatus === 'DONE' ? 1 : 0;
                    const stB = b.reviewStatus === 'DONE' ? 1 : 0;
                    comp = stA - stB;
                    break;
                }
                case 'rating': {
                    const rA = reviewsByShoot.get(a.id)?.map(r => r.rating).filter(Boolean) as number[] || [];
                    const rB = reviewsByShoot.get(b.id)?.map(r => r.rating).filter(Boolean) as number[] || [];
                    const avgA = rA.length > 0 ? rA.reduce((x, y) => x + y, 0) / rA.length : 0;
                    const avgB = rB.length > 0 ? rB.reduce((x, y) => x + y, 0) / rB.length : 0;
                    comp = avgA - avgB;
                    break;
                }
                case 'feedbackCount': {
                    const cA = (reviewsByShoot.get(a.id) || []).length;
                    const cB = (reviewsByShoot.get(b.id) || []).length;
                    comp = cA - cB;
                    break;
                }
                case 'status':
                    comp = (a.status || '').localeCompare(b.status || '');
                    break;
            }
            return sortDirection === 'asc' ? comp : -comp;
        });

        return result;
    }, [shoots, selectedTab, videoFilter, shootStatusFilter, timeFilter, ratingFilter, searchQuery, sortField, sortDirection, assignments, users, reviewsByShoot]);

    // Pagination slice
    const totalShoots = filteredAndSortedShoots.length;
    const totalPages = Math.ceil(totalShoots / pageSize) || 1;
    const paginatedShoots = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredAndSortedShoots.slice(start, start + pageSize);
    }, [filteredAndSortedShoots, currentPage, pageSize]);

    // Multi-Select Handlers
    const isAllVisibleSelected = paginatedShoots.length > 0 && paginatedShoots.every(s => selectedShootIds.includes(s.id));

    const toggleSelectAllVisible = () => {
        if (isAllVisibleSelected) {
            const visibleIds = new Set(paginatedShoots.map(s => s.id));
            setSelectedShootIds(prev => prev.filter(id => !visibleIds.has(id)));
        } else {
            const newIds = new Set([...selectedShootIds, ...paginatedShoots.map(s => s.id)]);
            setSelectedShootIds(Array.from(newIds));
        }
    };

    const toggleSelectShoot = (shootId: string) => {
        setSelectedShootIds(prev => 
            prev.includes(shootId) ? prev.filter(id => id !== shootId) : [...prev, shootId]
        );
    };

    // Bulk Actions
    const handleBulkMarkStatus = async (status: ShootReviewStatus) => {
        if (!isAuthorized) {
            showToast('Only managers and admins can bulk update review statuses', 'warning');
            return;
        }
        if (selectedShootIds.length === 0) return;

        const count = selectedShootIds.length;
        try {
            await bulkUpdateStatus({
                shootIds: selectedShootIds,
                status,
                completedBy: user?.name || user?.email || 'Admin'
            });
            showToast(
                `Successfully marked ${count} shoot${count > 1 ? 's' : ''} as ${status === 'DONE' ? 'Review Done' : 'Pending Review'}!`,
                'success'
            );
            setSelectedShootIds([]);
        } catch (error) {
            showToast('Failed to perform bulk update', 'error');
        }
    };

    // Quick One-Click Status Toggle
    const handleToggleQuickStatus = async (shoot: Shoot, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
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

    const handleOpenReviewModal = (shoot: Shoot) => {
        setSelectedShoot(shoot);
        setIsReviewModalOpen(true);
    };

    const handleRemoveFromReview = async (shoot: Shoot) => {
        const shootTitle = shoot.shootNumber ? `#${shoot.shootNumber} (${shoot.title})` : shoot.title;
        if (!window.confirm(`Remove ${shootTitle} from Shoot Reviews?`)) {
            return;
        }
        setRemovingShootId(shoot.id);
        try {
            await removeFromReview(shoot.id);
            showToast('Removed from Shoot Reviews', 'info');
        } catch (error) {
            console.error('Failed to remove from reviews:', error);
            showToast('Failed to remove from reviews', 'error');
        } finally {
            setRemovingShootId(null);
        }
    };

    // Export Reviews to CSV
    const handleExportCSV = (shootsToExport = filteredAndSortedShoots) => {
        if (shootsToExport.length === 0) {
            showToast('No shoots available to export', 'warning');
            return;
        }

        const headers = [
            'Shoot #',
            'Title',
            'Shoot Status',
            'Review Status',
            'Assigned Reviewer',
            'Scheduled Start',
            'Scheduled End',
            'Review Approved By',
            'Date',
            'Location',
            'Feedback Count',
            'Avg Rating'
        ];

        const rows = shootsToExport.map(s => {
            const reviews = reviewsByShoot.get(s.id) || [];
            const ratings = reviews.map(r => r.rating).filter(Boolean) as number[];
            const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : 'Unrated';
            
            return [
                s.shootNumber ? `#${s.shootNumber}` : '',
                `"${(s.title || '').replace(/"/g, '""')}"`,
                s.status,
                s.reviewStatus || 'PENDING',
                `"${(s.reviewAssignedToName || '').replace(/"/g, '""')}"`,
                s.reviewScheduledStartTime ? format(parseISO(s.reviewScheduledStartTime), 'yyyy-MM-dd HH:mm') : '',
                s.reviewScheduledEndTime ? format(parseISO(s.reviewScheduledEndTime), 'yyyy-MM-dd HH:mm') : '',
                `"${(s.reviewCompletedBy || '').replace(/"/g, '""')}"`,
                s.startTime ? format(parseISO(s.startTime), 'yyyy-MM-dd') : '',
                `"${(s.location || '').replace(/"/g, '""')}"`,
                reviews.length,
                avgRating
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `shoot_reviews_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('CSV exported successfully', 'success');
    };

    // Helper domain label for video URL or server storage path
    const getVideoDomainLabel = (url: string) => {
        return getFootageSourceLabel(url).label;
    };

    const hasActiveFilters = selectedTab !== 'PENDING' || videoFilter !== 'ALL' || timeFilter !== 'ALL' || shootStatusFilter !== 'ALL' || ratingFilter !== 'ALL' || searchQuery.trim() !== '';
    const advancedFilterCount = [videoFilter, timeFilter, shootStatusFilter, ratingFilter].filter(f => f !== 'ALL').length;

    const resetFilters = () => {
        setSelectedTab('PENDING');
        setVideoFilter('ALL');
        setTimeFilter('ALL');
        setShootStatusFilter('ALL');
        setRatingFilter('ALL');
        setSearchQuery('');
        setCurrentPage(1);
    };

    const isLoading = loadingShoots || loadingAssignments || loadingReviews;

    // Average rating helper (null when unrated)
    const getAvgRating = (shootId: string): string | null => {
        const ratings = (reviewsByShoot.get(shootId) || []).map(r => r.rating).filter(Boolean) as number[];
        return ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
    };

    // Sortable table header button
    const renderSortHeader = (field: SortField, label: string) => (
        <button
            type="button"
            onClick={() => handleSort(field)}
            className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer ${
                sortField === field ? 'text-foreground' : ''
            }`}
        >
            <span>{label}</span>
            {sortField === field ? (
                sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
            ) : (
                <ArrowUpDown size={11} className="opacity-40" />
            )}
        </button>
    );

    // Review status pill: interactive toggle for managers/admins, static badge for everyone else
    const renderStatusPill = (shoot: Shoot) => {
        const isDone = shoot.reviewStatus === 'DONE';
        const isToggling = togglingShootId === shoot.id;
        const base = 'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold border whitespace-nowrap transition-colors shrink-0';
        const tone = isDone
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
            : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800';
        const hover = isDone
            ? 'hover:bg-emerald-100 dark:hover:bg-emerald-950/70'
            : 'hover:bg-blue-100 dark:hover:bg-blue-950/70';
        const content = (
            <>
                {isToggling ? (
                    <RefreshCw size={10} className="animate-spin" />
                ) : isDone ? (
                    <CheckCircle2 size={11} />
                ) : (
                    <Clock size={11} />
                )}
                <span>{isDone ? 'Done' : 'Pending'}</span>
            </>
        );

        if (!isAuthorized) {
            return (
                <span className={`${base} ${tone} cursor-default`} title={isDone ? 'Review completed' : 'Pending review'}>
                    {content}
                </span>
            );
        }

        return (
            <button
                type="button"
                onClick={(e) => handleToggleQuickStatus(shoot, e)}
                disabled={isToggling}
                className={`${base} ${tone} ${hover} cursor-pointer shadow-2xs disabled:opacity-70`}
                title={isDone ? 'Click to reopen review' : 'Click to mark review done'}
            >
                {content}
            </button>
        );
    };

    return (
        <div className="w-full md:h-[calc(100dvh-62px)] 2xl:h-[calc(100dvh-66px)] flex flex-col px-0.5 sm:px-3 md:px-0 md:py-0.5 space-y-2.5 2xl:space-y-3 animate-fade-in md:overflow-hidden">
            
            {/* Top Streamlined Header Row */}
            <div className="flex items-center justify-between gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div className="w-8 h-8 2xl:w-9 2xl:h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Film size={16} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <h1 className="text-lg md:text-lg font-bold text-foreground truncate">
                                <span className="sm:hidden">Shoot Reviews</span>
                                <span className="hidden sm:inline">Shoot Video Reviews</span>
                            </h1>
                            <span className="hidden sm:inline text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                                Video Publication
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate hidden md:block">
                            Review recorded footage, leave timestamped feedback, and track quality sign-offs.
                        </p>
                    </div>
                </div>

                {/* Right Top Actions */}
                <div className="flex items-center gap-1.5 2xl:gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => handleExportCSV()}
                        className={`${TOOLBAR_BTN} max-sm:w-8 max-sm:px-0 justify-center bg-card text-foreground border-border hover:bg-muted shadow-2xs`}
                        title="Export current filtered list to CSV"
                        aria-label="Export CSV"
                    >
                        <Download size={14} />
                        <span className="hidden sm:inline">Export CSV</span>
                    </button>

                    <Link
                        href="/shoots"
                        className={`${TOOLBAR_BTN} bg-primary/10 text-primary border-primary/20 hover:bg-primary/15`}
                        title="Back to all shoots"
                    >
                        <ArrowLeft size={13} />
                        <span className="sm:hidden">Shoots</span>
                        <span className="hidden sm:inline">All Shoots</span>
                    </Link>
                </div>
            </div>

            {/* WORKFLOW METRIC STRIP */}
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 shrink-0">
                {/* 1. Pending Review */}
                <div 
                    onClick={() => { setSelectedTab('PENDING'); setCurrentPage(1); }}
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer shadow-2xs flex items-center justify-between min-w-0 active:scale-[0.98] ${
                        selectedTab === 'PENDING'
                            ? 'bg-gradient-to-br from-blue-500/15 via-blue-500/10 to-transparent border-blue-500/60 ring-2 ring-blue-500/30 dark:ring-blue-500/40'
                            : 'bg-card border-border hover:border-blue-400/50 hover:bg-blue-500/[0.02]'
                    }`}
                    title="Shoots assigned for review that are pending feedback & sign-off"
                >
                    <div className="min-w-0">
                        <span className="text-[10px] sm:text-[11px] font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1 truncate">
                            <Clock size={11} className="shrink-0" />
                            <span className="sm:hidden">Pending</span>
                            <span className="hidden sm:inline">Pending Review</span>
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-xl sm:text-2xl font-black text-blue-900 dark:text-blue-200">
                                {metrics.pending}
                            </span>
                            <span className="hidden sm:inline text-[10px] text-muted-foreground">shoots</span>
                        </div>
                    </div>
                    <div className="hidden sm:flex w-8 h-8 rounded-xl bg-blue-100/80 dark:bg-blue-950/60 items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Play size={12} className="fill-current ml-0.5" />
                    </div>
                </div>

                {/* 2. Reviews Done */}
                <div 
                    onClick={() => { setSelectedTab('DONE'); setCurrentPage(1); }}
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer shadow-2xs flex items-center justify-between min-w-0 active:scale-[0.98] ${
                        selectedTab === 'DONE'
                            ? 'bg-gradient-to-br from-emerald-500/15 via-emerald-500/10 to-transparent border-emerald-500/60 ring-2 ring-emerald-500/30 dark:ring-emerald-500/40'
                            : 'bg-card border-border hover:border-emerald-400/50 hover:bg-emerald-500/[0.02]'
                    }`}
                    title="Shoots where review is complete and approved"
                >
                    <div className="min-w-0">
                        <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 truncate">
                            <CheckCircle2 size={11} className="shrink-0" />
                            <span className="sm:hidden">Done</span>
                            <span className="hidden sm:inline">Reviews Done</span>
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-200">
                                {metrics.done}
                            </span>
                            <span className="hidden sm:inline text-[10px] text-muted-foreground">approved</span>
                        </div>
                    </div>
                    <div className="hidden sm:flex w-8 h-8 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Check size={14} strokeWidth={3} />
                    </div>
                </div>

                {/* 3. Total Reviews Assigned */}
                <div 
                    onClick={() => { setSelectedTab('ALL'); setCurrentPage(1); }}
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer shadow-2xs flex items-center justify-between min-w-0 active:scale-[0.98] ${
                        selectedTab === 'ALL'
                            ? 'bg-gradient-to-br from-purple-500/15 via-purple-500/10 to-transparent border-purple-500/60 ring-2 ring-purple-500/30 dark:ring-purple-500/40'
                            : 'bg-card border-border hover:border-purple-400/50 hover:bg-purple-500/[0.02]'
                    }`}
                    title="Total shoots marked by admin for quality review"
                >
                    <div className="min-w-0">
                        <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1 truncate">
                            <Film size={11} className="shrink-0" />
                            <span className="sm:hidden">All</span>
                            <span className="hidden sm:inline">Total Assigned</span>
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className="text-xl sm:text-2xl font-black text-purple-900 dark:text-purple-200">
                                {metrics.total}
                            </span>
                            <span className="hidden sm:inline text-[10px] text-muted-foreground">reviews</span>
                        </div>
                    </div>
                    <div className="hidden sm:flex w-8 h-8 rounded-xl bg-purple-100/80 dark:bg-purple-950/60 items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                        <Film size={14} />
                    </div>
                </div>

                {/* 4. Completion Rate */}
                <div className="hidden lg:flex p-2.5 sm:p-3 rounded-2xl border border-border bg-card shadow-2xs flex-col justify-center gap-1.5">
                    <div className="flex items-center justify-between">
                        <div className="min-w-0">
                            <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground flex items-center gap-1 truncate">
                                <CheckCircle2 size={11} className="shrink-0" />
                                Completion Rate
                            </span>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-xl sm:text-2xl font-black text-foreground">
                                    {metrics.completionRate}%
                                </span>
                                <span className="text-[10px] text-muted-foreground">signed off</span>
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                            <CheckCircle2 size={14} />
                        </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                            style={{ width: `${metrics.completionRate}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* STICKY BULK ACTION BAR */}
            {selectedShootIds.length > 0 && (
                <div className="bg-gray-900/95 dark:bg-zinc-800/95 text-white backdrop-blur-md px-3 sm:px-4 py-2 rounded-xl shadow-lg border border-gray-700 flex flex-wrap items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground text-xs font-black px-2 py-0.5 rounded-md">
                            {selectedShootIds.length}
                        </span>
                        <span className="text-xs font-medium">
                            shoot{selectedShootIds.length > 1 ? 's' : ''} selected
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                        {isAuthorized && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => handleBulkMarkStatus('DONE')}
                                    disabled={isBulkUpdating}
                                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
                                >
                                    <CheckCircle2 size={12} />
                                    <span>{isBulkUpdating ? 'Updating...' : 'Mark Done'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleBulkMarkStatus('PENDING')}
                                    disabled={isBulkUpdating}
                                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
                                >
                                    <Clock size={12} />
                                    <span>{isBulkUpdating ? 'Updating...' : 'Mark Pending'}</span>
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                const selected = shoots.filter(s => selectedShootIds.includes(s.id));
                                handleExportCSV(selected);
                            }}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-100 border border-gray-700 transition-all active:scale-[0.97] cursor-pointer"
                        >
                            <Download size={12} />
                            <span>Export ({selectedShootIds.length})</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSelectedShootIds([])}
                            className="inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* COMPACT TOOLBAR: Workflow Tabs + Search + Filters + View Mode */}
            <div className="bg-card border border-border p-1.5 sm:p-2 rounded-xl shadow-2xs space-y-2 shrink-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    
                    {/* Left: Workflow Stage Tabs (hidden at all sizes - the metric cards above act as tabs) */}
                    <div className="hidden items-center gap-1 bg-muted/70 p-1 rounded-lg overflow-x-auto custom-scrollbar shrink-0">
                        <button
                            onClick={() => { setSelectedTab('PENDING'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                                selectedTab === 'PENDING'
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'text-blue-700 dark:text-blue-400 hover:text-blue-800'
                            }`}
                        >
                            <Clock size={11} />
                            <span>Pending Review ({metrics.pending})</span>
                        </button>

                        <button
                            onClick={() => { setSelectedTab('DONE'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                                selectedTab === 'DONE'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-800'
                            }`}
                        >
                            <CheckCircle2 size={11} />
                            <span>Reviews Done ({metrics.done})</span>
                        </button>

                        <button
                            onClick={() => { setSelectedTab('ALL'); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                                selectedTab === 'ALL'
                                    ? 'bg-background text-foreground shadow-2xs font-bold'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <span>All Assigned ({metrics.total})</span>
                        </button>
                    </div>

                    {/* Right: Search, Filter Toggle, View Switcher */}
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-end min-w-0">
                        
                        {/* Search Bar */}
                        <div className="relative flex-1 min-w-0 md:max-w-sm lg:max-w-none">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                placeholder="Search title, #, reviewer, crew…"
                                aria-label="Search shoot reviews"
                                className="w-full pl-9 pr-8 text-xs 2xl:text-sm rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 h-8 2xl:h-9 transition-shadow"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                                    title="Clear search"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Filters Dropdown Toggle */}
                        <button
                            type="button"
                            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                            className={`${TOOLBAR_BTN} ${
                                showAdvancedFilters || advancedFilterCount > 0
                                    ? 'bg-primary/10 border-primary/30 text-primary'
                                    : 'bg-background border-input text-muted-foreground hover:text-foreground hover:bg-muted'
                            }`}
                            title="Toggle filters"
                        >
                            <SlidersHorizontal size={13} />
                            <span className="hidden sm:inline">Filters</span>
                            {advancedFilterCount > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                                    {advancedFilterCount}
                                </span>
                            )}
                        </button>

                        {/* View Mode Toggle */}
                        <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-lg shrink-0 h-8 2xl:h-9">
                            <button
                                type="button"
                                onClick={() => handleSetViewMode('list')}
                                className={`h-7 w-7 2xl:h-8 2xl:w-8 inline-flex items-center justify-center rounded-md transition-all cursor-pointer ${
                                    viewMode === 'list'
                                        ? 'bg-background text-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="List / Table View"
                            >
                                <List size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetViewMode('card')}
                                className={`h-7 w-7 2xl:h-8 2xl:w-8 inline-flex items-center justify-center rounded-md transition-all cursor-pointer ${
                                    viewMode === 'card'
                                        ? 'bg-background text-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="Card / Grid View"
                            >
                                <Grid3X3 size={15} />
                            </button>
                        </div>

                    </div>

                </div>

                {/* Collapsible Advanced Filters */}
                {showAdvancedFilters && (
                    <div className="pt-2 border-t border-border/70 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs animate-in fade-in duration-100">
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                                Video URL
                            </label>
                            <select
                                value={videoFilter}
                                onChange={(e) => { setVideoFilter(e.target.value as VideoPresenceFilter); setCurrentPage(1); }}
                                className={SELECT_CLS}
                            >
                                <option value="ALL">All Videos</option>
                                <option value="HAS_VIDEO">Has Video Link</option>
                                <option value="NO_VIDEO">Missing Video Link</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                                Shoot Status
                            </label>
                            <select
                                value={shootStatusFilter}
                                onChange={(e) => { setShootStatusFilter(e.target.value); setCurrentPage(1); }}
                                className={SELECT_CLS}
                            >
                                <option value="ALL">All Statuses</option>
                                <option value="CLOSED">Closed / Shoot Over</option>
                                <option value="SHOOT_IN_PROGRESS">In Progress</option>
                                <option value="CONFIRMED">Confirmed</option>
                                <option value="READY_FOR_SHOOT">Ready for Shoot</option>
                                <option value="OPEN">Open</option>
                                <option value="ON_HOLD">On Hold</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                                Date / Time
                            </label>
                            <select
                                value={timeFilter}
                                onChange={(e) => { setTimeFilter(e.target.value as TimeFilter); setCurrentPage(1); }}
                                className={SELECT_CLS}
                            >
                                <option value="ALL">All Dates</option>
                                <option value="TODAY">Today</option>
                                <option value="PAST">Past / Finished</option>
                                <option value="UPCOMING">Upcoming</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                                Feedback Rating
                            </label>
                            <select
                                value={ratingFilter}
                                onChange={(e) => { setRatingFilter(e.target.value as RatingFilter); setCurrentPage(1); }}
                                className={SELECT_CLS}
                            >
                                <option value="ALL">All Ratings</option>
                                <option value="4_PLUS">4+ Stars ⭐</option>
                                <option value="RATED">Any Rating</option>
                                <option value="UNRATED">Unrated (0 Reviews)</option>
                            </select>
                        </div>

                        {hasActiveFilters && (
                            <div className="col-span-2 sm:col-span-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                >
                                    <X size={12} />
                                    Reset all filters
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* MAIN DATA VIEW */}
            {isLoading ? (
                <div className="min-h-[260px] md:min-h-0 md:flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <RefreshCw size={22} className="animate-spin text-primary" />
                    <p className="text-xs font-medium">Loading shoot reviews...</p>
                </div>
            ) : filteredAndSortedShoots.length === 0 ? (
                <div className="min-h-[260px] md:min-h-0 md:flex-1 border border-dashed border-border rounded-xl bg-card/30 flex flex-col items-center justify-center p-6 space-y-2 text-center">
                    <Film size={32} className="text-muted-foreground/40 mb-1" />
                    <h3 className="text-sm font-bold text-foreground">
                        {selectedTab === 'PENDING' 
                            ? 'No shoots currently pending review' 
                            : selectedTab === 'DONE'
                            ? 'No completed reviews yet'
                            : 'No shoots match your criteria'}
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-sm">
                        {selectedTab === 'PENDING'
                            ? 'Shoots assigned for review by an Admin (after shoot is closed) will appear here.'
                            : selectedTab === 'DONE'
                            ? 'Shoots where quality review has been signed off will appear here.'
                            : 'Try selecting a different tab or clearing search filters.'}
                    </p>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="mt-1 inline-flex items-center h-8 px-3.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all cursor-pointer"
                        >
                            Reset Filters
                        </button>
                    )}
                </div>
            ) : viewMode === 'list' ? (
                
                /* =========================================================================
                   LIST VIEW: RESPONSIVE TABLE WITH WORKFLOW STAGES
                   ========================================================================= */
                <div className="rounded-xl border border-border bg-card shadow-2xs md:flex-1 md:min-h-0 flex flex-col overflow-hidden">
                    
                    {/* Internal Scrollable Table Body */}
                    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                        <table className="w-full min-w-[1000px] text-left border-collapse table-fixed">
                            
                            {/* Sticky Table Header */}
                            <thead className="sticky top-0 z-20 bg-muted/95 dark:bg-[#1f1f23]/95 backdrop-blur-xs border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                                <tr className="h-10">
                                    {/* Multi-Select Header Checkbox */}
                                    <th className="w-11 pl-3 pr-1 text-center">
                                        <button
                                            type="button"
                                            onClick={toggleSelectAllVisible}
                                            className="h-7 w-7 rounded-md cursor-pointer text-muted-foreground hover:text-foreground hover:bg-background/80 inline-flex items-center justify-center transition-colors"
                                            title={isAllVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
                                        >
                                            {isAllVisibleSelected ? (
                                                <CheckSquare size={15} className="text-primary" />
                                            ) : (
                                                <Square size={15} />
                                            )}
                                        </button>
                                    </th>
                                    <th className="w-[76px] px-3">{renderSortHeader('shootNumber', '#')}</th>
                                    <th className="px-3">{renderSortHeader('title', 'Shoot')}</th>
                                    <th className="w-[112px] px-3">{renderSortHeader('date', 'Date')}</th>
                                    <th className="w-[176px] px-3">Reviewer &amp; Schedule</th>
                                    <th className="w-[128px] px-3">{renderSortHeader('reviewStatus', 'Status')}</th>
                                    <th className="w-[108px] px-3">{renderSortHeader('feedbackCount', 'Feedback')}</th>
                                    <th className="w-[170px] px-3 hidden 2xl:table-cell">Crew</th>
                                    <th className="w-[184px] px-3 text-right">Actions</th>
                                </tr>
                            </thead>

                            {/* Table Body Rows */}
                            <tbody className="divide-y divide-border text-xs 2xl:text-[13px]">
                                {paginatedShoots.map((shoot) => {
                                    const isDone = shoot.reviewStatus === 'DONE';
                                    const isSelected = selectedShootIds.includes(shoot.id);
                                    const shootReviews = reviewsByShoot.get(shoot.id) || [];
                                    const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                                    const assignedCrew = shootAssignments.map(a => users.find(u => u.id === a.userId)).filter(Boolean);
                                    const avgRating = getAvgRating(shoot.id);
                                    const footageLabel = shoot.reviewVideoUrl ? getVideoDomainLabel(shoot.reviewVideoUrl) : null;

                                    return (
                                        <tr 
                                            key={shoot.id}
                                            className={`group/row transition-colors align-middle ${
                                                isSelected ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-muted/40'
                                            }`}
                                        >
                                            {/* Row Checkbox */}
                                            <td className="pl-3 pr-1 py-2.5 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectShoot(shoot.id)}
                                                    className="h-7 w-7 rounded-md cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center transition-colors"
                                                    title={isSelected ? 'Deselect' : 'Select'}
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare size={15} className="text-primary" />
                                                    ) : (
                                                        <Square size={15} />
                                                    )}
                                                </button>
                                            </td>

                                            {/* Shoot # */}
                                            <td className="px-3 py-2.5">
                                                <Link 
                                                    href={`/shoots/${shoot.id}`}
                                                    className="font-mono font-bold text-primary hover:underline underline-offset-2 transition-colors"
                                                    title="Open Shoot Page"
                                                >
                                                    {shoot.shootNumber ? `#${shoot.shootNumber}` : 'View'}
                                                </Link>
                                            </td>

                                            {/* Shoot Title + meta line (status, location, footage) */}
                                            <td className="px-3 py-2.5">
                                                <div className="min-w-0">
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleOpenReviewModal(shoot)}
                                                        className="block max-w-full truncate text-left font-semibold text-[13px] 2xl:text-sm text-foreground hover:text-primary transition-colors cursor-pointer"
                                                        title={`Open review for ${shoot.title}`}
                                                    >
                                                        {shoot.title}
                                                    </button>
                                                    <div className="mt-1 flex items-center gap-2 min-w-0 text-[11px] text-muted-foreground">
                                                        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-px rounded">
                                                            {formatShootStatus(shoot.status)}
                                                        </span>
                                                        {shoot.location && (
                                                            <span className="inline-flex items-center gap-1 min-w-0" title={shoot.location}>
                                                                <MapPin size={11} className="shrink-0 text-muted-foreground/70" />
                                                                <span className="truncate">{shoot.location}</span>
                                                            </span>
                                                        )}
                                                        {footageLabel && (
                                                            <span className="inline-flex items-center gap-1 shrink-0 text-primary font-medium" title={`Footage: ${footageLabel}`}>
                                                                <Film size={11} className="shrink-0" />
                                                                <span>{footageLabel}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Date */}
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                {shoot.startTime ? (
                                                    <div>
                                                        <span className="font-medium text-foreground block">
                                                            {format(parseISO(shoot.startTime), 'MMM d, yyyy')}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {format(parseISO(shoot.startTime), 'h:mm a')}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground/50">TBD</span>
                                                )}
                                            </td>

                                            {/* Assigned Reviewer & Schedule */}
                                            <td className="px-3 py-2.5">
                                                {shoot.reviewAssignedToName ? (
                                                    <div className="min-w-0">
                                                        <span className="font-semibold text-foreground flex items-center gap-1.5 min-w-0" title={shoot.reviewAssignedToName}>
                                                            <UserIcon size={12} className="text-primary shrink-0" />
                                                            <span className="truncate">{shoot.reviewAssignedToName}</span>
                                                        </span>
                                                        {shoot.reviewScheduledStartTime ? (
                                                            <span className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
                                                                <Clock size={11} className="shrink-0 text-muted-foreground/70" />
                                                                <span className="truncate">
                                                                    {format(parseISO(shoot.reviewScheduledStartTime), 'MMM d, h:mm a')}
                                                                    {shoot.reviewScheduledEndTime && (
                                                                        <> – {format(parseISO(shoot.reviewScheduledEndTime), 'h:mm a')}</>
                                                                    )}
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            <span className="mt-0.5 text-[11px] text-muted-foreground/60 italic block">No schedule set</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground/70 italic">Open to team</span>
                                                )}
                                            </td>

                                            {/* Review Status */}
                                            <td className="px-3 py-2.5">
                                                <div className="flex flex-col items-start gap-0.5 min-w-0">
                                                    {renderStatusPill(shoot)}
                                                    {isDone && shoot.reviewCompletedBy && (
                                                        <span className="max-w-full text-[10px] text-muted-foreground truncate" title={`Completed by ${shoot.reviewCompletedBy}`}>
                                                            by {shoot.reviewCompletedBy}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Feedback */}
                                            <td className="px-3 py-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenReviewModal(shoot)}
                                                    className="inline-flex items-center gap-2 h-7 px-2 -ml-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                                    title={`${shootReviews.length} feedback note${shootReviews.length === 1 ? '' : 's'}${avgRating ? ` • avg ${avgRating}★` : ''}`}
                                                >
                                                    <span className="inline-flex items-center gap-1 font-semibold">
                                                        <MessageSquare size={13} className="text-primary/70" />
                                                        {shootReviews.length}
                                                    </span>
                                                    {avgRating && (
                                                        <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400">
                                                            <Star size={11} className="fill-current" />
                                                            {avgRating}
                                                        </span>
                                                    )}
                                                </button>
                                            </td>

                                            {/* Crew (2xl+ only) */}
                                            <td className="px-3 py-2.5 hidden 2xl:table-cell">
                                                <div className="flex items-center gap-1 min-w-0">
                                                    {assignedCrew.length > 0 ? (
                                                        assignedCrew.slice(0, 2).map((c, i) => (
                                                            <span 
                                                                key={i} 
                                                                className="text-[11px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded truncate max-w-[70px]"
                                                                title={c?.name}
                                                            >
                                                                {c?.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-muted-foreground/40">—</span>
                                                    )}
                                                    {assignedCrew.length > 2 && (
                                                        <span
                                                            className="text-[11px] font-bold text-muted-foreground shrink-0"
                                                            title={assignedCrew.slice(2).map(c => c?.name).join(', ')}
                                                        >
                                                            +{assignedCrew.length - 2}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-3 py-2.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenReviewModal(shoot)}
                                                        className={`inline-flex items-center justify-center gap-1.5 h-8 min-w-[84px] px-3 rounded-lg text-xs font-semibold transition-all active:scale-[0.97] cursor-pointer shadow-2xs ${
                                                            isDone
                                                                ? 'bg-background text-foreground border border-border hover:bg-muted'
                                                                : 'bg-primary text-primary-foreground border border-primary hover:bg-primary/90'
                                                        }`}
                                                        title={isDone ? 'View completed review' : 'Open review'}
                                                    >
                                                        {isDone ? <Eye size={13} /> : <Play size={11} className="fill-current" />}
                                                        <span>{isDone ? 'View' : 'Review'}</span>
                                                    </button>
                                                    <Link
                                                        href={`/shoots/${shoot.id}`}
                                                        className={ICON_BTN}
                                                        title="Open Shoot Page"
                                                    >
                                                        <ExternalLink size={14} />
                                                    </Link>
                                                    {isAuthorized && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveFromReview(shoot)}
                                                            disabled={removingShootId === shoot.id}
                                                            className={ICON_BTN_DANGER}
                                                            title="Remove from Shoot Reviews"
                                                        >
                                                            {removingShootId === shoot.id ? (
                                                                <RefreshCw size={13} className="animate-spin text-red-600" />
                                                            ) : (
                                                                <X size={14} />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>

                        </table>
                    </div>

                </div>

            ) : (
                
                /* =========================================================================
                   CARD VIEW (Responsive Grid - Ideal for Phone / Mobile)
                   ========================================================================= */
                <div className="md:flex-1 md:min-h-0 md:overflow-y-auto space-y-3 custom-scrollbar md:pr-1 pb-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4 gap-3">
                        {paginatedShoots.map(shoot => {
                            const isDone = shoot.reviewStatus === 'DONE';
                            const isSelected = selectedShootIds.includes(shoot.id);
                            const shootReviews = reviewsByShoot.get(shoot.id) || [];
                            const footageLabel = shoot.reviewVideoUrl ? getVideoDomainLabel(shoot.reviewVideoUrl) : null;

                            return (
                                <div
                                    key={shoot.id}
                                    className={`rounded-2xl border transition-all duration-200 bg-card p-3.5 sm:p-4 shadow-2xs hover:shadow-md flex flex-col justify-between gap-3 ${
                                        isSelected 
                                            ? 'border-primary ring-2 ring-primary/40 bg-primary/5' 
                                            : isDone 
                                            ? 'border-emerald-200/90 dark:border-emerald-900/50 bg-gradient-to-b from-emerald-500/[0.03] to-transparent' 
                                            : 'border-blue-200/90 dark:border-blue-900/50 bg-gradient-to-b from-blue-500/[0.03] to-transparent'
                                    }`}
                                >
                                    <div className="space-y-2.5">
                                        {/* Card Top Row: Checkbox, Shoot # (Link to Shoot Page), Shoot Status, Quick Status */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectShoot(shoot.id)}
                                                    className="cursor-pointer text-muted-foreground hover:text-foreground shrink-0"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare size={16} className="text-primary" />
                                                    ) : (
                                                        <Square size={16} />
                                                    )}
                                                </button>
                                                
                                                {/* Clicking Shoot # opens Shoot page */}
                                                {shoot.shootNumber ? (
                                                    <Link
                                                        href={`/shoots/${shoot.id}`}
                                                        className="font-mono font-bold text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-0.5 rounded-lg border border-primary/25 transition-all cursor-pointer shrink-0 inline-flex items-center gap-1"
                                                        title="Open Shoot Details Page"
                                                    >
                                                        <span>#{shoot.shootNumber}</span>
                                                        <ArrowUpRight size={11} className="opacity-70" />
                                                    </Link>
                                                ) : (
                                                    <Link
                                                        href={`/shoots/${shoot.id}`}
                                                        className="text-[11px] font-bold text-primary hover:underline shrink-0 inline-flex items-center gap-0.5"
                                                        title="Open Shoot Details Page"
                                                    >
                                                        <span>Shoot Page</span>
                                                        <ArrowUpRight size={10} />
                                                    </Link>
                                                )}

                                                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 truncate">
                                                    {formatShootStatus(shoot.status)}
                                                </span>
                                            </div>

                                            {/* Quick Status Toggle */}
                                            {renderStatusPill(shoot)}
                                        </div>

                                        {/* Title: CLICKING TITLE OPENS REVIEW MODAL ONLY */}
                                        <div>
                                            <button 
                                                type="button"
                                                onClick={() => handleOpenReviewModal(shoot)}
                                                className="text-left font-bold text-sm sm:text-base text-foreground hover:text-primary transition-colors cursor-pointer block w-full line-clamp-2 leading-snug group"
                                                title={`Open review dialogue for ${shoot.title}`}
                                            >
                                                <span className="group-hover:underline underline-offset-2">{shoot.title}</span>
                                            </button>
                                            
                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
                                                {shoot.startTime && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar size={11} className="text-muted-foreground/70 shrink-0" />
                                                        <span>{format(parseISO(shoot.startTime), 'MMM d, yyyy')}</span>
                                                        <span className="text-[10px] text-muted-foreground/60">• {format(parseISO(shoot.startTime), 'h:mm a')}</span>
                                                    </span>
                                                )}
                                                {shoot.location && (
                                                    <span className="flex items-center gap-1 truncate max-w-[200px]">
                                                        <MapPin size={11} className="text-muted-foreground/70 shrink-0" />
                                                        <span className="truncate">{shoot.location}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Assigned Reviewer & Schedule Box */}
                                        <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <UserIcon size={12} className="text-primary shrink-0" />
                                                    <span className="font-bold text-foreground truncate text-[11px]">
                                                        {shoot.reviewAssignedToName ? `Reviewer: ${shoot.reviewAssignedToName}` : 'Open to Team'}
                                                    </span>
                                                </div>
                                                {isDone && shoot.reviewCompletedBy && (
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                                        by {shoot.reviewCompletedBy}
                                                    </span>
                                                )}
                                            </div>
                                            {shoot.reviewScheduledStartTime ? (
                                                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <Clock size={10} className="text-muted-foreground/70 shrink-0" />
                                                    <span className="truncate">
                                                        {format(parseISO(shoot.reviewScheduledStartTime), 'MMM d, h:mm a')}
                                                        {shoot.reviewScheduledEndTime && ` - ${format(parseISO(shoot.reviewScheduledEndTime), 'h:mm a')}`}
                                                    </span>
                                                </p>
                                            ) : (
                                                <p className="text-[10px] text-muted-foreground/60 italic">No schedule set</p>
                                            )}
                                            {footageLabel && (
                                                <div className="pt-1 border-t border-border/40 flex items-center gap-1 text-[10px] text-primary font-medium">
                                                    <Film size={10} className="shrink-0" />
                                                    <span>Footage: {footageLabel}</span>
                                                </div>
                                            )}
                                            {shoot.reviewNotes && (
                                                <p className="text-[10px] text-muted-foreground/80 line-clamp-2 italic pt-1 border-t border-border/40">
                                                    &ldquo;{shoot.reviewNotes}&rdquo;
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Footer: Feedback Count + Actions */}
                                    <div className="pt-2 border-t border-border/70 flex items-center justify-between gap-2">
                                        {/* Open Dialogue via Notes Count */}
                                        <button
                                            type="button"
                                            onClick={() => handleOpenReviewModal(shoot)}
                                            className="inline-flex items-center gap-2 h-8 px-2.5 rounded-lg bg-muted/60 hover:bg-primary/10 text-muted-foreground hover:text-primary text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
                                            title="View / Add Feedback"
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                <MessageSquare size={13} className="text-primary/70" />
                                                {shootReviews.length}
                                            </span>
                                            {getAvgRating(shoot.id) && (
                                                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                                                    <Star size={11} className="fill-current" />
                                                    {getAvgRating(shoot.id)}
                                                </span>
                                            )}
                                        </button>

                                        <div className="flex items-center gap-1.5">
                                            {/* Open Review Dialogue */}
                                            <button
                                                type="button"
                                                onClick={() => handleOpenReviewModal(shoot)}
                                                className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all active:scale-[0.97] cursor-pointer shadow-2xs whitespace-nowrap ${
                                                    isDone
                                                        ? 'bg-background text-foreground border border-border hover:bg-muted'
                                                        : 'bg-primary text-primary-foreground border border-primary hover:bg-primary/90'
                                                }`}
                                            >
                                                {isDone ? <Eye size={13} /> : <Play size={11} className="fill-current" />}
                                                <span>{isDone ? 'View Review' : 'Review'}</span>
                                            </button>

                                            {/* Open Shoot Page Link */}
                                            <Link
                                                href={`/shoots/${shoot.id}`}
                                                className={ICON_BTN}
                                                title="Open Shoot Page"
                                            >
                                                <ExternalLink size={14} />
                                            </Link>

                                            {/* Admin Remove Button */}
                                            {isAuthorized && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveFromReview(shoot)}
                                                    disabled={removingShootId === shoot.id}
                                                    className={ICON_BTN_DANGER}
                                                    title="Remove from Shoot Reviews"
                                                >
                                                    {removingShootId === shoot.id ? (
                                                        <RefreshCw size={13} className="animate-spin text-red-600" />
                                                    ) : (
                                                        <X size={14} />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Unified Compact Pagination Bar (for both List & Card views) */}
            {filteredAndSortedShoots.length > 0 && (
                <div className="px-3 py-1.5 border border-border bg-card rounded-xl shadow-2xs flex items-center justify-between gap-2 text-xs shrink-0">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <span>
                            <strong className="text-foreground">{(currentPage - 1) * pageSize + 1}</strong>–<strong className="text-foreground">{Math.min(currentPage * pageSize, totalShoots)}</strong> of <strong className="text-foreground">{totalShoots}</strong> shoots
                        </span>
                        <span className="text-muted-foreground/30">•</span>
                        <label className="inline-flex items-center gap-1.5">
                            <span className="hidden sm:inline">Rows</span>
                            <select
                                value={pageSize}
                                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                className="h-7 px-2 rounded-lg border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                            >
                                <option value={20}>20</option>
                                <option value={30}>30</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </label>
                    </div>

                    {/* Page Navigation */}
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className={ICON_BTN}
                            title="Previous page"
                        >
                            <ChevronLeft size={15} />
                        </button>
                        <span className="min-w-[52px] text-center font-semibold text-foreground tabular-nums">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className={ICON_BTN}
                            title="Next page"
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                </div>
            )}

            {/* Interactive Shoot Review Modal */}
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
