'use client';

import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { storage } from '@/lib/storage'; // Still used for type referencing if valid, or remove if unused, but kept for safety. Ideally hooks replace it but types might be needed. Alternatively just imports.
import { Plus, Calendar, MapPin, Clock, Search, Grid3X3, List, Filter, ChevronDown, Users, ArrowUpDown, ArrowUp, ArrowDown, Eye, EyeOff, FileText, X } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, isToday, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Button } from '@/components/Button';
import { formatWhatsAppMessage, openWhatsApp } from '@/lib/whatsapp';
import { PullToRefresh } from '@/components/PullToRefresh';

type ViewMode = 'card' | 'list';
type StatusFilter = 'ALL' | 'CONFIRMED' | 'CANCELLED';
type TimeFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'PAST' | 'CUSTOM';
type SortField = 'title' | 'date' | 'location' | 'crew' | 'status' | 'shootNumber';
type SortDirection = 'asc' | 'desc';

export default function ShootList() {
    const router = useRouter();
    const { user } = useAuth();

    // React Query Hooks
    const { data: shoots = [], isLoading: shootsLoading, refetch: refetchShoots } = useShoots();
    const { data: assignments = [], isLoading: assignmentsLoading, refetch: refetchAssignments } = useAssignments();
    const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useUsers();

    const loading = shootsLoading || assignmentsLoading || usersLoading;

    // UI State
    const [viewMode, setViewMode] = useState<ViewMode>('card');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
    const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

    const [crewFilter, setCrewFilter] = useState<string>('ALL'); // Crew filter state
    const [showFilters, setShowFilters] = useState(false);
    const [isCrewFilterOpen, setIsCrewFilterOpen] = useState(false);
    const [crewSearchQuery, setCrewSearchQuery] = useState('');
    const crewFilterRef = React.useRef<HTMLDivElement>(null);

    // Close crew filter on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (crewFilterRef.current && !crewFilterRef.current.contains(event.target as Node)) {
                setIsCrewFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sorting state (for list view)
    const [sortField, setSortField] = useState<SortField>('shootNumber');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const [expandedCrewShootId, setExpandedCrewShootId] = useState<string | null>(null);

    // Get crew details
    const getShootCrew = (shootId: string) => {
        const shootAssignments = assignments.filter(a => a.shootId === shootId);
        return shootAssignments.map(a => {
            const user = users.find(u => u.id === a.userId);
            return {
                id: a.id,
                name: user?.name || 'Unknown',
                role: a.role,
                userId: a.userId
            };
        });
    };

    // Get crew count for a shoot
    const getCrewCount = (shootId: string) => {
        return assignments.filter(a => a.shootId === shootId).length;
    };

    // Filtered shoots
    const filteredShoots = useMemo(() => {
        if (!user) return [];

        return shoots.filter(shoot => {
            // Role-based access control
            if (user.role === 'CREW') {
                const isAssigned = assignments.some(a => a.shootId === shoot.id && a.userId === user.id);
                if (!isAssigned) return false;
            }

            // Search filter
            const query = searchQuery.toLowerCase();
            const matchesSearch = !query ||
                shoot.title.toLowerCase().includes(query) ||
                shoot.location?.toLowerCase().includes(query) ||
                shoot.description?.toLowerCase().includes(query) ||
                (shoot.shootNumber && shoot.shootNumber.toString().includes(query));

            // Status filter
            const matchesStatus = statusFilter === 'ALL' || shoot.status === statusFilter;

            // Time filter
            let matchesTime = true;
            if (timeFilter !== 'ALL' && shoot.startTime) {
                const shootDate = parseISO(shoot.startTime);
                const now = new Date();

                if (timeFilter === 'TODAY') {
                    matchesTime = isToday(shootDate);
                } else if (timeFilter === 'UPCOMING') {
                    matchesTime = isAfter(shootDate, now);
                } else if (timeFilter === 'PAST') {
                    matchesTime = isBefore(shootDate, now) && !isToday(shootDate);
                } else if (timeFilter === 'CUSTOM' && customDateRange.start && customDateRange.end) {
                    const startDate = startOfDay(parseISO(customDateRange.start));
                    const endDate = endOfDay(parseISO(customDateRange.end));
                    matchesTime = isWithinInterval(shootDate, { start: startDate, end: endDate });
                }
            }

            // Crew Filter
            let matchesCrew = true;
            if (crewFilter !== 'ALL') {
                matchesCrew = assignments.some(a => a.shootId === shoot.id && a.userId === crewFilter);
            }

            return matchesSearch && matchesStatus && matchesTime && matchesCrew;
        });
    }, [shoots, searchQuery, statusFilter, timeFilter, crewFilter, user, assignments, customDateRange]);

    // Sorted shoots for list view
    const sortedShoots = useMemo(() => {
        return [...filteredShoots].sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'date':
                    if (!a.startTime) return 1;
                    if (!b.startTime) return -1;
                    comparison = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
                    break;
                case 'location':
                    comparison = (a.location || '').localeCompare(b.location || '');
                    break;
                case 'crew':
                    comparison = getCrewCount(a.id) - getCrewCount(b.id);
                    break;
                case 'status':
                    comparison = a.status.localeCompare(b.status);
                    break;
                case 'shootNumber':
                    // Sort by shoot number safely handle nulls
                    comparison = (a.shootNumber || 0) - (b.shootNumber || 0);
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [filteredShoots, sortField, sortDirection, assignments]);

    // Handle column sort click
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Sort indicator component
    const SortIndicator = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowUpDown size={12} style={{ color: '#9ca3af' }} />;
        }
        return sortDirection === 'asc'
            ? <ArrowUp size={12} style={{ color: '#3b82f6' }} />
            : <ArrowDown size={12} style={{ color: '#3b82f6' }} />;
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'CONFIRMED':
                return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
            case 'CANCELLED':
                return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
            default:
                return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
        }
    };
    const handleRefresh = async () => {
        await Promise.all([
            refetchShoots(),
            refetchAssignments(),
            refetchUsers()
        ]);
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-12 bg-gray-200 rounded w-full"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-48 bg-gray-200 rounded-2xl"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="px-1 py-2 sm:p-6 space-y-3 sm:space-y-6 max-w-7xl mx-auto min-h-[calc(100vh-80px)]">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 px-2 sm:px-0">
                    <div>
                        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">Shoots</h1>
                        <p className="text-xs sm:text-sm mt-0.5 sm:mt-1 text-gray-500 dark:text-gray-400">Manage upcoming productions</p>
                    </div>

                    <div className="flex gap-2">
                        {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const headers = ['Shoot ID', 'Title', 'Date', 'Time', 'Location', 'Status', 'Crew Count', 'Crew Names', 'Description'];
                                    const rows = filteredShoots.map(shoot => {
                                        const crew = getShootCrew(shoot.id);
                                        const date = shoot.startTime ? format(parseISO(shoot.startTime), 'yyyy-MM-dd') : '';
                                        const time = shoot.startTime ? format(parseISO(shoot.startTime), 'HH:mm') : '';
                                        const crewNames = crew.map(c => c.name).join(', ');

                                        return [
                                            shoot.shootNumber || '',
                                            `"${shoot.title.replace(/"/g, '""')}"`, // Escape quotes
                                            date,
                                            time,
                                            `"${(shoot.location || '').replace(/"/g, '""')}"`,
                                            shoot.status,
                                            crew.length,
                                            `"${crewNames}"`,
                                            `"${(shoot.description || '').replace(/"/g, '""')}"`
                                        ].join(',');
                                    });

                                    const csvContent = [headers.join(','), ...rows].join('\n');
                                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.setAttribute('href', url);
                                    link.setAttribute('download', `shoots_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }}
                                className="flex gap-2 shadow-sm rounded-xl h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold bg-white dark:bg-[#1c1c1e] text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <FileText size={16} strokeWidth={2.5} />
                                <span className="hidden sm:inline">Export CSV</span>
                                <span className="sm:hidden">CSV</span>
                            </Button>
                        )}
                        {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                            <Link href="/shoots/new" className="shrink-0">
                                <Button variant="primary" className="gap-2 shadow-lg rounded-xl h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold">
                                    <Plus size={16} strokeWidth={2.5} />
                                    <span className="hidden xs:inline">New Shoot</span>
                                    <span className="xs:hidden">New</span>
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Search & Filters Bar */}
                <div className="rounded-xl p-2 sm:p-4 shadow-sm space-y-3 sm:space-y-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search title, location, ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-11 sm:pl-12 pr-4 py-2 sm:py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                            />
                        </div>

                        {/* View Toggle & Filter Button */}
                        <div className="flex gap-2">
                            {/* View Mode Toggle */}
                            <div className="flex rounded-lg p-1 shrink-0 bg-gray-100 dark:bg-gray-800">
                                <button
                                    onClick={() => setViewMode('card')}
                                    className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'card'
                                        ? 'bg-white dark:bg-[#1c1c1e] shadow text-gray-900 dark:text-white'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <Grid3X3 size={18} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'list'
                                        ? 'bg-white dark:bg-[#1c1c1e] shadow text-gray-900 dark:text-white'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <List size={18} />
                                </button>
                            </div>

                            {/* Filter Toggle */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${showFilters
                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-transparent'
                                    }`}
                            >
                                <Filter size={16} />
                                <span className="hidden sm:inline">Filters</span>
                                <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Mobile Sort Controls (Visible on mobile for quick access, or desktop if preferred) */}
                    <div className="flex sm:hidden overflow-x-auto gap-2 pb-1 scrollbar-hide">
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value as SortField)}
                            className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded-lg px-2 py-1.5 border-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="date">Date</option>
                            <option value="shootNumber">Shoot ID</option>
                            <option value="title">Shoot Name</option>
                            <option value="status">Status</option>
                        </select>
                        <button
                            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                            className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 flex items-center gap-1"
                        >
                            {sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            <span className="text-xs">{sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>
                        </button>
                    </div>

                    {/* Filter Options */}
                    {showFilters && (
                        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 pt-2 sm:pt-3 border-t border-gray-200 dark:border-gray-800">
                            {/* Status Filter */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs sm:text-sm font-medium shrink-0 text-gray-500 dark:text-gray-400">Status:</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {(['ALL', 'CONFIRMED', 'CANCELLED'] as StatusFilter[]).map(status => (
                                        <button
                                            key={status}
                                            onClick={() => setStatusFilter(status)}
                                            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all ${statusFilter === status
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                }`}
                                        >
                                            {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Time Filter */}
                            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs sm:text-sm font-medium shrink-0 text-gray-500 dark:text-gray-400">When:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(['ALL', 'TODAY', 'UPCOMING', 'PAST', 'CUSTOM'] as TimeFilter[]).map(time => (
                                            <button
                                                key={time}
                                                onClick={() => setTimeFilter(time)}
                                                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all ${timeFilter === time
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                    }`}
                                            >
                                                {time === 'ALL' ? 'All' : time.charAt(0) + time.slice(1).toLowerCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Date Inputs */}
                                {timeFilter === 'CUSTOM' && (
                                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                        <input
                                            type="date"
                                            value={customDateRange.start}
                                            onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                                            className="px-2 py-1 text-xs rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                                            placeholder="Start Date"
                                        />
                                        <span className="text-gray-400">-</span>
                                        <input
                                            type="date"
                                            value={customDateRange.end}
                                            onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                                            className="px-2 py-1 text-xs rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                                            placeholder="End Date"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Sort Filter (Visible inside filters on Desktop) */}
                            <div className="hidden sm:flex flex-wrap items-center gap-2">
                                <span className="text-xs sm:text-sm font-medium shrink-0 text-gray-500 dark:text-gray-400">Sort By:</span>
                                <div className="flex gap-2">
                                    <select
                                        value={sortField}
                                        onChange={(e) => setSortField(e.target.value as SortField)}
                                        className="appearance-none pl-3 pr-8 py-1.5 rounded-md text-xs sm:text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                                    >
                                        <option value="date">Date</option>
                                        <option value="shootNumber">Shoot ID</option>
                                        <option value="title">Shoot Name</option>
                                        <option value="status">Status</option>
                                    </select>
                                    <button
                                        onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                        className="px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-1.5 transition-colors"
                                    >
                                        {sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                        <span className="text-xs sm:text-sm">{sortDirection === 'asc' ? 'Ascending' : 'Descending'}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Crew Filter (Admin Only) */}
                            {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                                <div className="flex flex-wrap items-center gap-2" ref={crewFilterRef}>
                                    <span className="text-xs sm:text-sm font-medium shrink-0 text-gray-500 dark:text-gray-400">Assigned To:</span>
                                    <div className="relative">
                                        <button
                                            onClick={() => {
                                                setIsCrewFilterOpen(!isCrewFilterOpen);
                                                if (!isCrewFilterOpen) setCrewSearchQuery('');
                                            }}
                                            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md border text-sm transition-all cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 min-w-[140px] justify-between group"
                                        >
                                            <span className={`truncate max-w-[100px] ${crewFilter === 'ALL' ? 'text-gray-700 dark:text-gray-300' : 'text-blue-600 dark:text-blue-400 font-medium'}`}>
                                                {crewFilter === 'ALL' ? 'All Crew' : users.find(u => u.id === crewFilter)?.name || 'Unknown'}
                                            </span>
                                            <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isCrewFilterOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {/* Custom Dropdown */}
                                        {isCrewFilterOpen && (
                                            <div className="absolute left-0 top-full mt-2 w-[220px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
                                                <div className="p-2 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                                                    <div className="relative">
                                                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            value={crewSearchQuery}
                                                            onChange={(e) => setCrewSearchQuery(e.target.value)}
                                                            placeholder="Search..."
                                                            className="w-full text-xs pl-8 pr-2 py-1.5 bg-gray-50 dark:bg-gray-900 border-none rounded-md focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500"
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto py-1 custom-scrollbar">
                                                    <button
                                                        onClick={() => { setCrewFilter('ALL'); setIsCrewFilterOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${crewFilter === 'ALL'
                                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                            } ${crewSearchQuery ? 'hidden' : ''}`}
                                                    >
                                                        All Crew
                                                    </button>
                                                    {users
                                                        .filter(u => u.name.toLowerCase().includes(crewSearchQuery.toLowerCase()))
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .map(u => (
                                                            <button
                                                                key={u.id}
                                                                onClick={() => { setCrewFilter(u.id); setIsCrewFilterOpen(false); }}
                                                                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${crewFilter === u.id
                                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                                    }`}
                                                            >
                                                                <div className="w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[8px] font-bold text-gray-500">
                                                                    {u.name.charAt(0)}
                                                                </div>
                                                                <span className="truncate">{u.name}</span>
                                                            </button>
                                                        ))}
                                                    {users.filter(u => u.name.toLowerCase().includes(crewSearchQuery.toLowerCase())).length === 0 && (
                                                        <div className="px-3 py-2 text-xs text-center text-gray-500">
                                                            No matches
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Clear Filters (Visible if any filter active) */}
                            {(statusFilter !== 'ALL' || timeFilter !== 'ALL' || crewFilter !== 'ALL') && (
                                <button
                                    onClick={() => {
                                        setStatusFilter('ALL');
                                        setTimeFilter('ALL');
                                        setCrewFilter('ALL');
                                        setCustomDateRange({ start: '', end: '' });
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                >
                                    <X size={12} />
                                    Clear
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Results Count */}
                <div className="flex items-center justify-between px-1">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        Showing <span className="font-semibold text-gray-900 dark:text-white">{filteredShoots.length}</span> of {shoots.length} shoots
                    </p>
                </div>

                {/* Shoots Grid/List */}
                {/* Shoots Grid/List */}
                {filteredShoots.length === 0 ? (
                    <div className="text-center py-16 rounded-2xl shadow-sm bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-gray-100 dark:bg-gray-800">
                            <Calendar size={28} className="text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                            {searchQuery || statusFilter !== 'ALL' || timeFilter !== 'ALL' ? 'No shoots found' : 'No shoots yet'}
                        </h3>
                        <p className="max-w-sm mx-auto mb-4 text-gray-500 dark:text-gray-400">
                            {searchQuery || statusFilter !== 'ALL' || timeFilter !== 'ALL'
                                ? 'Try adjusting your search or filters'
                                : 'Create your first shoot to start tracking productions'}
                        </p>
                        {!(searchQuery || statusFilter !== 'ALL' || timeFilter !== 'ALL') && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                            <Link href="/shoots/new">
                                <Button size="sm">Create Shoot</Button>
                            </Link>
                        )}
                    </div>
                ) : viewMode === 'card' ? (
                    /* Card View */
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4">
                        {sortedShoots.map(shoot => {
                            const statusStyle = getStatusStyle(shoot.status);
                            const crewCount = getCrewCount(shoot.id);

                            return (
                                <div
                                    key={shoot.id}
                                    onClick={() => router.push(`/shoots/${shoot.id}`)}
                                    className="group h-full"
                                >
                                    <div className="rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-lg transition-all duration-200 h-full cursor-pointer relative bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                                        {/* Header */}
                                        <div className="flex items-start justify-between gap-3 mb-2 sm:mb-3">
                                            <div>
                                                {shoot.shootNumber && (
                                                    <span className="inline-block text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md mb-1.5">
                                                        #{shoot.shootNumber}
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                                                        {shoot.title}
                                                    </h3>
                                                    {shoot.googleEventId && (
                                                        <div className="shrink-0 flex items-center justify-center h-5 w-5 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700" title="Synced with Google Calendar">
                                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <span
                                                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
                                                className="text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shrink-0"
                                            >
                                                {shoot.status}
                                            </span>
                                        </div>

                                        {/* Description */}
                                        {shoot.description && (
                                            <p className="text-sm line-clamp-2 mb-4 text-gray-500 dark:text-gray-400">
                                                {shoot.description}
                                            </p>
                                        )}

                                        {/* Details */}
                                        <div className="space-y-2 mb-4">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={14} className="text-gray-400 dark:text-gray-500" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                    {shoot.startTime ? (
                                                        shoot.endTime && format(parseISO(shoot.startTime), 'yyyy-MM-dd') !== format(parseISO(shoot.endTime), 'yyyy-MM-dd')
                                                            ? `${format(parseISO(shoot.startTime), 'MMM d')} - ${format(parseISO(shoot.endTime), 'MMM d, yyyy')}`
                                                            : format(parseISO(shoot.startTime), 'EEE, MMM d, yyyy')
                                                    ) : 'Date not set'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-gray-400 dark:text-gray-500" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                    {shoot.startTime ? format(parseISO(shoot.startTime), 'h:mm a') : 'TBD'}
                                                    {shoot.endTime && ` - ${format(parseISO(shoot.endTime), 'h:mm a')}`}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <MapPin size={14} className="text-gray-400 dark:text-gray-500" />
                                                <span className="text-sm truncate text-gray-700 dark:text-gray-300">
                                                    {shoot.location || 'Location not set'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div className="pt-4 flex items-center justify-between mt-auto border-t border-gray-100 dark:border-gray-800">
                                            <div className="flex items-center gap-1.5">
                                                <Users size={14} className="text-gray-400 dark:text-gray-500" />
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                    {crewCount} crew
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const text = formatWhatsAppMessage(
                                                            shoot,
                                                            assignments.filter(a => a.shootId === shoot.id),
                                                            users
                                                        );
                                                        openWhatsApp(text);
                                                    }}
                                                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#25D366] transition-all relative z-10"
                                                    title="Share on WhatsApp"
                                                >
                                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={async (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const text = formatWhatsAppMessage(
                                                            shoot,
                                                            assignments.filter(a => a.shootId === shoot.id),
                                                            users
                                                        );

                                                        const showToast = () => {
                                                            const toast = document.createElement('div');
                                                            toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm font-medium z-50 animate-in fade-in slide-in-from-bottom-2';
                                                            toast.textContent = 'Copied to clipboard';
                                                            document.body.appendChild(toast);
                                                            setTimeout(() => toast.remove(), 2000);
                                                        };

                                                        // Robust Copy Logic
                                                        if (navigator.clipboard && window.isSecureContext) {
                                                            try {
                                                                await navigator.clipboard.writeText(text);
                                                                showToast();
                                                            } catch (err) {
                                                                console.error('Clipboard API failed', err);
                                                                fallbackCopy(text);
                                                            }
                                                        } else {
                                                            fallbackCopy(text);
                                                        }

                                                        function fallbackCopy(text: string) {
                                                            const textArea = document.createElement("textarea");
                                                            textArea.value = text;

                                                            // Ensure it's not visible but part of DOM
                                                            textArea.style.position = "fixed";
                                                            textArea.style.left = "-9999px";
                                                            textArea.style.top = "0";
                                                            document.body.appendChild(textArea);

                                                            textArea.focus();
                                                            textArea.select();

                                                            try {
                                                                document.execCommand('copy');
                                                                showToast();
                                                            } catch (err) {
                                                                console.error('Fallback copy failed', err);
                                                                alert('Failed to copy to clipboard');
                                                            }

                                                            document.body.removeChild(textArea);
                                                        }
                                                    }}
                                                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 transition-all relative z-10"
                                                    title="Copy to Clipboard"
                                                >
                                                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>

                                                <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1"></div>

                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    by {users.find(u => u.id === shoot.createdBy)?.name || shoot.createdBy || 'Admin'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* List View */
                    <div className="rounded-xl shadow-sm overflow-hidden bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold uppercase tracking-wider bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
                            <button
                                onClick={() => handleSort('title')}
                                className={`col-span-4 flex items-center gap-1.5 transition-colors text-left ${sortField === 'title' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                            >
                                Shoot <SortIndicator field="title" />
                            </button>
                            <button
                                onClick={() => handleSort('date')}
                                className={`col-span-2 flex items-center gap-1.5 transition-colors text-left ${sortField === 'date' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                            >
                                Date & Time <SortIndicator field="date" />
                            </button>
                            <button
                                onClick={() => handleSort('location')}
                                className={`col-span-2 flex items-center gap-1.5 transition-colors text-left ${sortField === 'location' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                            >
                                Location <SortIndicator field="location" />
                            </button>
                            <button
                                onClick={() => handleSort('crew')}
                                className={`col-span-2 flex items-center gap-1.5 transition-colors text-left ${sortField === 'crew' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                            >
                                Crew <SortIndicator field="crew" />
                            </button>
                            <button
                                onClick={() => handleSort('status')}
                                className={`col-span-2 flex items-center gap-1.5 transition-colors text-left ${sortField === 'status' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                            >
                                Status <SortIndicator field="status" />
                            </button>
                        </div>

                        {/* Table Rows */}
                        {sortedShoots.map((shoot, index) => {
                            const statusStyle = getStatusStyle(shoot.status);
                            const crewCount = getCrewCount(shoot.id);
                            const isExpanded = expandedCrewShootId === shoot.id;

                            return (
                                <div
                                    key={shoot.id}
                                    className="cursor-pointer group"
                                    onClick={() => router.push(`/shoots/${shoot.id}`)}
                                >
                                    <div
                                        className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-4 transition-colors ${isExpanded
                                            ? 'bg-blue-50/30 dark:bg-blue-900/10'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                            } ${index < sortedShoots.length - 1
                                                ? 'border-b border-gray-100 dark:border-gray-800'
                                                : ''
                                            }`}
                                    >
                                        {/* Shoot Info */}
                                        <div className="col-span-4 min-w-0">
                                            <div className="flex items-center gap-2">
                                                {shoot.shootNumber && (
                                                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                                        #{shoot.shootNumber}
                                                    </span>
                                                )}
                                                <h4 className="font-semibold truncate hover:text-blue-600 dark:hover:text-blue-400 text-gray-900 dark:text-white">
                                                    {shoot.title}
                                                </h4>
                                                {shoot.googleEventId && (
                                                    <div className="shrink-0 flex items-center justify-center" title="Synced with Google Calendar">
                                                        <svg className="w-3 h-3" viewBox="0 0 24 24">
                                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                            {shoot.description && (
                                                <p className="text-sm truncate mt-0.5 text-gray-500 dark:text-gray-400">
                                                    {shoot.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Date & Time */}
                                        <div className="col-span-2 flex flex-col justify-center">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {shoot.startTime ? format(parseISO(shoot.startTime), 'MMM d, yyyy') : 'Not set'}
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                                {shoot.startTime ? format(parseISO(shoot.startTime), 'h:mm a') : ''}
                                            </span>
                                        </div>

                                        {/* Location */}
                                        <div className="col-span-2 flex items-center">
                                            <span className="text-sm truncate text-gray-700 dark:text-gray-300">
                                                {shoot.location || '-'}
                                            </span>
                                        </div>

                                        {/* Crew */}
                                        <div className="col-span-2 flex items-center">
                                            <div className="flex items-center gap-2 relative z-10">
                                                <div className="flex items-center gap-1.5">
                                                    <Users size={14} className="text-gray-400 dark:text-gray-500" />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                        {crewCount} members
                                                    </span>
                                                </div>
                                                {crewCount > 0 && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedCrewShootId(isExpanded ? null : shoot.id);
                                                        }}
                                                        className="p-1 hover:bg-gray-200 rounded-full transition-colors focus:outline-none"
                                                        title={isExpanded ? "Hide crew" : "Show crew"}
                                                    >
                                                        {isExpanded ? (
                                                            <EyeOff size={16} className="text-gray-500" />
                                                        ) : (
                                                            <Eye size={16} className="text-gray-500" />
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Status */}
                                        <div className="col-span-2 flex items-center">
                                            <span
                                                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
                                                className="text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                                            >
                                                {shoot.status}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded Crew Section */}
                                    {isExpanded && (
                                        <div
                                            className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap gap-4 items-center animate-in slide-in-from-top-2 duration-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-2">Assigned Crew:</div>
                                            {getShootCrew(shoot.id).map(member => (
                                                <div key={member.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm">
                                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white">
                                                        {member.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex flex-col leading-none">
                                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{member.name}</span>
                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{member.role}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </PullToRefresh >
    );
}
