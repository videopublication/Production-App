'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Shoot, Assignment, User } from '@/types';
import { Plus, Calendar, MapPin, Clock, Search, Grid3X3, List, Filter, ChevronDown, Users, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, isToday, addDays } from 'date-fns';
import { Button } from '@/components/Button';
import { formatWhatsAppMessage, openWhatsApp } from '@/lib/whatsapp';

type ViewMode = 'card' | 'list';
type StatusFilter = 'ALL' | 'CONFIRMED' | 'CANCELLED';
type TimeFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'PAST';
type SortField = 'title' | 'date' | 'location' | 'crew' | 'status';
type SortDirection = 'asc' | 'desc';

export default function ShootList() {
    const router = useRouter();
    const [shoots, setShoots] = useState<Shoot[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [viewMode, setViewMode] = useState<ViewMode>('card');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
    const [showFilters, setShowFilters] = useState(false);

    // Sorting state (for list view)
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [shootsData, assignmentsData, usersData] = await Promise.all([
                storage.getShoots(),
                storage.getAssignments(),
                storage.getUsers()
            ]);
            setShoots(shootsData);
            setAssignments(assignmentsData);
            setUsers(usersData);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Get crew count for a shoot
    const getCrewCount = (shootId: string) => {
        return assignments.filter(a => a.shootId === shootId).length;
    };

    // Filtered shoots
    const filteredShoots = useMemo(() => {
        return shoots.filter(shoot => {
            // Search filter
            const query = searchQuery.toLowerCase();
            const matchesSearch = !query ||
                shoot.title.toLowerCase().includes(query) ||
                shoot.location?.toLowerCase().includes(query) ||
                shoot.description?.toLowerCase().includes(query);

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
                }
            }

            return matchesSearch && matchesStatus && matchesTime;
        });
    }, [shoots, searchQuery, statusFilter, timeFilter]);

    // Sorted shoots for list view
    const sortedShoots = useMemo(() => {
        if (viewMode !== 'list') {
            // For card view, just sort by date descending
            return [...filteredShoots].sort((a, b) => {
                if (!a.startTime) return 1;
                if (!b.startTime) return -1;
                return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
            });
        }

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
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [filteredShoots, viewMode, sortField, sortDirection, assignments]);

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
        <div className="px-1 py-2 sm:p-6 space-y-3 sm:space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-2 sm:px-0">
                <div>
                    <h1 style={{ color: '#111827' }} className="text-xl sm:text-3xl font-bold">Shoots</h1>
                    <p style={{ color: '#6b7280' }} className="text-xs sm:text-sm mt-0.5 sm:mt-1">Manage upcoming productions</p>
                </div>
                <Link href="/admin/shoots/new" className="shrink-0">
                    <Button variant="primary" className="gap-2 shadow-lg rounded-xl h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold">
                        <Plus size={16} strokeWidth={2.5} />
                        <span className="hidden xs:inline">New Shoot</span>
                        <span className="xs:hidden">New</span>
                    </Button>
                </Link>
            </div>

            {/* Search & Filters Bar */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }} className="rounded-xl p-2 sm:p-4 shadow-sm space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search size={18} style={{ color: '#9ca3af' }} className="absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', color: '#111827' }}
                            className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* View Toggle & Filter Button */}
                    <div className="flex gap-2">
                        {/* View Mode Toggle */}
                        <div style={{ backgroundColor: '#f3f4f6' }} className="flex rounded-lg p-1 shrink-0">
                            <button
                                onClick={() => setViewMode('card')}
                                style={{
                                    backgroundColor: viewMode === 'card' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'card' ? '#111827' : '#6b7280'
                                }}
                                className="p-1.5 sm:p-2 rounded-md transition-all"
                            >
                                <Grid3X3 size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                style={{
                                    backgroundColor: viewMode === 'list' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'list' ? '#111827' : '#6b7280'
                                }}
                                className="p-1.5 sm:p-2 rounded-md transition-all"
                            >
                                <List size={18} />
                            </button>
                        </div>

                        {/* Filter Toggle */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            style={{
                                backgroundColor: showFilters ? '#eff6ff' : '#f3f4f6',
                                color: showFilters ? '#2563eb' : '#374151',
                                border: showFilters ? '1px solid #bfdbfe' : '1px solid transparent'
                            }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all"
                        >
                            <Filter size={16} />
                            Filters
                            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Filter Options */}
                {showFilters && (
                    <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 pt-2 sm:pt-3 border-t" style={{ borderColor: '#e5e7eb' }}>
                        {/* Status Filter */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span style={{ color: '#6b7280' }} className="text-xs sm:text-sm font-medium shrink-0">Status:</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(['ALL', 'CONFIRMED', 'CANCELLED'] as StatusFilter[]).map(status => (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        style={{
                                            backgroundColor: statusFilter === status ? '#3b82f6' : '#f3f4f6',
                                            color: statusFilter === status ? '#ffffff' : '#374151'
                                        }}
                                        className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all"
                                    >
                                        {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Time Filter */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span style={{ color: '#6b7280' }} className="text-xs sm:text-sm font-medium shrink-0">When:</span>
                            <div className="flex flex-wrap gap-1.5">
                                {(['ALL', 'TODAY', 'UPCOMING', 'PAST'] as TimeFilter[]).map(time => (
                                    <button
                                        key={time}
                                        onClick={() => setTimeFilter(time)}
                                        style={{
                                            backgroundColor: timeFilter === time ? '#3b82f6' : '#f3f4f6',
                                            color: timeFilter === time ? '#ffffff' : '#374151'
                                        }}
                                        className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-all"
                                    >
                                        {time === 'ALL' ? 'All' : time.charAt(0) + time.slice(1).toLowerCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between px-1">
                <p style={{ color: '#6b7280' }} className="text-xs sm:text-sm">
                    Showing <span style={{ color: '#111827' }} className="font-semibold">{filteredShoots.length}</span> of {shoots.length} shoots
                </p>
            </div>

            {/* Shoots Grid/List */}
            {filteredShoots.length === 0 ? (
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }} className="text-center py-16 rounded-2xl shadow-sm">
                    <div style={{ backgroundColor: '#f3f4f6' }} className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Calendar size={28} style={{ color: '#9ca3af' }} />
                    </div>
                    <h3 style={{ color: '#111827' }} className="text-lg font-semibold mb-2">
                        {searchQuery || statusFilter !== 'ALL' || timeFilter !== 'ALL' ? 'No shoots found' : 'No shoots yet'}
                    </h3>
                    <p style={{ color: '#6b7280' }} className="max-w-sm mx-auto mb-4">
                        {searchQuery || statusFilter !== 'ALL' || timeFilter !== 'ALL'
                            ? 'Try adjusting your search or filters'
                            : 'Create your first shoot to start tracking productions'}
                    </p>
                    {!(searchQuery || statusFilter !== 'ALL' || timeFilter !== 'ALL') && (
                        <Link href="/admin/shoots/new">
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
                                onClick={() => router.push(`/admin/shoots/${shoot.id}`)}
                                className="group h-full" // Added group wrapper to maintain hover states if needed, though most styles are on inner div
                            >
                                <div
                                    style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                                    className="rounded-xl p-3 sm:p-5 shadow-sm hover:shadow-lg transition-all duration-200 h-full cursor-pointer relative"
                                >
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-3 mb-2 sm:mb-3">
                                        <h3 style={{ color: '#111827' }} className="font-bold text-base sm:text-lg group-hover:text-blue-600 transition-colors line-clamp-1">
                                            {shoot.title}
                                        </h3>
                                        <span
                                            style={{ backgroundColor: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
                                            className="text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide shrink-0"
                                        >
                                            {shoot.status}
                                        </span>
                                    </div>

                                    {/* Description */}
                                    {shoot.description && (
                                        <p style={{ color: '#6b7280' }} className="text-sm line-clamp-2 mb-4">
                                            {shoot.description}
                                        </p>
                                    )}

                                    {/* Details */}
                                    <div className="space-y-2 mb-4">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} style={{ color: '#9ca3af' }} />
                                            <span style={{ color: '#374151' }} className="text-sm">
                                                {shoot.startTime ? (
                                                    shoot.endTime && format(parseISO(shoot.startTime), 'yyyy-MM-dd') !== format(parseISO(shoot.endTime), 'yyyy-MM-dd')
                                                        ? `${format(parseISO(shoot.startTime), 'MMM d')} - ${format(parseISO(shoot.endTime), 'MMM d, yyyy')}`
                                                        : format(parseISO(shoot.startTime), 'EEE, MMM d, yyyy')
                                                ) : 'Date not set'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock size={14} style={{ color: '#9ca3af' }} />
                                            <span style={{ color: '#374151' }} className="text-sm">
                                                {shoot.startTime ? format(parseISO(shoot.startTime), 'h:mm a') : 'TBD'}
                                                {shoot.endTime && ` - ${format(parseISO(shoot.endTime), 'h:mm a')}`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <MapPin size={14} style={{ color: '#9ca3af' }} />
                                            <span style={{ color: '#374151' }} className="text-sm truncate">
                                                {shoot.location || 'Location not set'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div style={{ borderTop: '1px solid #f3f4f6' }} className="pt-4 flex items-center justify-between mt-auto">
                                        <div className="flex items-center gap-1.5">
                                            <Users size={14} style={{ color: '#9ca3af' }} />
                                            <span style={{ color: '#6b7280' }} className="text-xs font-medium">
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

                                            <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>

                                            <span style={{ color: '#6b7280' }} className="text-xs">
                                                by {shoot.createdBy || 'Admin'}
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
                <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }} className="rounded-xl shadow-sm overflow-hidden">
                    {/* Table Header */}
                    <div style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }} className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                        <button
                            onClick={() => handleSort('title')}
                            className="col-span-4 flex items-center gap-1.5 hover:text-blue-600 transition-colors text-left"
                            style={{ color: sortField === 'title' ? '#2563eb' : '#6b7280' }}
                        >
                            Shoot <SortIndicator field="title" />
                        </button>
                        <button
                            onClick={() => handleSort('date')}
                            className="col-span-2 flex items-center gap-1.5 hover:text-blue-600 transition-colors text-left"
                            style={{ color: sortField === 'date' ? '#2563eb' : '#6b7280' }}
                        >
                            Date & Time <SortIndicator field="date" />
                        </button>
                        <button
                            onClick={() => handleSort('location')}
                            className="col-span-2 flex items-center gap-1.5 hover:text-blue-600 transition-colors text-left"
                            style={{ color: sortField === 'location' ? '#2563eb' : '#6b7280' }}
                        >
                            Location <SortIndicator field="location" />
                        </button>
                        <button
                            onClick={() => handleSort('crew')}
                            className="col-span-2 flex items-center gap-1.5 hover:text-blue-600 transition-colors text-left"
                            style={{ color: sortField === 'crew' ? '#2563eb' : '#6b7280' }}
                        >
                            Crew <SortIndicator field="crew" />
                        </button>
                        <button
                            onClick={() => handleSort('status')}
                            className="col-span-2 flex items-center gap-1.5 hover:text-blue-600 transition-colors text-left"
                            style={{ color: sortField === 'status' ? '#2563eb' : '#6b7280' }}
                        >
                            Status <SortIndicator field="status" />
                        </button>
                    </div>

                    {/* Table Rows */}
                    {sortedShoots.map((shoot, index) => {
                        const statusStyle = getStatusStyle(shoot.status);
                        const crewCount = getCrewCount(shoot.id);

                        return (
                            <div
                                key={shoot.id}
                                onClick={() => router.push(`/admin/shoots/${shoot.id}`)}
                                className="cursor-pointer"
                            >
                                <div
                                    style={{ borderBottom: index < sortedShoots.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                                    className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-4 hover:bg-gray-50 transition-colors"
                                >
                                    {/* Shoot Info */}
                                    <div className="col-span-4 min-w-0">
                                        <h4 style={{ color: '#111827' }} className="font-semibold truncate hover:text-blue-600">
                                            {shoot.title}
                                        </h4>
                                        {shoot.description && (
                                            <p style={{ color: '#6b7280' }} className="text-sm truncate mt-0.5">
                                                {shoot.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Date & Time */}
                                    <div className="col-span-2 flex flex-col justify-center">
                                        <span style={{ color: '#374151' }} className="text-sm font-medium">
                                            {shoot.startTime ? format(parseISO(shoot.startTime), 'MMM d, yyyy') : 'Not set'}
                                        </span>
                                        <span style={{ color: '#9ca3af' }} className="text-xs">
                                            {shoot.startTime ? format(parseISO(shoot.startTime), 'h:mm a') : ''}
                                        </span>
                                    </div>

                                    {/* Location */}
                                    <div className="col-span-2 flex items-center">
                                        <span style={{ color: '#374151' }} className="text-sm truncate">
                                            {shoot.location || '-'}
                                        </span>
                                    </div>

                                    {/* Crew */}
                                    <div className="col-span-2 flex items-center">
                                        <div className="flex items-center gap-1.5">
                                            <Users size={14} style={{ color: '#9ca3af' }} />
                                            <span style={{ color: '#374151' }} className="text-sm">
                                                {crewCount} members
                                            </span>
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
