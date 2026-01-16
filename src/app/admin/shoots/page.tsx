'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { storage } from '@/lib/storage';
import { Shoot, Assignment, User } from '@/types';
import { Plus, Calendar, MapPin, Clock, Search, Grid3X3, List, Filter, ChevronDown, Users, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, isToday, addDays } from 'date-fns';
import { Button } from '@/components/Button';

type ViewMode = 'card' | 'list';
type StatusFilter = 'ALL' | 'CONFIRMED' | 'CANCELLED';
type TimeFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'PAST';
type SortField = 'title' | 'date' | 'location' | 'crew' | 'status';
type SortDirection = 'asc' | 'desc';

export default function ShootList() {
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
        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 style={{ color: '#111827' }} className="text-2xl sm:text-3xl font-bold">Shoots</h1>
                    <p style={{ color: '#6b7280' }} className="text-sm mt-1">Manage upcoming video productions</p>
                </div>
                <Link href="/admin/shoots/new">
                    <Button variant="primary" className="gap-2 shadow-lg">
                        <Plus size={18} />
                        New Shoot
                    </Button>
                </Link>
            </div>

            {/* Search & Filters Bar */}
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }} className="rounded-xl p-4 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search size={18} style={{ color: '#9ca3af' }} className="absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search shoots by title, location..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', color: '#111827' }}
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* View Toggle & Filter Button */}
                    <div className="flex gap-2">
                        {/* View Mode Toggle */}
                        <div style={{ backgroundColor: '#f3f4f6' }} className="flex rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('card')}
                                style={{
                                    backgroundColor: viewMode === 'card' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'card' ? '#111827' : '#6b7280'
                                }}
                                className="p-2 rounded-md transition-all"
                            >
                                <Grid3X3 size={18} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                style={{
                                    backgroundColor: viewMode === 'list' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'list' ? '#111827' : '#6b7280'
                                }}
                                className="p-2 rounded-md transition-all"
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
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                        >
                            <Filter size={16} />
                            Filters
                            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Filter Options */}
                {showFilters && (
                    <div className="flex flex-wrap gap-3 pt-3 border-t" style={{ borderColor: '#e5e7eb' }}>
                        {/* Status Filter */}
                        <div className="flex items-center gap-2">
                            <span style={{ color: '#6b7280' }} className="text-sm font-medium">Status:</span>
                            <div className="flex gap-1">
                                {(['ALL', 'CONFIRMED', 'CANCELLED'] as StatusFilter[]).map(status => (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        style={{
                                            backgroundColor: statusFilter === status ? '#3b82f6' : '#f3f4f6',
                                            color: statusFilter === status ? '#ffffff' : '#374151'
                                        }}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                                    >
                                        {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Time Filter */}
                        <div className="flex items-center gap-2">
                            <span style={{ color: '#6b7280' }} className="text-sm font-medium">When:</span>
                            <div className="flex gap-1">
                                {(['ALL', 'TODAY', 'UPCOMING', 'PAST'] as TimeFilter[]).map(time => (
                                    <button
                                        key={time}
                                        onClick={() => setTimeFilter(time)}
                                        style={{
                                            backgroundColor: timeFilter === time ? '#3b82f6' : '#f3f4f6',
                                            color: timeFilter === time ? '#ffffff' : '#374151'
                                        }}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
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
            <div className="flex items-center justify-between">
                <p style={{ color: '#6b7280' }} className="text-sm">
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sortedShoots.map(shoot => {
                        const statusStyle = getStatusStyle(shoot.status);
                        const crewCount = getCrewCount(shoot.id);

                        return (
                            <Link key={shoot.id} href={`/admin/shoots/${shoot.id}`}>
                                <div
                                    style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                                    className="rounded-xl p-5 shadow-sm hover:shadow-lg transition-all duration-200 h-full group cursor-pointer"
                                >
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <h3 style={{ color: '#111827' }} className="font-bold text-lg group-hover:text-blue-600 transition-colors line-clamp-1">
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
                                                {shoot.startTime ? format(parseISO(shoot.startTime), 'EEE, MMM d, yyyy') : 'Date not set'}
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
                                    <div style={{ borderTop: '1px solid #f3f4f6' }} className="pt-3 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Users size={14} style={{ color: '#9ca3af' }} />
                                            <span style={{ color: '#6b7280' }} className="text-xs font-medium">
                                                {crewCount} crew
                                            </span>
                                        </div>
                                        <span style={{ color: '#6b7280' }} className="text-xs">
                                            by {shoot.createdBy || 'Admin'}
                                        </span>
                                    </div>
                                </div>
                            </Link>
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
                            <Link key={shoot.id} href={`/admin/shoots/${shoot.id}`}>
                                <div
                                    style={{ borderBottom: index < sortedShoots.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                                    className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
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
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
