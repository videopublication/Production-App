'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';
import { 
    useAllShootReviews, 
    useUpdateShootReviewStatus, 
    useBulkUpdateShootReviewStatus,
    useUpdateShootVideoUrl 
} from '@/hooks/useShootReviews';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { useToast } from '@/lib/toast-context';
import { Shoot, ShootReviewStatus, ShootStatus } from '@/types';
import { ShootReviewModal } from '@/components/ShootReviewModal';
import { 
    Film, CheckCircle2, Clock, Search, Video, ExternalLink, 
    Star, MessageSquare, ArrowLeft, Check, RefreshCw, 
    Sparkles, Filter, ChevronRight, Play, Eye, Grid3X3, 
    List, ArrowUpDown, ArrowUp, ArrowDown, X, Download, 
    CheckSquare, Square, ChevronLeft, ChevronDown, Edit2, 
    Link2, Copy, SlidersHorizontal, AlertCircle
} from 'lucide-react';
import { format, parseISO, isToday, isAfter, isBefore } from 'date-fns';

type ViewMode = 'list' | 'card';
type ReviewStatusTab = 'ALL' | 'PENDING' | 'DONE';
type VideoPresenceFilter = 'ALL' | 'HAS_VIDEO' | 'NO_VIDEO';
type TimeFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'PAST';
type RatingFilter = 'ALL' | 'RATED' | '4_PLUS' | 'UNRATED';
type SortField = 'shootNumber' | 'title' | 'date' | 'reviewStatus' | 'rating' | 'feedbackCount' | 'status';
type SortDirection = 'asc' | 'desc';

export default function ShootReviewsDashboard() {
    const { user } = useAuth();
    const { department } = useDepartment();
    const { showToast } = useToast();

    // Data Queries
    const { data: shoots = [], isLoading: loadingShoots, refetch: refetchShoots } = useShoots();
    const { data: assignments = [], isLoading: loadingAssignments } = useAssignments();
    const { data: users = [] } = useUsers();
    const { data: allReviews = [], isLoading: loadingReviews, refetch: refetchReviews } = useAllShootReviews();
    
    // Mutations
    const { mutateAsync: updateStatus } = useUpdateShootReviewStatus();
    const { mutateAsync: bulkUpdateStatus, isPending: isBulkUpdating } = useBulkUpdateShootReviewStatus();
    const { mutateAsync: updateVideoUrl } = useUpdateShootVideoUrl();

    // UI View State
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedTab, setSelectedTab] = useState<ReviewStatusTab>('ALL');
    const [videoFilter, setVideoFilter] = useState<VideoPresenceFilter>('ALL');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
    const [shootStatusFilter, setShootStatusFilter] = useState<string>('ALL');
    const [ratingFilter, setRatingFilter] = useState<RatingFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

    // Sorting & Pagination
    const [sortField, setSortField] = useState<SortField>('shootNumber');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [pageSize, setPageSize] = useState<number>(25);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Selection & Bulk Actions
    const [selectedShootIds, setSelectedShootIds] = useState<string[]>([]);
    const [selectedShoot, setSelectedShoot] = useState<Shoot | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
    const [togglingShootId, setTogglingShootId] = useState<string | null>(null);

    // Inline URL Edit Popover State
    const [inlineUrlShootId, setInlineUrlShootId] = useState<string | null>(null);
    const [inlineUrlValue, setInlineUrlValue] = useState<string>('');
    const [savingInlineUrl, setSavingInlineUrl] = useState<boolean>(false);

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

    // Overall KPI Summary Metrics
    const metrics = useMemo(() => {
        let pending = 0;
        let done = 0;
        let withVideo = 0;

        shoots.forEach(s => {
            if (s.reviewStatus === 'DONE') {
                done++;
            } else {
                pending++;
            }
            if (s.reviewVideoUrl) {
                withVideo++;
            }
        });

        const total = shoots.length;
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

        return { pending, done, total, withVideo, completionRate };
    }, [shoots]);

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
            // 1. Review Status Tab
            if (selectedTab === 'PENDING' && shoot.reviewStatus === 'DONE') return false;
            if (selectedTab === 'DONE' && shoot.reviewStatus !== 'DONE') return false;

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
                    // Ignore date parsing errors
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
                const pocMatch = (shoot.pocName || '').toLowerCase().includes(query);

                // Assigned crew check
                const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                const crewMatch = shootAssignments.some(a => {
                    const u = users.find(usr => usr.id === a.userId);
                    return u?.name.toLowerCase().includes(query);
                });

                if (!titleMatch && !numberMatch && !locationMatch && !pocMatch && !crewMatch) {
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

    // Inline URL Save
    const handleSaveInlineUrl = async (shootId: string) => {
        if (!inlineUrlValue.trim()) {
            showToast('Please enter a video link', 'warning');
            return;
        }
        setSavingInlineUrl(true);
        try {
            await updateVideoUrl({ shootId, videoUrl: inlineUrlValue.trim() });
            showToast('Video link updated successfully', 'success');
            setInlineUrlShootId(null);
            setInlineUrlValue('');
        } catch (error) {
            showToast('Failed to update video link', 'error');
        } finally {
            setSavingInlineUrl(false);
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
            'Video URL',
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
                `"${(s.reviewVideoUrl || '').replace(/"/g, '""')}"`,
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

    // Helper domain badge for video URL
    const getVideoDomainLabel = (url: string) => {
        if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
        if (/vimeo\.com/i.test(url)) return 'Vimeo';
        if (/drive\.google\.com/i.test(url)) return 'Drive';
        return 'Link';
    };

    const hasActiveFilters = selectedTab !== 'ALL' || videoFilter !== 'ALL' || timeFilter !== 'ALL' || shootStatusFilter !== 'ALL' || ratingFilter !== 'ALL' || searchQuery.trim() !== '';

    const resetFilters = () => {
        setSelectedTab('ALL');
        setVideoFilter('ALL');
        setTimeFilter('ALL');
        setShootStatusFilter('ALL');
        setRatingFilter('ALL');
        setSearchQuery('');
        setCurrentPage(1);
    };

    const isLoading = loadingShoots || loadingAssignments || loadingReviews;

    return (
        <div className="max-w-7xl mx-auto w-full p-2.5 sm:p-5 space-y-4 animate-fade-in pb-24">
            
            {/* Header & Department Breadcrumb */}
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
                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            Video Publication
                        </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Film className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
                        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                            Shoot Video Reviews
                        </h1>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Quality control hub for reviewing shoot footage, giving crew feedback, and bulk managing review sign-offs.
                    </p>
                </div>

                {/* Right Header Actions */}
                <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                    <button
                        type="button"
                        onClick={() => handleExportCSV()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-card text-foreground border border-border hover:bg-muted transition-all shadow-2xs cursor-pointer"
                        title="Export current filtered list to CSV"
                    >
                        <Download size={13} />
                        <span>Export CSV</span>
                    </button>

                    <Link
                        href="/shoots"
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border border-border shrink-0"
                    >
                        All Shoots
                    </Link>
                </div>
            </div>

            {/* KPI Metric Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                
                {/* Total Shoots */}
                <div 
                    onClick={() => setSelectedTab('ALL')}
                    className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs relative overflow-hidden group ${
                        selectedTab === 'ALL'
                            ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
                            : 'bg-card border-border hover:border-primary/40'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs font-bold text-muted-foreground mb-1">
                        <span>Total Shoots</span>
                        <Film size={14} className="text-primary" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-foreground">
                        {metrics.total}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        In Video Publication
                    </p>
                </div>

                {/* Pending Reviews */}
                <div 
                    onClick={() => setSelectedTab('PENDING')}
                    className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs relative overflow-hidden group ${
                        selectedTab === 'PENDING'
                            ? 'bg-amber-500/15 border-amber-500/50 ring-2 ring-amber-500/30'
                            : 'bg-card border-border hover:border-amber-400/50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                        <span className="flex items-center gap-1">
                            <Clock size={13} />
                            Pending Review
                        </span>
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-amber-900 dark:text-amber-200">
                        {metrics.pending}
                    </div>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                        Awaiting sign-off
                    </p>
                </div>

                {/* Reviews Done */}
                <div 
                    onClick={() => setSelectedTab('DONE')}
                    className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs relative overflow-hidden group ${
                        selectedTab === 'DONE'
                            ? 'bg-emerald-500/15 border-emerald-500/50 ring-2 ring-emerald-500/30'
                            : 'bg-card border-border hover:border-emerald-400/50'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                        <span className="flex items-center gap-1">
                            <CheckCircle2 size={13} />
                            Reviews Done
                        </span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-emerald-900 dark:text-emerald-200">
                        {metrics.done}
                    </div>
                    <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                        Verified & approved
                    </p>
                </div>

                {/* Video Links & Completion */}
                <div className="p-3 sm:p-4 rounded-2xl border border-border bg-card shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-muted-foreground mb-1">
                        <span>Video Coverage</span>
                        <Video size={14} className="text-blue-500" />
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-2xl sm:text-3xl font-black text-foreground">
                            {metrics.withVideo}
                            <span className="text-xs font-normal text-muted-foreground ml-1">/ {metrics.total}</span>
                        </span>
                        <span className="text-xs font-bold text-primary">{metrics.completionRate}% Done</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden">
                        <div 
                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${metrics.completionRate}%` }}
                        />
                    </div>
                </div>

            </div>

            {/* STICKY / FLOATING BULK ACTION BAR */}
            {selectedShootIds.length > 0 && (
                <div className="sticky top-2 z-30 bg-gray-900/95 dark:bg-zinc-800/95 text-white backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-gray-700 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground text-xs font-black px-2 py-0.5 rounded-md">
                            {selectedShootIds.length}
                        </span>
                        <span className="text-xs font-medium">
                            shoot{selectedShootIds.length > 1 ? 's' : ''} selected
                        </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {isAuthorized && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => handleBulkMarkStatus('DONE')}
                                    disabled={isBulkUpdating}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                    title="Mark selected shoots as Review Done"
                                >
                                    <CheckCircle2 size={13} />
                                    <span>{isBulkUpdating ? 'Updating...' : 'Mark as Done'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleBulkMarkStatus('PENDING')}
                                    disabled={isBulkUpdating}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                    title="Mark selected shoots as Pending Review"
                                >
                                    <Clock size={13} />
                                    <span>{isBulkUpdating ? 'Updating...' : 'Mark as Pending'}</span>
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                const selected = shoots.filter(s => selectedShootIds.includes(s.id));
                                handleExportCSV(selected);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors cursor-pointer"
                        >
                            <Download size={13} />
                            <span>Export ({selectedShootIds.length})</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSelectedShootIds([])}
                            className="px-2.5 py-1.5 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* CONTROL TOOLBAR: Status Tabs, Search, View Mode, Filter Toggle */}
            <div className="bg-card border border-border p-2.5 sm:p-3 rounded-2xl shadow-2xs space-y-2.5">
                
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                    
                    {/* Left: Quick Status Filter Tabs */}
                    <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl overflow-x-auto custom-scrollbar shrink-0">
                        <button
                            onClick={() => { setSelectedTab('ALL'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                selectedTab === 'ALL'
                                    ? 'bg-background text-foreground shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            All ({metrics.total})
                        </button>
                        <button
                            onClick={() => { setSelectedTab('PENDING'); setCurrentPage(1); }}
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
                            onClick={() => { setSelectedTab('DONE'); setCurrentPage(1); }}
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

                    {/* Right Controls: Search, Advanced Filter Toggle, View Mode */}
                    <div className="flex items-center gap-2 flex-1 justify-end">
                        
                        {/* Search Bar */}
                        <div className="relative flex-1 sm:max-w-xs">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                placeholder="Search title, #, crew, location..."
                                className="w-full pl-9 pr-7 py-1.5 text-xs rounded-xl border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Advanced Filters Button */}
                        <button
                            type="button"
                            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
                                showAdvancedFilters || hasActiveFilters
                                    ? 'bg-primary/10 border-primary/30 text-primary font-bold'
                                    : 'bg-background border-input text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <SlidersHorizontal size={13} />
                            <span className="hidden sm:inline">Filters</span>
                            {hasActiveFilters && (
                                <span className="w-2 h-2 rounded-full bg-primary" />
                            )}
                        </button>

                        {/* View Mode Toggle */}
                        <div className="flex items-center bg-muted/70 p-0.5 rounded-xl border border-border shrink-0">
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                    viewMode === 'list'
                                        ? 'bg-background text-foreground shadow-2xs font-bold'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="List / Table View"
                            >
                                <List size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('card')}
                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                    viewMode === 'card'
                                        ? 'bg-background text-foreground shadow-2xs font-bold'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title="Card View"
                            >
                                <Grid3X3 size={15} />
                            </button>
                        </div>

                    </div>

                </div>

                {/* EXPANDED FILTER ROW */}
                {showAdvancedFilters && (
                    <div className="pt-2.5 border-t border-border/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs animate-in fade-in duration-150">
                        
                        {/* Video Link Presence */}
                        <div>
                            <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                                Video URL
                            </label>
                            <select
                                value={videoFilter}
                                onChange={(e) => { setVideoFilter(e.target.value as VideoPresenceFilter); setCurrentPage(1); }}
                                className="w-full px-2.5 py-1.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="ALL">All Videos</option>
                                <option value="HAS_VIDEO">Has Video Link</option>
                                <option value="NO_VIDEO">Missing Video Link</option>
                            </select>
                        </div>

                        {/* Shoot Status */}
                        <div>
                            <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                                Shoot Status
                            </label>
                            <select
                                value={shootStatusFilter}
                                onChange={(e) => { setShootStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-2.5 py-1.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="ALL">All Statuses</option>
                                <option value="OPEN">Open</option>
                                <option value="CONFIRMED">Confirmed</option>
                                <option value="READY_FOR_SHOOT">Ready for Shoot</option>
                                <option value="SHOOT_IN_PROGRESS">In Progress</option>
                                <option value="CLOSED">Closed</option>
                                <option value="ON_HOLD">On Hold</option>
                            </select>
                        </div>

                        {/* Time Filter */}
                        <div>
                            <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                                Date / Time
                            </label>
                            <select
                                value={timeFilter}
                                onChange={(e) => { setTimeFilter(e.target.value as TimeFilter); setCurrentPage(1); }}
                                className="w-full px-2.5 py-1.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="ALL">All Dates</option>
                                <option value="TODAY">Today</option>
                                <option value="UPCOMING">Upcoming</option>
                                <option value="PAST">Past</option>
                            </select>
                        </div>

                        {/* Rating Filter */}
                        <div>
                            <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                                Feedback Rating
                            </label>
                            <select
                                value={ratingFilter}
                                onChange={(e) => { setRatingFilter(e.target.value as RatingFilter); setCurrentPage(1); }}
                                className="w-full px-2.5 py-1.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="ALL">All Ratings</option>
                                <option value="4_PLUS">4+ Stars ⭐</option>
                                <option value="RATED">Any Rating</option>
                                <option value="UNRATED">Unrated (0 Reviews)</option>
                            </select>
                        </div>

                        {hasActiveFilters && (
                            <div className="col-span-2 sm:col-span-4 flex justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                                >
                                    Reset all filters
                                </button>
                            </div>
                        )}
                    </div>
                )}

            </div>

            {/* DATA VIEW CONTAINER */}
            {isLoading ? (
                <div className="py-20 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
                    <RefreshCw size={24} className="animate-spin text-primary" />
                    <p className="text-xs font-medium">Loading shoots and review statuses...</p>
                </div>
            ) : filteredAndSortedShoots.length === 0 ? (
                <div className="py-20 border border-dashed border-border rounded-3xl text-center bg-card/40 flex flex-col items-center justify-center p-6 space-y-2">
                    <Film size={38} className="text-muted-foreground/40 mb-1" />
                    <h3 className="text-sm font-bold text-foreground">No shoots match your criteria</h3>
                    <p className="text-xs text-muted-foreground max-w-sm">
                        {hasActiveFilters ? 'Try adjusting your filters or search query.' : 'No shoots found.'}
                    </p>
                    {hasActiveFilters && (
                        <button
                            onClick={resetFilters}
                            className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            ) : viewMode === 'list' ? (
                
                /* ========================
                   LIST VIEW (HIGH-CONTROL TABLE)
                   ======================== */
                <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden flex flex-col">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[960px]">
                            
                            {/* Table Header */}
                            <thead>
                                <tr className="border-b border-border bg-muted/50 text-[11px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                                    
                                    {/* Multi-Select Header Checkbox */}
                                    <th className="p-3 w-10 text-center">
                                        <button
                                            type="button"
                                            onClick={toggleSelectAllVisible}
                                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                                            title={isAllVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
                                        >
                                            {isAllVisibleSelected ? (
                                                <CheckSquare size={16} className="text-primary" />
                                            ) : (
                                                <Square size={16} />
                                            )}
                                        </button>
                                    </th>

                                    {/* Shoot Number */}
                                    <th className="p-3 w-20">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('shootNumber')}
                                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                                        >
                                            <span>#</span>
                                            {sortField === 'shootNumber' ? (
                                                sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                                            ) : (
                                                <ArrowUpDown size={11} className="opacity-40" />
                                            )}
                                        </button>
                                    </th>

                                    {/* Shoot Title & Location */}
                                    <th className="p-3 min-w-[200px]">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('title')}
                                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                                        >
                                            <span>Shoot Title</span>
                                            {sortField === 'title' ? (
                                                sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                                            ) : (
                                                <ArrowUpDown size={11} className="opacity-40" />
                                            )}
                                        </button>
                                    </th>

                                    {/* Date */}
                                    <th className="p-3 w-32">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('date')}
                                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                                        >
                                            <span>Date</span>
                                            {sortField === 'date' ? (
                                                sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                                            ) : (
                                                <ArrowUpDown size={11} className="opacity-40" />
                                            )}
                                        </button>
                                    </th>

                                    {/* Video Link */}
                                    <th className="p-3 w-36">
                                        <span>Video Link</span>
                                    </th>

                                    {/* Review Status (Sortable) */}
                                    <th className="p-3 w-36">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('reviewStatus')}
                                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                                        >
                                            <span>Review Status</span>
                                            {sortField === 'reviewStatus' ? (
                                                sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                                            ) : (
                                                <ArrowUpDown size={11} className="opacity-40" />
                                            )}
                                        </button>
                                    </th>

                                    {/* Feedback & Rating */}
                                    <th className="p-3 w-32">
                                        <button
                                            type="button"
                                            onClick={() => handleSort('rating')}
                                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                                        >
                                            <span>Feedback</span>
                                            {sortField === 'rating' ? (
                                                sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                                            ) : (
                                                <ArrowUpDown size={11} className="opacity-40" />
                                            )}
                                        </button>
                                    </th>

                                    {/* Assigned Crew */}
                                    <th className="p-3 w-36">
                                        <span>Crew</span>
                                    </th>

                                    {/* Actions */}
                                    <th className="p-3 w-28 text-right">
                                        <span>Actions</span>
                                    </th>

                                </tr>
                            </thead>

                            {/* Table Body */}
                            <tbody className="divide-y divide-border text-xs">
                                {paginatedShoots.map((shoot) => {
                                    const isDone = shoot.reviewStatus === 'DONE';
                                    const isSelected = selectedShootIds.includes(shoot.id);
                                    const shootReviews = reviewsByShoot.get(shoot.id) || [];
                                    const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                                    const assignedCrew = shootAssignments.map(a => users.find(u => u.id === a.userId)).filter(Boolean);

                                    // Average rating
                                    const ratings = shootReviews.map(r => r.rating).filter(Boolean) as number[];
                                    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

                                    return (
                                        <tr 
                                            key={shoot.id}
                                            className={`transition-colors hover:bg-muted/40 ${
                                                isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''
                                            }`}
                                        >
                                            {/* Row Checkbox */}
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectShoot(shoot.id)}
                                                    className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare size={16} className="text-primary" />
                                                    ) : (
                                                        <Square size={16} />
                                                    )}
                                                </button>
                                            </td>

                                            {/* Shoot # */}
                                            <td className="p-3 font-mono font-bold text-gray-500 dark:text-gray-400">
                                                {shoot.shootNumber ? (
                                                    <Link 
                                                        href={`/shoots/${shoot.id}`}
                                                        className="hover:text-primary transition-colors cursor-pointer"
                                                    >
                                                        #{shoot.shootNumber}
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted-foreground/40">-</span>
                                                )}
                                            </td>

                                            {/* Title, Location & Status Tag */}
                                            <td className="p-3">
                                                <div className="space-y-0.5 max-w-xs sm:max-w-md">
                                                    <div className="flex items-center gap-2">
                                                        <Link 
                                                            href={`/shoots/${shoot.id}`}
                                                            className="font-bold text-foreground hover:text-primary transition-colors truncate block"
                                                            title={shoot.title}
                                                        >
                                                            {shoot.title}
                                                        </Link>
                                                        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-tight bg-muted px-1.5 py-0.2 rounded shrink-0">
                                                            {shoot.status}
                                                        </span>
                                                    </div>
                                                    {shoot.location && (
                                                        <p className="text-[11px] text-muted-foreground truncate">
                                                            {shoot.location}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Date / Time */}
                                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                                                {shoot.startTime ? (
                                                    <div>
                                                        <span className="font-medium text-foreground block">
                                                            {format(parseISO(shoot.startTime), 'MMM d, yyyy')}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {format(parseISO(shoot.startTime), 'h:mm a')}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground/50">TBD</span>
                                                )}
                                            </td>

                                            {/* Video Link Column */}
                                            <td className="p-3">
                                                {shoot.reviewVideoUrl ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <a
                                                            href={shoot.reviewVideoUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                                                            title={`Watch video (${shoot.reviewVideoUrl})`}
                                                        >
                                                            <Play size={10} className="fill-current" />
                                                            <span>{getVideoDomainLabel(shoot.reviewVideoUrl)}</span>
                                                            <ExternalLink size={10} />
                                                        </a>

                                                        {/* Edit Video URL Icon */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setInlineUrlShootId(shoot.id);
                                                                setInlineUrlValue(shoot.reviewVideoUrl || '');
                                                            }}
                                                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                                                            title="Change video link"
                                                        >
                                                            <Edit2 size={11} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    inlineUrlShootId === shoot.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="url"
                                                                value={inlineUrlValue}
                                                                onChange={(e) => setInlineUrlValue(e.target.value)}
                                                                placeholder="Paste link..."
                                                                className="w-32 px-2 py-1 text-[11px] rounded-lg border border-primary bg-background focus:outline-none"
                                                                autoFocus
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveInlineUrl(shoot.id)}
                                                                disabled={savingInlineUrl}
                                                                className="px-2 py-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-lg cursor-pointer"
                                                            >
                                                                {savingInlineUrl ? '...' : 'Save'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setInlineUrlShootId(null)}
                                                                className="p-1 text-muted-foreground hover:text-foreground"
                                                            >
                                                                <X size={11} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setInlineUrlShootId(shoot.id);
                                                                setInlineUrlValue('');
                                                            }}
                                                            className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-lg border border-amber-200/80 dark:border-amber-800/80 hover:bg-amber-100 transition-colors cursor-pointer"
                                                        >
                                                            <Link2 size={10} />
                                                            <span>+ Add Link</span>
                                                        </button>
                                                    )
                                                )}
                                            </td>

                                            {/* Review Status One-Click Toggle Badge */}
                                            <td className="p-3">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleToggleQuickStatus(shoot, e)}
                                                    disabled={togglingShootId === shoot.id}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                                                        isDone 
                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100' 
                                                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                                                    }`}
                                                    title={isAuthorized ? 'Click to toggle status' : 'Review status'}
                                                >
                                                    {togglingShootId === shoot.id ? (
                                                        <RefreshCw size={11} className="animate-spin" />
                                                    ) : isDone ? (
                                                        <>
                                                            <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
                                                            <span>Done</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock size={12} className="text-amber-600 dark:text-amber-400" />
                                                            <span>Pending</span>
                                                        </>
                                                    )}
                                                </button>
                                                {shoot.reviewCompletedBy && isDone && (
                                                    <span className="block text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]" title={`Signed off by ${shoot.reviewCompletedBy}`}>
                                                        by {shoot.reviewCompletedBy}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Feedback & Rating */}
                                            <td className="p-3">
                                                <button
                                                    type="button"
                                                    onClick={() => { setSelectedShoot(shoot); setIsReviewModalOpen(true); }}
                                                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground group cursor-pointer"
                                                >
                                                    {avgRating ? (
                                                        <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                                            <Star size={12} className="fill-amber-400 text-amber-400" />
                                                            {avgRating}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground/60">-</span>
                                                    )}
                                                    <span className="text-[11px] font-medium bg-muted px-1.5 py-0.5 rounded-md group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                        {shootReviews.length} note{shootReviews.length === 1 ? '' : 's'}
                                                    </span>
                                                </button>
                                            </td>

                                            {/* Assigned Crew Chips */}
                                            <td className="p-3">
                                                <div className="flex items-center gap-1 flex-wrap max-w-[140px]">
                                                    {assignedCrew.length > 0 ? (
                                                        assignedCrew.slice(0, 2).map((c, i) => (
                                                            <span 
                                                                key={i} 
                                                                className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded truncate max-w-[80px]"
                                                                title={c?.name}
                                                            >
                                                                {c?.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-muted-foreground/40 text-[11px]">-</span>
                                                    )}
                                                    {assignedCrew.length > 2 && (
                                                        <span className="text-[10px] font-bold text-muted-foreground">
                                                            +{assignedCrew.length - 2}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="p-3 text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSelectedShoot(shoot); setIsReviewModalOpen(true); }}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
                                                    >
                                                        Review
                                                    </button>
                                                    <Link
                                                        href={`/shoots/${shoot.id}`}
                                                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                        title="View Shoot Details"
                                                    >
                                                        <ChevronRight size={14} />
                                                    </Link>
                                                </div>
                                            </td>

                                        </tr>
                                    );
                                })}
                            </tbody>

                        </table>
                    </div>

                    {/* Table Pagination Bar */}
                    <div className="p-3 border-t border-border bg-muted/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <span>
                                Showing <strong className="text-foreground">{(currentPage - 1) * pageSize + 1}</strong> to <strong className="text-foreground">{Math.min(currentPage * pageSize, totalShoots)}</strong> of <strong className="text-foreground">{totalShoots}</strong> shoots
                            </span>
                            <span className="text-muted-foreground/40">•</span>
                            <select
                                value={pageSize}
                                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                className="px-2 py-0.5 rounded-lg border border-input bg-background text-foreground text-xs focus:outline-none"
                            >
                                <option value={15}>15 per page</option>
                                <option value={25}>25 per page</option>
                                <option value={50}>50 per page</option>
                                <option value={100}>100 per page</option>
                            </select>
                        </div>

                        {/* Page Numbers */}
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-border bg-background text-foreground disabled:opacity-40 hover:bg-muted cursor-pointer"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="px-2.5 font-bold text-foreground">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-border bg-background text-foreground disabled:opacity-40 hover:bg-muted cursor-pointer"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>

            ) : (
                
                /* ========================
                   CARD VIEW (VISUAL GRID)
                   ======================== */
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {paginatedShoots.map(shoot => {
                            const isDone = shoot.reviewStatus === 'DONE';
                            const isSelected = selectedShootIds.includes(shoot.id);
                            const shootReviews = reviewsByShoot.get(shoot.id) || [];
                            const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                            const assignedCrew = shootAssignments.map(a => users.find(u => u.id === a.userId)).filter(Boolean);

                            const ratings = shootReviews.map(r => r.rating).filter(Boolean) as number[];
                            const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

                            return (
                                <div
                                    key={shoot.id}
                                    className={`rounded-2xl border transition-all duration-200 bg-card p-4 shadow-2xs hover:shadow-md flex flex-col justify-between ${
                                        isSelected 
                                            ? 'border-primary ring-2 ring-primary/40 bg-primary/5' 
                                            : isDone 
                                            ? 'border-emerald-200/80 dark:border-emerald-900/40 hover:border-emerald-400' 
                                            : 'border-amber-200/80 dark:border-amber-900/40 hover:border-amber-400'
                                    }`}
                                >
                                    <div className="space-y-3">
                                        
                                        {/* Card Header: Checkbox, Shoot #, Badges */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectShoot(shoot.id)}
                                                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare size={16} className="text-primary" />
                                                    ) : (
                                                        <Square size={16} />
                                                    )}
                                                </button>
                                                {shoot.shootNumber && (
                                                    <span className="font-mono font-bold text-xs bg-muted text-foreground px-2 py-0.5 rounded-md">
                                                        #{shoot.shootNumber}
                                                    </span>
                                                )}
                                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">
                                                    {shoot.status}
                                                </span>
                                            </div>

                                            {/* Status Button */}
                                            <button
                                                type="button"
                                                onClick={() => handleToggleQuickStatus(shoot)}
                                                disabled={togglingShootId === shoot.id}
                                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                                    isDone 
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' 
                                                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                                }`}
                                            >
                                                {togglingShootId === shoot.id ? (
                                                    <RefreshCw size={11} className="animate-spin" />
                                                ) : isDone ? (
                                                    <>
                                                        <CheckCircle2 size={11} className="text-emerald-600" />
                                                        <span>Done</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Clock size={11} className="text-amber-600" />
                                                        <span>Pending</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {/* Title & Date */}
                                        <div>
                                            <h3 className="font-bold text-base text-foreground line-clamp-1">
                                                <Link 
                                                    href={`/shoots/${shoot.id}`}
                                                    className="hover:text-primary transition-colors"
                                                >
                                                    {shoot.title}
                                                </Link>
                                            </h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {shoot.startTime ? format(parseISO(shoot.startTime), 'MMM d, yyyy') : 'Date TBD'}
                                                {shoot.location && ` • ${shoot.location}`}
                                            </p>
                                        </div>

                                        {/* Video Link */}
                                        <div className="pt-1">
                                            {shoot.reviewVideoUrl ? (
                                                <a
                                                    href={shoot.reviewVideoUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors w-full justify-center"
                                                >
                                                    <Play size={11} className="fill-current" />
                                                    <span>Watch Video ({getVideoDomainLabel(shoot.reviewVideoUrl)})</span>
                                                    <ExternalLink size={11} />
                                                </a>
                                            ) : (
                                                <button
                                                    onClick={() => { setSelectedShoot(shoot); setIsReviewModalOpen(true); }}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 hover:bg-amber-100/70 transition-colors w-full justify-center cursor-pointer"
                                                >
                                                    <Video size={12} />
                                                    <span>+ Add Video Link</span>
                                                </button>
                                            )}
                                        </div>

                                    </div>

                                    {/* Card Footer: Rating, Notes, Review Button */}
                                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            {avgRating && (
                                                <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                                    <Star size={11} className="fill-amber-400 text-amber-400" />
                                                    {avgRating}
                                                </span>
                                            )}
                                            <span>{shootReviews.length} note{shootReviews.length === 1 ? '' : 's'}</span>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => { setSelectedShoot(shoot); setIsReviewModalOpen(true); }}
                                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
                                        >
                                            Review
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Card Pagination */}
                    {totalPages > 1 && (
                        <div className="p-3 border border-border bg-card rounded-2xl flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                                Page <strong className="text-foreground">{currentPage}</strong> of <strong className="text-foreground">{totalPages}</strong>
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1 rounded-lg border border-border bg-background disabled:opacity-40 hover:bg-muted cursor-pointer"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1 rounded-lg border border-border bg-background disabled:opacity-40 hover:bg-muted cursor-pointer"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
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
