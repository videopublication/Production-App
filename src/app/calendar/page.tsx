'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { Shoot, Assignment, User } from '@/types';
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Calendar as CalendarIcon,
    Plus,
    Users,
    User as UserIcon,
    Clock,
    MapPin,
    List,
    Copy,
    Phone,
    MessageCircle,
    Mail,
    Search
} from 'lucide-react';
import {
    format,
    parseISO,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addMonths,
    subMonths,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday,
    isWithinInterval,
    startOfDay,
    endOfDay,
    eachWeekOfInterval,
    differenceInCalendarDays,
    addDays,
} from 'date-fns';
import { Button } from '@/components/Button';
import { PullToRefresh } from '@/components/PullToRefresh';

// Helper to check if two intervals overlap
const areIntervalsOverlapping = (start1: Date, end1: Date, start2: Date, end2: Date) => {
    return start1 <= end2 && start2 <= end1;
};

import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';

export default function CalendarPage() {
    const { user } = useAuth();

    // React Query Hooks
    const { data: shoots = [], isLoading: shootsLoading, refetch: refetchShoots } = useShoots();
    const { data: assignments = [], isLoading: assignmentsLoading, refetch: refetchAssignments } = useAssignments();
    const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useUsers();

    const loading = shootsLoading || assignmentsLoading || usersLoading;

    // Refresh handler
    const handleRefresh = async () => {
        await Promise.all([
            refetchShoots(),
            refetchAssignments(),
            refetchUsers()
        ]);
    };

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedShoot, setSelectedShoot] = useState<Shoot | null>(null);
    const [crewFilter, setCrewFilter] = useState<string>('ALL');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const filterRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when filter opens
    useEffect(() => {
        if (isFilterOpen && searchInputRef.current) {
            // Small timeout to allow transition/render
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
        }
    }, [isFilterOpen]);


    // Filter shoots based on crew selection and user role
    const filteredShoots = useMemo(() => {
        // If user is just CREW (not ADMIN/MANAGER), they can ONLY see their own shoots
        if (user && user.role === 'CREW') {
            return shoots.filter(shoot => {
                return assignments.some(a => a.shootId === shoot.id && a.userId === user.id);
            });
        }

        if (crewFilter === 'ALL') return shoots;
        return shoots.filter(shoot => {
            return assignments.some(a => a.shootId === shoot.id && a.userId === crewFilter);
        });
    }, [shoots, assignments, crewFilter, user]);

    // Get shoots for a specific date (including multi-day shoots that span this date)
    const getShootsForDate = (date: Date) => {
        return filteredShoots.filter(shoot => {
            if (!shoot.startTime) return false;
            const shootStart = startOfDay(parseISO(shoot.startTime));
            const shootEnd = shoot.endTime ? startOfDay(parseISO(shoot.endTime)) : shootStart;
            const checkDate = startOfDay(date);

            // Check if date falls within the shoot's date range
            return isWithinInterval(checkDate, { start: shootStart, end: shootEnd }) ||
                isSameDay(checkDate, shootStart) ||
                isSameDay(checkDate, shootEnd);
        });
    };

    // Get crew for a shoot
    const getCrewForShoot = (shootId: string) => {
        const shootAssignments = assignments.filter(a => a.shootId === shootId);
        return shootAssignments.map(a => {
            const user = users.find(u => u.id === a.userId);
            return {
                ...a,
                user
            };
        });
    };

    // Calendar Weeks calculation (Standard Grid approach usually works better with Weeks logic if we want spanning)
    const calendarWeeks = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

        return eachWeekOfInterval({
            start: calendarStart,
            end: calendarEnd
        }, { weekStartsOn: 0 });
    }, [currentMonth]);

    // Shoots for selected date
    const shootsForSelectedDate = selectedDate ? getShootsForDate(selectedDate) : [];

    // Count total shoots this month
    const shootsThisMonth = useMemo(() => {
        return filteredShoots.filter(shoot => {
            if (!shoot.startTime) return false;
            return isSameMonth(parseISO(shoot.startTime), currentMonth);
        }).length;
    }, [filteredShoots, currentMonth]);

    // Color palette for different shoots (vibrant, distinct colors)
    const shootColorPalette = [
        { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },  // Blue
        { bg: '#dcfce7', text: '#166534', border: '#22c55e' },  // Green
        { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },  // Amber
        { bg: '#fce7f3', text: '#9d174d', border: '#ec4899' },  // Pink
        { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' },  // Indigo
        { bg: '#ccfbf1', text: '#115e59', border: '#14b8a6' },  // Teal
        { bg: '#fef9c3', text: '#854d0e', border: '#eab308' },  // Yellow
        { bg: '#ede9fe', text: '#5b21b6', border: '#8b5cf6' },  // Violet
        { bg: '#ffedd5', text: '#9a3412', border: '#f97316' },  // Orange
        { bg: '#cffafe', text: '#155e75', border: '#06b6d4' },  // Cyan
    ];

    // Get color for a specific shoot based on its index in the shoots array
    const getShootColor = (shootId: string) => {
        const index = shoots.findIndex(s => s.id === shootId);
        if (index === -1) return shootColorPalette[0];
        return shootColorPalette[index % shootColorPalette.length];
    };

    // Get status-specific styling (for cancelled shoots)
    const getStatusStyle = (status: string, shootId: string) => {
        if (status === 'CANCELLED') {
            // Using RGBA for background allows it to adapt to dark/light mode (pale red on light, dark red on dark)
            // Text is brighter red to be visible on both
            return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#f87171' };
        }
        return getShootColor(shootId);
    };

    const navigateMonth = (direction: 'prev' | 'next') => {
        setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
        setSelectedDate(null);
        setSelectedShoot(null);
    };

    const goToToday = () => {
        setCurrentMonth(new Date());
        setSelectedDate(new Date());
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-96 bg-gray-200 rounded-2xl"></div>
                </div>
            </div>
        );
    }

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="p-2 sm:p-6 space-y-6 max-w-7xl mx-auto min-h-[calc(100vh-80px)]">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2 sm:px-0">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-white">
                            <CalendarIcon size={28} className="text-blue-500 dark:text-blue-400" />
                            Calendar
                        </h1>
                        <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                            {shootsThisMonth} shoot{shootsThisMonth !== 1 ? 's' : ''} scheduled in {format(currentMonth, 'MMMM yyyy')}
                        </p>
                    </div>

                    {/* Filter */}
                    {user?.role === 'ADMIN' && (
                        <div className="relative z-20" ref={filterRef}>
                            <button
                                onClick={() => {
                                    setIsFilterOpen(!isFilterOpen);
                                    if (!isFilterOpen) setSearchQuery('');
                                }}
                                className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border shadow-sm transition-all cursor-pointer bg-white dark:bg-[#1c1c1e] border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 min-w-[180px] justify-between group"
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <Users size={16} className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors shrink-0" />
                                    <span className={`text-sm font-medium truncate ${crewFilter === 'ALL' ? 'text-gray-700 dark:text-gray-300' : 'text-blue-600 dark:text-blue-400'}`}>
                                        {crewFilter === 'ALL' ? 'All Crew' : users.find(u => u.id === crewFilter)?.name || 'Unknown'}
                                    </span>
                                </div>
                                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`} />
                            </button>

                            <div
                                className={`absolute left-0 sm:right-0 top-full mt-2 w-[240px] bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-top-left sm:origin-top-right z-30 ${isFilterOpen
                                    ? 'opacity-100 scale-100 translate-y-0'
                                    : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                                    }`}
                            >
                                {/* Search Box */}
                                <div className="p-2 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1c1c1e] z-10">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search crew..."
                                            className="w-full text-xs pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border-none rounded-lg focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </div>

                                <div className="max-h-[250px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
                                    <button
                                        onClick={() => { setCrewFilter('ALL'); setIsFilterOpen(false); }}
                                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${crewFilter === 'ALL'
                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            } ${searchQuery ? 'hidden' : ''}`}
                                    >
                                        All Crew
                                    </button>
                                    {users
                                        .filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map(u => (
                                            <button
                                                key={u.id}
                                                onClick={() => { setCrewFilter(u.id); setIsFilterOpen(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${crewFilter === u.id
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                    }`}
                                            >
                                                <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                                    {u.name.charAt(0)}
                                                </div>
                                                <span className="truncate">{u.name}</span>
                                            </button>
                                        ))}
                                    {users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                                        <div className="px-4 py-3 text-xs text-center text-gray-500">
                                            No crew found
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Calendar */}
                    <div className="lg:col-span-2">
                        <div className="rounded-2xl shadow-sm overflow-hidden bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                            {/* Calendar Header */}
                            <div className="px-3 sm:px-6 py-4 flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
                                <div className="flex items-center gap-1 sm:gap-2 flex-1">
                                    <button
                                        onClick={() => navigateMonth('prev')}
                                        className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0 text-gray-700 dark:text-gray-300"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <h2 className="text-lg sm:text-xl font-bold flex-1 text-center sm:min-w-[200px] text-gray-900 dark:text-white">
                                        {format(currentMonth, 'MMMM yyyy')}
                                    </h2>
                                    <button
                                        onClick={() => navigateMonth('next')}
                                        className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0 text-gray-700 dark:text-gray-300"
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                                <button
                                    onClick={goToToday}
                                    className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors shrink-0 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                >
                                    Today
                                </button>
                            </div>

                            {/* Day Headers */}
                            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-800">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div
                                        key={day}
                                        className="py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800"
                                    >
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* Week Rows Layout */}
                            <div className="flex flex-col">
                                {calendarWeeks.map((weekStart, weekIndex) => {
                                    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
                                    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

                                    // Process events for this week
                                    const weekEvents = filteredShoots.filter(shoot => {
                                        if (!shoot.startTime) return false;
                                        const shootStart = startOfDay(parseISO(shoot.startTime));
                                        const shootEnd = shoot.endTime ? startOfDay(parseISO(shoot.endTime)) : shootStart;

                                        // Check if shoot interacts with this week
                                        return areIntervalsOverlapping(shootStart, shootEnd, weekStart, weekEnd);
                                    }).map(shoot => {
                                        const shootStart = startOfDay(parseISO(shoot.startTime!));
                                        const shootEnd = shoot.endTime ? startOfDay(parseISO(shoot.endTime)) : shootStart;

                                        // Calculate visual position in this week (0-6)
                                        let startIndex = differenceInCalendarDays(shootStart, weekStart);
                                        let duration = differenceInCalendarDays(shootEnd, shootStart) + 1;

                                        // Clamp to this week
                                        if (startIndex < 0) {
                                            duration += startIndex; // Decrease duration by days passed
                                            startIndex = 0;
                                        }
                                        const endIndex = startIndex + duration;
                                        if (endIndex > 7) {
                                            duration = 7 - startIndex;
                                        }

                                        return {
                                            shoot,
                                            colStart: startIndex + 1, // Grid columns are 1-based
                                            colSpan: duration,
                                            isStart: startIndex >= differenceInCalendarDays(shootStart, weekStart), // Visual logic simplification
                                            isEnd: (startIndex + duration) < 7 // Simplify
                                        };
                                    });

                                    // Packing Algorithm to determine vertical rows
                                    const sortedEvents = weekEvents.sort((a, b) => {
                                        // Sort by colStart, then duration desc
                                        if (a.colStart !== b.colStart) return a.colStart - b.colStart;
                                        return b.colSpan - a.colSpan;
                                    });

                                    // Matrix to track occupied cells: occupied[row][col (0-6)]
                                    const occupied: boolean[][] = [];
                                    const placedEvents = sortedEvents.map(event => {
                                        let rowIndex = 0;
                                        while (true) {
                                            if (!occupied[rowIndex]) occupied[rowIndex] = [];

                                            // Check if this row is free for the event's span
                                            let isFree = true;
                                            for (let i = 0; i < event.colSpan; i++) {
                                                if (occupied[rowIndex][event.colStart - 1 + i]) {
                                                    isFree = false;
                                                    break;
                                                }
                                            }

                                            if (isFree) {
                                                // Place it
                                                for (let i = 0; i < event.colSpan; i++) {
                                                    occupied[rowIndex][event.colStart - 1 + i] = true;
                                                }
                                                return { ...event, rowIndex };
                                            }
                                            rowIndex++;
                                        }
                                    });

                                    const rowCount = Math.max(1, occupied.length); // Allow single row if empty
                                    const rowHeight = 30; // Increased for better mobile spacing
                                    const headerHeight = 36; // Header clearance
                                    const minWeekHeight = Math.max(70, (rowCount * rowHeight) + headerHeight + 6);

                                    return (
                                        <div
                                            key={weekIndex}
                                            style={{ minHeight: `${minWeekHeight}px` }}
                                            className={`relative grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 ${weekIndex === calendarWeeks.length - 1 ? 'border-b-0' : ''}`}
                                        >
                                            {/* Background Cells Layer */}
                                            {daysInWeek.map((day, dayIndex) => {
                                                const isSelected = selectedDate && isSameDay(day, selectedDate);
                                                const isCurrentMonth = isSameMonth(day, currentMonth);
                                                const isTodayDate = isToday(day);

                                                return (
                                                    <div
                                                        key={day.toString()}
                                                        onClick={() => {
                                                            setSelectedDate(day);
                                                            setSelectedShoot(null);
                                                        }}
                                                        className={`
                                                        h-full p-2 pb-8 transition-colors relative z-0
                                                        ${dayIndex < 6 ? 'border-r border-gray-100 dark:border-gray-800' : ''}
                                                        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                                                        ${!isCurrentMonth ? 'bg-gray-50/50 dark:bg-gray-800/30' : ''}
                                                    `}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <span
                                                                className={`text-xs sm:text-sm font-semibold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full ${isTodayDate
                                                                    ? 'bg-blue-600 text-white'
                                                                    : isSelected
                                                                        ? 'text-blue-600 dark:text-blue-400'
                                                                        : 'text-gray-700 dark:text-gray-300'
                                                                    } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                                                            >
                                                                {format(day, 'd')}
                                                            </span>

                                                            {/* Mobile Dot Indicators (visible only on small screens) */}
                                                            <div className="sm:hidden flex flex-wrap gap-0.5 max-w-[50%] justify-end">
                                                                {placedEvents
                                                                    .filter(e => (dayIndex + 1) >= e.colStart && (dayIndex + 1) < (e.colStart + e.colSpan))
                                                                    .slice(0, 3)
                                                                    .map((e, i) => (
                                                                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${e.shoot.status === 'CANCELLED' ? 'bg-red-400' : 'bg-blue-400'}`} />
                                                                    ))
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Events Layer - Placed on top using Grid positioning */}
                                            <div
                                                className="absolute inset-x-0 top-11 bottom-1 pointer-events-none px-0.5 grid grid-cols-7"
                                                style={{
                                                    gridTemplateRows: `repeat(${rowCount}, ${rowHeight}px)`
                                                }}
                                            >
                                                {placedEvents.map((event) => {
                                                    const style = getStatusStyle(event.shoot.status, event.shoot.id);

                                                    return (
                                                        <div
                                                            key={`${event.shoot.id}-${weekIndex}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedShoot(event.shoot);
                                                                // Calculate best date to select (closest to today if spans, or start)
                                                                const sStart = parseISO(event.shoot.startTime!);
                                                                const diff = differenceInCalendarDays(sStart, weekStart);
                                                                const targetDate = addDays(weekStart, Math.max(0, diff));
                                                                setSelectedDate(targetDate);
                                                            }}
                                                            style={{
                                                                gridColumnStart: event.colStart,
                                                                gridColumnEnd: `span ${event.colSpan}`,
                                                                gridRowStart: event.rowIndex + 1,
                                                                backgroundColor: style.bg,
                                                                color: style.text,
                                                                borderLeft: `3px solid ${style.border || style.text}`,
                                                                opacity: event.shoot.status === 'CANCELLED' ? 0.6 : 1,
                                                            }}
                                                            className={`
                                                            pointer-events-auto
                                                            mx-1 mb-1 h-6
                                                            rounded px-2 text-[11px] font-semibold truncate cursor-pointer hover:brightness-95 transition-all shadow-sm flex items-center
                                                            relative z-10
                                                        `}
                                                            title={event.shoot.title}
                                                        >
                                                            {event.colSpan > 1 && (
                                                                <span className={`truncate w-full text-left ${event.shoot.status === 'CANCELLED' ? 'line-through decoration-red-500' : ''}`}>
                                                                    {event.shoot.title}
                                                                </span>
                                                            )}

                                                            {event.colSpan === 1 && (
                                                                <>
                                                                    {event.shoot.status === 'CANCELLED' && (
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0 mr-1.5" />
                                                                    )}
                                                                    <span className={`truncate ${event.shoot.status === 'CANCELLED' ? 'line-through decoration-red-500' : ''}`}>
                                                                        {event.shoot.title}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="mt-4 flex flex-wrap gap-4 px-2">
                            <div className="flex items-center gap-2">
                                <div style={{ backgroundColor: '#22c55e' }} className="w-3 h-3 rounded-full"></div>
                                <span style={{ color: '#6b7280' }} className="text-xs font-medium">Confirmed</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div style={{ backgroundColor: '#ef4444' }} className="w-3 h-3 rounded-full"></div>
                                <span style={{ color: '#6b7280' }} className="text-xs font-medium">Cancelled</span>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar - Selected Date Details */}
                    <div className="lg:col-span-1">
                        <div className="rounded-2xl shadow-sm overflow-hidden sticky top-6 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                            {/* Sidebar Header */}
                            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                    {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a Date'}
                                </h3>
                                {selectedDate && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {shootsForSelectedDate.length} shoot{shootsForSelectedDate.length !== 1 ? 's' : ''} scheduled
                                    </p>
                                )}
                            </div>

                            {/* Shoots List - Dynamic Height for better balance */}
                            <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
                                {!selectedDate ? (
                                    <div className="text-center py-8">
                                        <CalendarIcon size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Click on a date to see shoots</p>
                                    </div>
                                ) : shootsForSelectedDate.length === 0 ? (
                                    <div className="text-center py-8">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-gray-100 dark:bg-gray-800">
                                            <CalendarIcon size={24} className="text-gray-400 dark:text-gray-500" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No shoots on this day</p>
                                        {user?.role === 'ADMIN' && (
                                            <Link href="/admin/shoots/new" className="mt-3 inline-block">
                                                <Button size="sm" variant="secondary">Schedule Shoot</Button>
                                            </Link>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {shootsForSelectedDate.map(shoot => {
                                            const statusStyle = getStatusStyle(shoot.status, shoot.id);
                                            const crew = getCrewForShoot(shoot.id);
                                            const isExpanded = selectedShoot?.id === shoot.id;

                                            return (
                                                <div
                                                    key={shoot.id}
                                                    style={{
                                                        borderLeft: `4px solid ${statusStyle.border || statusStyle.text}`
                                                    }}
                                                    className={`rounded-xl overflow-hidden transition-all border ${isExpanded
                                                        ? 'border-blue-500 dark:border-blue-500 ring-1 ring-blue-500'
                                                        : 'border-gray-200 dark:border-gray-800'
                                                        }`}
                                                >
                                                    {/* Shoot Header */}
                                                    <button
                                                        onClick={() => setSelectedShoot(isExpanded ? null : shoot)}
                                                        className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                    >
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <h4 className="font-bold text-[15px] text-gray-900 dark:text-white">
                                                                {shoot.title}
                                                            </h4>
                                                            <span
                                                                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                                                                className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0"
                                                            >
                                                                {shoot.status}
                                                            </span>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <Clock size={12} className="text-gray-400 dark:text-gray-500" />
                                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {shoot.startTime ? format(parseISO(shoot.startTime), 'h:mm a') : 'TBD'}
                                                                    {shoot.endTime && ` - ${format(parseISO(shoot.endTime), 'h:mm a')}`}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <MapPin size={12} className="text-gray-400 dark:text-gray-500" />
                                                                <span className="text-xs truncate text-gray-500 dark:text-gray-400">
                                                                    {shoot.location || 'No location'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Users size={12} className="text-gray-400 dark:text-gray-500" />
                                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {crew.length} crew member{crew.length !== 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>

                                                    {/* Expanded Details */}
                                                    {isExpanded && (
                                                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800">
                                                            {/* POC Details */}
                                                            {(shoot.pocName || shoot.pocContact) && (
                                                                <div className="mb-4">
                                                                    <h5 className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-700 dark:text-gray-300">
                                                                        Point of Contact
                                                                    </h5>
                                                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                                                        <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                                                                            <UserIcon size={16} />
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            {shoot.pocName && (
                                                                                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                                                                                    {shoot.pocName}
                                                                                </p>
                                                                            )}
                                                                            {shoot.pocContact && (
                                                                                <p className="text-xs truncate text-gray-500 dark:text-gray-400">
                                                                                    {shoot.pocContact}
                                                                                </p>
                                                                            )}
                                                                        </div>

                                                                        {/* Actions */}
                                                                        {shoot.pocContact && (
                                                                            <div className="flex items-center gap-1">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        navigator.clipboard.writeText(shoot.pocContact || '');
                                                                                    }}
                                                                                    className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                                                                                    title="Copy"
                                                                                >
                                                                                    <Copy size={14} />
                                                                                </button>

                                                                                {shoot.pocContact.includes('@') ? (
                                                                                    <a
                                                                                        href={`mailto:${shoot.pocContact}`}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        className="p-1.5 rounded-full hover:bg-blue-50 text-blue-500 transition-colors"
                                                                                        title="Send Email"
                                                                                    >
                                                                                        <Mail size={14} />
                                                                                    </a>
                                                                                ) : (
                                                                                    <>
                                                                                        <a
                                                                                            href={`tel:${shoot.pocContact}`}
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            className="p-1.5 rounded-full hover:bg-blue-50 text-blue-500 transition-colors"
                                                                                            title="Call"
                                                                                        >
                                                                                            <Phone size={14} />
                                                                                        </a>
                                                                                        <a
                                                                                            href={`https://wa.me/${shoot.pocContact.replace(/\D/g, '')}`}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            className="p-1.5 rounded-full hover:bg-green-50 text-green-600 transition-colors"
                                                                                            title="WhatsApp"
                                                                                        >
                                                                                            <MessageCircle size={14} />
                                                                                        </a>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Crew List */}
                                                            <h5 className="text-xs font-bold uppercase tracking-wider mb-3 text-gray-700 dark:text-gray-300">
                                                                Assigned Crew
                                                            </h5>
                                                            {crew.length === 0 ? (
                                                                <p className="text-xs italic text-gray-400 dark:text-gray-500">No crew assigned</p>
                                                            ) : (
                                                                <div className="space-y-2">
                                                                    {crew.map(member => (
                                                                        <div
                                                                            key={member.id}
                                                                            className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                                                                        >
                                                                            <div
                                                                                style={{
                                                                                    background: member.role === 'Incharge'
                                                                                        ? 'linear-gradient(135deg, #6366f1, #3b82f6)'
                                                                                        : undefined
                                                                                }}
                                                                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${member.role === 'Incharge'
                                                                                    ? 'text-white'
                                                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                                                    }`}
                                                                            >
                                                                                {member.user?.name?.charAt(0) || '?'}
                                                                            </div>
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                                                                                    {member.user?.name || 'Unknown'}
                                                                                </p>
                                                                                <p className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500">
                                                                                    {member.role === 'Incharge' ? 'Lead' : member.user?.role || 'Crew'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* View Details Button - Admin Only */}
                                                            {user?.role === 'ADMIN' && (
                                                                <Link href={`/admin/shoots/${shoot.id}`} className="block mt-4">
                                                                    <Button size="sm" className="w-full">
                                                                        View Full Details
                                                                    </Button>
                                                                </Link>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PullToRefresh>
    );
}
