'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
    Mail
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
    endOfDay
} from 'date-fns';
import { Button } from '@/components/Button';

export default function CalendarPage() {
    const { user } = useAuth();
    const [shoots, setShoots] = useState<Shoot[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedShoot, setSelectedShoot] = useState<Shoot | null>(null);
    const [crewFilter, setCrewFilter] = useState<string>('ALL');

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

    // Filter shoots based on crew selection
    const filteredShoots = useMemo(() => {
        if (crewFilter === 'ALL') return shoots;
        return shoots.filter(shoot => {
            return assignments.some(a => a.shootId === shoot.id && a.userId === crewFilter);
        });
    }, [shoots, assignments, crewFilter]);

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

    // Calendar days calculation
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

        return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
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
            return { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' };
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
        <div className="p-2 sm:p-6 space-y-6 max-w-7xl mx-auto">
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
                    <div className="relative group">
                        <div className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border shadow-sm transition-all cursor-pointer bg-white dark:bg-[#1c1c1e] border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700">
                            <Users size={16} className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                            <select
                                value={crewFilter}
                                onChange={(e) => setCrewFilter(e.target.value)}
                                className="appearance-none bg-transparent text-sm font-medium focus:outline-none cursor-pointer pr-6 text-gray-700 dark:text-gray-300"
                            >
                                <option value="ALL">All Crew</option>
                                {users
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400">
                                <ChevronDown size={14} />
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

                        <div className="grid grid-cols-7">
                            {calendarDays.map((day, index) => {
                                const daysShoots = getShootsForDate(day);
                                const isCurrentMonth = isSameMonth(day, currentMonth);
                                const isSelected = selectedDate && isSameDay(day, selectedDate);
                                const isTodayDate = isToday(day);

                                return (
                                    <button
                                        key={index}
                                        onClick={() => {
                                            setSelectedDate(day);
                                            setSelectedShoot(null);
                                        }}
                                        className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 text-left transition-colors border-b border-gray-100 dark:border-gray-800 ${(index + 1) % 7 !== 0 ? 'border-r border-gray-100 dark:border-gray-800' : ''
                                            } ${isSelected
                                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                            } ${!isCurrentMonth ? 'opacity-40' : ''
                                            }`}
                                    >
                                        {/* Date Number */}
                                        <div className="flex items-center justify-between mb-1">
                                            <span
                                                className={`text-xs sm:text-sm font-semibold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full ${isTodayDate
                                                        ? 'bg-blue-600 text-white'
                                                        : isSelected
                                                            ? 'text-blue-600 dark:text-blue-400'
                                                            : 'text-gray-700 dark:text-gray-300'
                                                    }`}
                                            >
                                                {format(day, 'd')}
                                            </span>
                                            {daysShoots.length > 0 && (
                                                <span className="hidden sm:inline text-[10px] font-medium text-gray-500 dark:text-gray-400">
                                                    {daysShoots.length} shoot{daysShoots.length > 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* Shoots Preview - DESKTOP: Full bars */}
                                        <div className="hidden sm:block space-y-1">
                                            {daysShoots.slice(0, 2).map(shoot => {
                                                const style = getStatusStyle(shoot.status, shoot.id);
                                                const shootStart = startOfDay(parseISO(shoot.startTime!));
                                                const shootEnd = shoot.endTime ? startOfDay(parseISO(shoot.endTime)) : shootStart;
                                                const isMultiDay = !isSameDay(shootStart, shootEnd);
                                                const isStartDay = isSameDay(day, shootStart);
                                                const isEndDay = isSameDay(day, shootEnd);

                                                return (
                                                    <div
                                                        key={shoot.id}
                                                        style={{
                                                            backgroundColor: style.bg,
                                                            color: style.text,
                                                            borderLeft: `3px solid ${style.border || style.text}`,
                                                            marginLeft: isMultiDay && !isStartDay ? '-8px' : '0',
                                                            marginRight: isMultiDay && !isEndDay ? '-8px' : '0',
                                                            paddingLeft: isMultiDay && !isStartDay ? '10px' : '6px',
                                                            paddingRight: isMultiDay && !isEndDay ? '10px' : '6px',
                                                            borderTopLeftRadius: isStartDay || !isMultiDay ? '4px' : '0',
                                                            borderBottomLeftRadius: isStartDay || !isMultiDay ? '4px' : '0',
                                                            borderTopRightRadius: isEndDay || !isMultiDay ? '4px' : '0',
                                                            borderBottomRightRadius: isEndDay || !isMultiDay ? '4px' : '0',
                                                        }}
                                                        className="py-1 text-[11px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedShoot(shoot);
                                                            setSelectedDate(day);
                                                        }}
                                                    >
                                                        {isStartDay && shoot.startTime && (
                                                            <span className="opacity-70 mr-1">{format(parseISO(shoot.startTime), 'h a')}</span>
                                                        )}
                                                        {isStartDay ? shoot.title : (isEndDay && shoot.endTime ? `ends ${format(parseISO(shoot.endTime), 'h a')}` : '')}
                                                    </div>
                                                );
                                            })}
                                            {/* Show colored dots for remaining shoots on desktop */}
                                            {daysShoots.length > 2 && (
                                                <div className="flex items-center gap-1 px-1">
                                                    {daysShoots.slice(2).map(shoot => {
                                                        const style = getStatusStyle(shoot.status, shoot.id);
                                                        return (
                                                            <div
                                                                key={shoot.id}
                                                                style={{ backgroundColor: style.border || style.text }}
                                                                className="w-2 h-2 rounded-full cursor-pointer hover:scale-125 transition-transform"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedShoot(shoot);
                                                                    setSelectedDate(day);
                                                                }}
                                                                title={shoot.title}
                                                            />
                                                        );
                                                    })}
                                                    <span style={{ color: '#6b7280' }} className="text-[9px] font-medium ml-0.5">
                                                        +{daysShoots.length - 2}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Shoots Preview - MOBILE: Just colored dots */}
                                        <div className="sm:hidden">
                                            {daysShoots.length > 0 && (
                                                <div className="flex flex-wrap gap-1 justify-center mt-1">
                                                    {daysShoots.slice(0, 4).map(shoot => {
                                                        const style = getStatusStyle(shoot.status, shoot.id);
                                                        return (
                                                            <div
                                                                key={shoot.id}
                                                                style={{ backgroundColor: style.border || style.text }}
                                                                className="w-2.5 h-2.5 rounded-full"
                                                            />
                                                        );
                                                    })}
                                                    {daysShoots.length > 4 && (
                                                        <span style={{ color: '#6b7280' }} className="text-[8px] font-medium">
                                                            +{daysShoots.length - 4}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </button>
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

                        {/* Shoots List */}
                        <div className="p-4 max-h-[500px] overflow-y-auto">
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
    );
}
