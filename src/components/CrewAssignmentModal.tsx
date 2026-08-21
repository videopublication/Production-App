'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, Shoot, Assignment, Leave } from '@/types';
import { Button } from '@/components/Button';
import {
    Search,
    X,
    Users,
    Calendar,
    AlertTriangle,
    Check,
    CheckCircle2,
    Info,
    Star,
    ArrowLeftRight,
    Trash2,
    Clock,
    ChevronDown,
    Shield,
    Sparkles,
    Filter,
    Edit3
} from 'lucide-react';
import { format, parseISO, eachDayOfInterval, startOfDay, subMinutes, addMinutes } from 'date-fns';

export interface DayScheduleDetail {
    dayNumber: number;
    dateStr: string;
    dayLabel: string; // e.g. "Day 1 • Mon, Aug 18"
    shortDayLabel: string; // e.g. "Day 1 (Aug 18)"
    isFree: boolean;
    type?: 'SHOOT' | 'LEAVE';
    title?: string; // e.g. "#860 Miracle of Mind Tournament"
    shootNumber?: number;
    shootId?: string;
    assignmentId?: string;
    location?: string;
    timingStr?: string; // e.g. "10:00 AM - 6:00 PM"
    leaveReason?: string;
    leaveDates?: string;
}

export interface UserAvailability {
    status: 'AVAILABLE' | 'PARTIAL' | 'BUSY' | 'ON_LEAVE';
    label: string;
    badgeText: string;
    summaryText: string;
    primaryConflictTitle?: string;
    primaryConflictLocation?: string;
    primaryConflictDaysSummary?: string;
    dayBreakdown: DayScheduleDetail[];
    conflicts: DayScheduleDetail[];
    conflictingShoot?: {
        id: string;
        title: string;
        shootNumber?: number;
        startTime?: string;
        endTime?: string;
        location?: string;
        assignmentId?: string;
    };
}

export interface CustomTiming {
    startTime: string; // 'HH:mm' e.g. '14:00'
    endTime: string;   // 'HH:mm' e.g. '17:00'
}

export interface PendingCrossShootSwap {
    thisUserId: string;
    otherShootId: string;
    otherUserId: string;
    otherAssignmentId?: string;
    otherShootTitle: string;
    otherShootNumber?: number;
}

export interface CrewAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    shoot: Shoot;
    users: User[];
    allAssignments: Assignment[];
    allShoots: Shoot[];
    allLeaves: Leave[];
    initialSelectedIds: string[];
    initialRoles?: Record<string, string>;
    initialScopes?: Record<string, string>;
    initialCustomHours?: Record<string, CustomTiming>;
    initialInchargeId: string;
    labels?: {
        teamPlural?: string;
        teamPluralLower?: string;
        leadLabel?: string;
        workSingular?: string;
    };
    onSave: (
        selectedIds: string[],
        selectedRoles: Record<string, string>,
        selectedScopes: Record<string, string>,
        inchargeId: string,
        memberDays: Record<string, string[]>,
        memberCustomHours: Record<string, CustomTiming>,
        pendingSwaps: PendingCrossShootSwap[]
    ) => Promise<void>;
}

export const CREW_SCOPE_OPTIONS = [
    { value: 'Full Shoot', label: 'Full Shoot', icon: '🎬' },
    { value: 'Setup Only', label: 'Setup Only', icon: '🛠️' },
    { value: 'Windup Only', label: 'Windup Only', icon: '📦' },
    { value: 'Custom Hours', label: 'Custom Hours / Part-time', icon: '⏱️' },
];

function formatTime12h(timeStr?: string) {
    if (!timeStr) return '';
    try {
        const [h, m] = timeStr.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
    } catch {
        return timeStr;
    }
}

function getInitials(name?: string | null) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
}

export interface ShootDay {
    dayNumber: number;
    date: Date;
    dateStr: string;
    shortLabel: string;
    fullLabel: string;
    startMs: number;
    endMs: number;
}

export function CrewAssignmentModal({
    isOpen,
    ...props
}: CrewAssignmentModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    return createPortal(
        <CrewAssignmentModalInner
            isOpen={isOpen}
            {...props}
        />,
        document.body
    );
}

function CrewAssignmentModalInner({
    isOpen,
    onClose,
    shoot,
    users,
    allAssignments,
    allShoots,
    allLeaves,
    initialSelectedIds,
    initialRoles = {},
    initialScopes = {},
    initialCustomHours = {},
    initialInchargeId,
    labels = { teamPlural: 'Crew', teamPluralLower: 'crew', leadLabel: 'Incharge', workSingular: 'Shoot' },
    onSave,
}: CrewAssignmentModalProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds || []);
    const [selectedScopes, setSelectedScopes] = useState<Record<string, string>>(initialScopes || {});
    const [memberCustomHours, setMemberCustomHours] = useState<Record<string, CustomTiming>>(initialCustomHours || {});
    const [inchargeId, setInchargeId] = useState<string>(initialInchargeId || '');
    const [memberDays, setMemberDays] = useState<Record<string, string[]>>({});
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ASSIGNED' | 'AVAILABLE' | 'BUSY' | 'ON_LEAVE'>('ALL');
    const [isSaving, setIsSaving] = useState(false);

    // Staged in-memory swaps (Zero premature database commits)
    const [pendingSwaps, setPendingSwaps] = useState<PendingCrossShootSwap[]>([]);

    // Active popovers
    const [activeDayPickerUserId, setActiveDayPickerUserId] = useState<string | null>(null);
    const [activeTimePickerUserId, setActiveTimePickerUserId] = useState<string | null>(null);
    const [activeConflictInfoUserId, setActiveConflictInfoUserId] = useState<string | null>(null);

    // Cross-Shoot Swap Modal State
    const [swapModalData, setSwapModalData] = useState<{
        currentUserId: string;
    } | null>(null);

    const [swapShootSearch, setSwapShootSearch] = useState('');
    const [swapShootFilter, setSwapShootFilter] = useState<'OVERLAPPING' | 'ALL'>('OVERLAPPING');

    // Default Shoot Start/End Time in 'HH:mm'
    const defaultShootTime = useMemo(() => {
        let startTime = '09:00';
        let endTime = '18:00';
        if (shoot?.startTime) {
            try {
                startTime = format(parseISO(shoot.startTime), 'HH:mm');
            } catch {}
        }
        if (shoot?.endTime) {
            try {
                endTime = format(parseISO(shoot.endTime), 'HH:mm');
            } catch {}
        }
        return { startTime, endTime };
    }, [shoot?.startTime, shoot?.endTime]);

    // Multi-Day Shoot Breakdown
    const shootDays: ShootDay[] = useMemo(() => {
        if (!shoot?.startTime) return [];
        try {
            const start = parseISO(shoot.startTime);
            const end = shoot.endTime ? parseISO(shoot.endTime) : start;
            const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
            return days.map((d, index) => {
                const dayStart = startOfDay(d);
                const dayEnd = new Date(d);
                dayEnd.setHours(23, 59, 59, 999);
                return {
                    dayNumber: index + 1,
                    date: d,
                    dateStr: format(d, 'yyyy-MM-dd'),
                    shortLabel: `D${index + 1} (${format(d, 'MMM d')})`,
                    fullLabel: `Day ${index + 1} • ${format(d, 'EEE, MMM d')}`,
                    startMs: dayStart.getTime(),
                    endMs: dayEnd.getTime()
                };
            });
        } catch {
            return [];
        }
    }, [shoot?.startTime, shoot?.endTime]);

    const isMultiDay = shootDays.length > 1;

    // Initial member days setup
    useEffect(() => {
        const initialMemberDays: Record<string, string[]> = {};
        (initialSelectedIds || []).forEach(id => {
            initialMemberDays[id] = shootDays.map(d => d.dateStr);
        });
        setMemberDays(initialMemberDays);
    }, [initialSelectedIds, shootDays]);

    // Keyboard navigation (Escape to close)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (swapModalData) {
                    setSwapModalData(null);
                } else if (activeConflictInfoUserId) {
                    setActiveConflictInfoUserId(null);
                } else if (activeDayPickerUserId) {
                    setActiveDayPickerUserId(null);
                } else if (activeTimePickerUserId) {
                    setActiveTimePickerUserId(null);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [swapModalData, activeConflictInfoUserId, activeDayPickerUserId, activeTimePickerUserId, onClose]);

    // Filter out suspended / inactive accounts
    const assignableUsers = useMemo(() => {
        return (users || []).filter(u => {
            if (u.status === 'SUSPENDED' || u.active === false) return false;
            if (u.canBeAssignedToShoots === false) return false;
            return true;
        });
    }, [users]);

    // Pre-indexed Shoots timestamps (O(1) Map)
    const indexedOtherShoots = useMemo(() => {
        const list: {
            id: string;
            title: string;
            shootNumber?: number;
            startTime?: string;
            endTime?: string;
            location?: string;
            startMs: number;
            endMs: number;
            status?: string;
        }[] = [];
        for (const s of (allShoots || [])) {
            if (s.id === shoot?.id || s.status === 'CANCELLED' || s.status === 'CLOSED' || !s.startTime) continue;
            const sStart = new Date(s.startTime).getTime();
            const sEnd = s.endTime ? new Date(s.endTime).getTime() : sStart + 4 * 3600000;
            list.push({
                id: s.id,
                title: s.title,
                shootNumber: s.shootNumber,
                startTime: s.startTime,
                endTime: s.endTime,
                location: s.location,
                startMs: sStart,
                endMs: sEnd,
                status: s.status
            });
        }
        return list;
    }, [allShoots, shoot?.id]);

    // Pre-indexed Leaves by userId (Map<string, Leave[]>)
    const indexedLeavesByUser = useMemo(() => {
        const map = new Map<string, { startMs: number; endMs: number; startDate: string; endDate: string; reason?: string }[]>();
        for (const l of (allLeaves || [])) {
            if (l.status !== 'APPROVED') continue;
            const lStart = new Date(l.startDate);
            lStart.setHours(0, 0, 0, 0);
            const lEnd = new Date(l.endDate);
            lEnd.setHours(23, 59, 59, 999);

            const userLeaves = map.get(l.userId) || [];
            userLeaves.push({
                startMs: lStart.getTime(),
                endMs: lEnd.getTime(),
                startDate: l.startDate,
                endDate: l.endDate,
                reason: l.reason
            });
            map.set(l.userId, userLeaves);
        }
        return map;
    }, [allLeaves]);

    // Pre-indexed User Assignments Map (Map<string, Assignment[]>)
    const indexedUserAssignments = useMemo(() => {
        const map = new Map<string, { shootId: string; assignmentId: string }[]>();
        for (const a of (allAssignments || [])) {
            if (a.shootId && a.shootId !== shoot?.id) {
                const list = map.get(a.userId) || [];
                list.push({ shootId: a.shootId, assignmentId: a.id });
                map.set(a.userId, list);
            }
        }
        return map;
    }, [allAssignments, shoot?.id]);

    // PER-DAY & OVERALL Availability Index Map
    const availabilityMap = useMemo(() => {
        const map = new Map<string, UserAvailability>();
        const otherShootsMap = new Map(indexedOtherShoots.map(s => [s.id, s]));

        for (const u of assignableUsers) {
            const userLeaves = indexedLeavesByUser.get(u.id) || [];
            const userShootEntries = indexedUserAssignments.get(u.id) || [];
            const dayBreakdown: DayScheduleDetail[] = [];
            let firstConflictingShoot: any = null;

            // Check each day of this shoot individually
            if (shootDays.length > 0) {
                for (const sDay of shootDays) {
                    const leaveOnDay = userLeaves.find(l => sDay.startMs <= l.endMs && sDay.endMs >= l.startMs);
                    if (leaveOnDay) {
                        dayBreakdown.push({
                            dayNumber: sDay.dayNumber,
                            dateStr: sDay.dateStr,
                            dayLabel: sDay.fullLabel,
                            shortDayLabel: sDay.shortLabel,
                            isFree: false,
                            type: 'LEAVE',
                            title: leaveOnDay.reason ? `Leave: ${leaveOnDay.reason}` : 'Approved Leave',
                            leaveReason: leaveOnDay.reason,
                            leaveDates: `${format(new Date(leaveOnDay.startDate), 'MMM d')} - ${format(new Date(leaveOnDay.endDate), 'MMM d')}`
                        });
                        continue;
                    }

                    let foundShoot = false;
                    for (const entry of userShootEntries) {
                        const sInfo = otherShootsMap.get(entry.shootId);
                        if (sInfo && sDay.startMs <= sInfo.endMs && sDay.endMs >= sInfo.startMs) {
                            const shootNum = sInfo.shootNumber ? `#${sInfo.shootNumber} ` : '';
                            let timingStr = '';
                            if (sInfo.startTime) {
                                try {
                                    timingStr = `${format(parseISO(sInfo.startTime), 'p')}${sInfo.endTime ? ` - ${format(parseISO(sInfo.endTime), 'p')}` : ''}`;
                                } catch {}
                            }

                            dayBreakdown.push({
                                dayNumber: sDay.dayNumber,
                                dateStr: sDay.dateStr,
                                dayLabel: sDay.fullLabel,
                                shortDayLabel: sDay.shortLabel,
                                isFree: false,
                                type: 'SHOOT',
                                title: `${shootNum}${sInfo.title}`,
                                shootNumber: sInfo.shootNumber,
                                shootId: sInfo.id,
                                assignmentId: entry.assignmentId,
                                location: sInfo.location,
                                timingStr
                            });

                            if (!firstConflictingShoot) {
                                firstConflictingShoot = { ...sInfo, assignmentId: entry.assignmentId };
                            }
                            foundShoot = true;
                            break;
                        }
                    }

                    if (!foundShoot) {
                        dayBreakdown.push({
                            dayNumber: sDay.dayNumber,
                            dateStr: sDay.dateStr,
                            dayLabel: sDay.fullLabel,
                            shortDayLabel: sDay.shortLabel,
                            isFree: true
                        });
                    }
                }
            } else {
                // Fallback for shoots without specific day breaks
                const shootStartMs = shoot?.startTime ? new Date(shoot.startTime).getTime() : 0;
                const shootEndMs = shoot?.endTime ? new Date(shoot.endTime).getTime() : shootStartMs + 4 * 3600000;

                const leaveOnDay = userLeaves.find(l => shootStartMs <= l.endMs && shootEndMs >= l.startMs);
                if (leaveOnDay) {
                    dayBreakdown.push({
                        dayNumber: 1,
                        dateStr: '',
                        dayLabel: 'Shoot Duration',
                        shortDayLabel: 'Shoot Date',
                        isFree: false,
                        type: 'LEAVE',
                        title: leaveOnDay.reason ? `Leave: ${leaveOnDay.reason}` : 'Approved Leave',
                        leaveReason: leaveOnDay.reason
                    });
                } else {
                    const foundEntry = userShootEntries.find(entry => {
                        const sInfo = otherShootsMap.get(entry.shootId);
                        return sInfo && shootStartMs <= sInfo.endMs && shootEndMs >= sInfo.startMs;
                    });
                    if (foundEntry) {
                        const sInfo = otherShootsMap.get(foundEntry.shootId);
                        const shootNum = sInfo?.shootNumber ? `#${sInfo.shootNumber} ` : '';
                        dayBreakdown.push({
                            dayNumber: 1,
                            dateStr: '',
                            dayLabel: 'Shoot Duration',
                            shortDayLabel: 'Shoot Date',
                            isFree: false,
                            type: 'SHOOT',
                            title: `${shootNum}${sInfo?.title || 'Another Shoot'}`,
                            shootNumber: sInfo?.shootNumber,
                            shootId: sInfo?.id,
                            assignmentId: foundEntry.assignmentId,
                            location: sInfo?.location
                        });
                        firstConflictingShoot = { ...sInfo, assignmentId: foundEntry.assignmentId };
                    } else {
                        dayBreakdown.push({
                            dayNumber: 1,
                            dateStr: '',
                            dayLabel: 'Shoot Duration',
                            shortDayLabel: 'Shoot Date',
                            isFree: true
                        });
                    }
                }
            }

            const conflicts = dayBreakdown.filter(d => !d.isFree);
            const totalDays = dayBreakdown.length;
            const freeCount = totalDays - conflicts.length;

            if (conflicts.length === 0) {
                map.set(u.id, {
                    status: 'AVAILABLE',
                    label: 'Available',
                    badgeText: 'Available',
                    summaryText: 'Available for all shoot days',
                    dayBreakdown,
                    conflicts: []
                });
            } else if (conflicts.length < totalDays) {
                const conflictDaysLabel = conflicts.map(c => `D${c.dayNumber}`).join(', ');
                const firstConflict = conflicts[0];
                map.set(u.id, {
                    status: 'PARTIAL',
                    label: 'Partial',
                    badgeText: isMultiDay ? `Free ${freeCount}/${totalDays}d` : 'Partial',
                    summaryText: `Free ${freeCount}/${totalDays} days • Busy on ${firstConflict.title} (${conflictDaysLabel})`,
                    primaryConflictTitle: firstConflict.title,
                    primaryConflictLocation: firstConflict.location,
                    primaryConflictDaysSummary: conflictDaysLabel,
                    dayBreakdown,
                    conflicts,
                    conflictingShoot: firstConflictingShoot
                });
            } else {
                const hasLeave = conflicts.some(c => c.type === 'LEAVE');
                if (hasLeave && !firstConflictingShoot) {
                    const firstLeave = conflicts.find(c => c.type === 'LEAVE');
                    map.set(u.id, {
                        status: 'ON_LEAVE',
                        label: 'On Leave',
                        badgeText: 'On Leave',
                        summaryText: firstLeave?.leaveReason ? `Leave: ${firstLeave.leaveReason}` : 'Approved Leave during shoot dates',
                        primaryConflictTitle: firstLeave?.title || 'Approved Leave',
                        primaryConflictDaysSummary: firstLeave?.leaveDates || 'All shoot dates',
                        dayBreakdown,
                        conflicts
                    });
                } else {
                    const shootNum = firstConflictingShoot?.shootNumber ? `#${firstConflictingShoot.shootNumber} ` : '';
                    map.set(u.id, {
                        status: 'BUSY',
                        label: 'Busy on Shoot',
                        badgeText: 'Busy on Shoot',
                        summaryText: `Busy on ${shootNum}${firstConflictingShoot?.title || 'Another Shoot'}`,
                        primaryConflictTitle: `${shootNum}${firstConflictingShoot?.title || 'Another Shoot'}`,
                        primaryConflictLocation: firstConflictingShoot?.location,
                        primaryConflictDaysSummary: isMultiDay ? `All ${totalDays} days` : '',
                        dayBreakdown,
                        conflicts,
                        conflictingShoot: firstConflictingShoot
                    });
                }
            }
        }

        return map;
    }, [shootDays, assignableUsers, indexedLeavesByUser, indexedUserAssignments, indexedOtherShoots, isMultiDay, shoot?.startTime, shoot?.endTime]);

    const getAvailability = useCallback((userId: string): UserAvailability => {
        return availabilityMap.get(userId) || {
            status: 'AVAILABLE' as const,
            label: 'Available',
            badgeText: 'Available',
            summaryText: 'Available',
            dayBreakdown: [],
            conflicts: []
        };
    }, [availabilityMap]);

    // Smart Sorting: Available -> Partial -> Busy -> Leave
    const sortedUsers = useMemo(() => {
        const orderWeight: Record<string, number> = {
            'AVAILABLE': 1,
            'PARTIAL': 2,
            'BUSY': 3,
            'ON_LEAVE': 4
        };

        return [...assignableUsers].sort((a, b) => {
            const isSelA = selectedIds.includes(a.id);
            const isSelB = selectedIds.includes(b.id);
            if (isSelA && !isSelB) return -1;
            if (!isSelA && isSelB) return 1;

            const statA = availabilityMap.get(a.id)?.status || 'AVAILABLE';
            const statB = availabilityMap.get(b.id)?.status || 'AVAILABLE';
            const diff = (orderWeight[statA] || 99) - (orderWeight[statB] || 99);
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
        });
    }, [assignableUsers, selectedIds, availabilityMap]);

    // Filtered Crew Members
    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return sortedUsers.filter(u => {
            const isSelected = selectedIds.includes(u.id);
            const avail = getAvailability(u.id);

            if (filter === 'ASSIGNED' && !isSelected) return false;
            if (filter === 'AVAILABLE' && avail.status !== 'AVAILABLE') return false;
            if (filter === 'BUSY' && avail.status !== 'BUSY' && avail.status !== 'PARTIAL') return false;
            if (filter === 'ON_LEAVE' && avail.status !== 'ON_LEAVE') return false;

            if (!q) return true;
            return (
                u.name.toLowerCase().includes(q) ||
                (u.role && u.role.toLowerCase().includes(q)) ||
                (u.phone && u.phone.includes(q)) ||
                avail.summaryText.toLowerCase().includes(q) ||
                (avail.primaryConflictTitle?.toLowerCase().includes(q) ?? false)
            );
        });
    }, [sortedUsers, search, filter, selectedIds, getAvailability]);

    // Filter Badges Counts
    const counts = useMemo(() => {
        let availCount = 0;
        let busyCount = 0;
        let leaveCount = 0;
        for (const u of assignableUsers) {
            const status = availabilityMap.get(u.id)?.status;
            if (status === 'AVAILABLE') availCount++;
            else if (status === 'BUSY' || status === 'PARTIAL') busyCount++;
            else if (status === 'ON_LEAVE') leaveCount++;
        }
        return {
            all: assignableUsers.length,
            assigned: selectedIds.length,
            available: availCount,
            busy: busyCount,
            onLeave: leaveCount
        };
    }, [assignableUsers, availabilityMap, selectedIds.length]);

    // Fast Toggle
    const toggleUser = useCallback((userId: string) => {
        setSelectedIds(prev => {
            if (prev.includes(userId)) {
                if (inchargeId === userId) {
                    setInchargeId('');
                }
                setMemberDays(md => {
                    const next = { ...md };
                    delete next[userId];
                    return next;
                });
                setSelectedScopes(s => {
                    const next = { ...s };
                    delete next[userId];
                    return next;
                });
                setMemberCustomHours(ch => {
                    const next = { ...ch };
                    delete next[userId];
                    return next;
                });
                return prev.filter(id => id !== userId);
            } else {
                setSelectedScopes(s => ({
                    ...s,
                    [userId]: s[userId] || 'Full Shoot'
                }));
                setMemberDays(md => ({
                    ...md,
                    [userId]: shootDays.map(d => d.dateStr)
                }));
                return [...prev, userId];
            }
        });
    }, [inchargeId, shootDays]);

    // Set Scope (Full Shoot, Setup Only, Windup Only, Custom Hours)
    const setMemberScope = useCallback((userId: string, scope: string) => {
        setSelectedScopes(prev => ({
            ...prev,
            [userId]: scope
        }));
        if (scope === 'Custom Hours') {
            setMemberCustomHours(prev => ({
                ...prev,
                [userId]: prev[userId] || { startTime: defaultShootTime.startTime, endTime: defaultShootTime.endTime }
            }));
            setActiveTimePickerUserId(userId);
        }
    }, [defaultShootTime]);

    // Update Custom Timing for individual user
    const updateMemberTiming = useCallback((userId: string, startTime: string, endTime: string) => {
        setMemberCustomHours(prev => ({
            ...prev,
            [userId]: { startTime, endTime }
        }));
    }, []);

    // Toggle Lead Incharge
    const toggleIncharge = useCallback((userId: string) => {
        if (inchargeId === userId) {
            setInchargeId('');
        } else {
            setInchargeId(userId);
            if (!selectedIds.includes(userId)) {
                toggleUser(userId);
            }
        }
    }, [inchargeId, selectedIds, toggleUser]);

    // Toggle Single Day for Member
    const toggleMemberDay = useCallback((userId: string, dateStr: string) => {
        setMemberDays(prev => {
            const current = prev[userId] || shootDays.map(d => d.dateStr);
            const isCurrentlySelected = current.includes(dateStr);
            let nextDays: string[];
            if (isCurrentlySelected) {
                if (current.length === 1) return prev;
                nextDays = current.filter(d => d !== dateStr);
            } else {
                nextDays = [...current, dateStr];
            }
            return {
                ...prev,
                [userId]: nextDays
            };
        });
    }, [shootDays]);

    const setMemberAllDays = useCallback((userId: string) => {
        setMemberDays(prev => ({
            ...prev,
            [userId]: shootDays.map(d => d.dateStr)
        }));
    }, [shootDays]);

    // Stage Cross-Shoot Swap in Memory
    const stageCrossShootSwap = (thisShootUserId: string, otherShoot: any, otherUser: User, otherAssignmentId?: string) => {
        setPendingSwaps(prev => [
            ...prev.filter(p => p.thisUserId !== thisShootUserId && p.otherUserId !== otherUser.id),
            {
                thisUserId: thisShootUserId,
                otherShootId: otherShoot.id,
                otherUserId: otherUser.id,
                otherAssignmentId,
                otherShootTitle: otherShoot.title,
                otherShootNumber: otherShoot.shootNumber
            }
        ]);

        const oldScope = selectedScopes[thisShootUserId] || 'Full Shoot';
        const oldDays = memberDays[thisShootUserId] || shootDays.map(d => d.dateStr);
        const oldTiming = memberCustomHours[thisShootUserId];
        const wasIncharge = inchargeId === thisShootUserId;

        setSelectedIds(prev => prev.map(id => (id === thisShootUserId ? otherUser.id : id)));
        setSelectedScopes(prev => {
            const next = { ...prev };
            delete next[thisShootUserId];
            next[otherUser.id] = oldScope;
            return next;
        });
        setMemberDays(prev => {
            const next = { ...prev };
            delete next[thisShootUserId];
            next[otherUser.id] = oldDays;
            return next;
        });
        if (oldTiming) {
            setMemberCustomHours(prev => {
                const next = { ...prev };
                delete next[thisShootUserId];
                next[otherUser.id] = oldTiming;
                return next;
            });
        }
        if (wasIncharge) {
            setInchargeId(otherUser.id);
        }

        setSwapModalData(null);
    };

    // Lazy Other Shoots for Swap Dialog
    const availableOtherShootsForSwap = useMemo(() => {
        if (!swapModalData) return [];
        const shootStart = shoot?.startTime ? new Date(shoot.startTime).getTime() : 0;
        const shootEnd = shoot?.endTime ? new Date(shoot.endTime).getTime() : shootStart + 4 * 3600000;
        const q = swapShootSearch.trim().toLowerCase();

        return indexedOtherShoots.filter(s => {
            if (swapShootFilter === 'OVERLAPPING' && shootStart && s.startMs) {
                if (!(shootStart < s.endMs && shootEnd > s.startMs)) return false;
            }
            if (!q) return true;
            return (
                (s.title && s.title.toLowerCase().includes(q)) ||
                (s.shootNumber && String(s.shootNumber).includes(q))
            );
        });
    }, [swapModalData, shoot?.startTime, shoot?.endTime, indexedOtherShoots, swapShootSearch, swapShootFilter]);

    // Save Final Assignments
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const rolesRecord: Record<string, string> = {};
            selectedIds.forEach(id => {
                const u = users.find(x => x.id === id);
                rolesRecord[id] = u?.role || 'Crew';
            });
            await onSave(selectedIds, rolesRecord, selectedScopes, inchargeId, memberDays, memberCustomHours, pendingSwaps);
            onClose();
        } catch (error) {
            console.error('Failed to save assignments:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            id="crew-assignment-modal-backdrop"
            onClick={handleBackdropClick}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 md:p-6"
        >
            <div className="w-full max-w-6xl h-[92vh] max-h-[880px] rounded-2xl bg-white dark:bg-[#121214] border border-gray-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
                
                {/* 1. Header Bar */}
                <div className="px-6 py-4 border-b border-gray-150 dark:border-zinc-800 bg-gray-50/80 dark:bg-zinc-900/70 shrink-0">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-gray-200/80 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 flex items-center justify-center shrink-0 shadow-2xs">
                                <Users size={18} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate tracking-tight">
                                        Assign {labels.teamPlural}
                                    </h2>
                                    {isMultiDay && (
                                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 shrink-0">
                                            📅 {shootDays.length}-Day Shoot
                                        </span>
                                    )}
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary text-white shrink-0 shadow-2xs">
                                        {selectedIds.length} Assigned
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {shoot.startTime ? format(parseISO(shoot.startTime), 'EEE, MMM d, yyyy • h:mm a') : 'Schedule TBD'}
                                    {shoot.endTime && ` – ${format(parseISO(shoot.endTime), 'h:mm a')}`}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/80 dark:hover:bg-zinc-800 cursor-pointer transition-colors shrink-0"
                            aria-label="Close modal"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* 2. Search & Filter Bar */}
                <div className="px-6 py-3.5 border-b border-gray-150 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#121214] shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search team member by name, role or phone..."
                            className="w-full text-xs sm:text-sm pl-9 pr-8 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50/70 dark:bg-zinc-800/80 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-2xs"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
                        <button
                            type="button"
                            onClick={() => setFilter('ALL')}
                            className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 cursor-pointer ${
                                filter === 'ALL'
                                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs'
                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                            }`}
                        >
                            All ({counts.all})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter('ASSIGNED')}
                            className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                                filter === 'ASSIGNED'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'bg-primary/10 text-primary dark:text-primary hover:bg-primary/20'
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                            Assigned ({counts.assigned})
                        </button>
                        {counts.available > 0 && (
                            <button
                                type="button"
                                onClick={() => setFilter('AVAILABLE')}
                                className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                                    filter === 'AVAILABLE'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                Available ({counts.available})
                            </button>
                        )}
                        {counts.busy > 0 && (
                            <button
                                type="button"
                                onClick={() => setFilter('BUSY')}
                                className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                                    filter === 'BUSY'
                                        ? 'bg-rose-600 text-white shadow-xs'
                                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                Busy ({counts.busy})
                            </button>
                        )}
                        {counts.onLeave > 0 && (
                            <button
                                type="button"
                                onClick={() => setFilter('ON_LEAVE')}
                                className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                                    filter === 'ON_LEAVE'
                                        ? 'bg-amber-600 text-white shadow-xs'
                                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                Leave ({counts.onLeave})
                            </button>
                        )}
                    </div>
                </div>

                {/* 3. Single Unified Full-Width Table */}
                <div className="flex-1 overflow-auto min-h-0 bg-white dark:bg-[#121214] scrollbar-thin">
                    <table className="w-full min-w-[720px] text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-zinc-900/95 backdrop-blur-xs border-b border-gray-200 dark:border-zinc-800 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <tr>
                                <th className="w-12 px-4 py-3 text-center">#</th>
                                <th className="px-4 py-3">Crew Member</th>
                                <th className="px-4 py-3 min-w-[220px]">Availability & Schedule</th>
                                <th className="px-4 py-3 w-64">Scope / Support Timing</th>
                                {isMultiDay && <th className="px-4 py-3 w-36">Days</th>}
                                <th className="px-4 py-3 w-28 text-center">Incharge</th>
                                <th className="px-4 py-3 w-20 text-right pr-6">Swap</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/80 text-xs sm:text-sm">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-20 text-gray-400">
                                        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No team members match filter</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u, uIdx) => {
                                    const isSelected = selectedIds.includes(u.id);
                                    const avail = getAvailability(u.id);
                                    const currentScope = selectedScopes[u.id] || 'Full Shoot';
                                    const customTiming = memberCustomHours[u.id] || defaultShootTime;
                                    const isIncharge = inchargeId === u.id;
                                    const assignedDays = memberDays[u.id] || shootDays.map(d => d.dateStr);
                                    const isCustomDays = isMultiDay && assignedDays.length < shootDays.length;
                                    const isNearBottom = uIdx >= Math.max(0, filteredUsers.length - 3) && filteredUsers.length > 4;

                                    return (
                                        <tr
                                            key={u.id}
                                            className={`hover:bg-gray-50/90 dark:hover:bg-zinc-800/50 transition-colors ${
                                                isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''
                                            }`}
                                        >
                                            {/* 1: Checkbox */}
                                            <td className="px-4 py-3.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleUser(u.id)}
                                                    className="w-4.5 h-4.5 rounded text-primary focus:ring-primary/40 cursor-pointer accent-primary"
                                                />
                                            </td>

                                            {/* 2: Crew Member Name + Role */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200/80 dark:border-zinc-700 shadow-2xs">
                                                        {getInitials(u.name)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                                                            {u.name}
                                                        </div>
                                                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                                            {u.role || 'Crew'} {u.phone ? `• ${u.phone}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 3: Availability Badge & Schedule Details */}
                                            <td className="px-4 py-3.5 align-top">
                                                <div className="space-y-1 relative">
                                                    {avail.status === 'AVAILABLE' ? (
                                                        <div className="flex items-center gap-1.5 pt-0.5">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Available</span>
                                                            {isMultiDay && (
                                                                <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">({shootDays.length}/{shootDays.length}d free)</span>
                                                            )}
                                                        </div>
                                                    ) : avail.status === 'PARTIAL' ? (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span
                                                                    onClick={() => setActiveConflictInfoUserId(activeConflictInfoUserId === u.id ? null : u.id)}
                                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/40 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                                                                    title="Click to view day-by-day conflict details"
                                                                >
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                                                    <span>{avail.badgeText}</span>
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveConflictInfoUserId(activeConflictInfoUserId === u.id ? null : u.id)}
                                                                    className="text-[11px] text-primary hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                                                                >
                                                                    <Info size={11} />
                                                                    <span>Details</span>
                                                                </button>
                                                            </div>

                                                            {/* Subtitle with exact shoot & dates */}
                                                            <div className="text-[11px] leading-tight space-y-0.5">
                                                                {avail.conflicts.map((c, idx) => (
                                                                    <div key={idx} className="text-gray-600 dark:text-gray-400 flex items-start gap-1" title={`${c.dayLabel}: ${c.title}${c.location ? ` @ ${c.location}` : ''}`}>
                                                                        <span className="font-semibold text-rose-600 dark:text-rose-400 shrink-0">{c.shortDayLabel}:</span>
                                                                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[280px]">{c.title}</span>
                                                                    </div>
                                                                ))}
                                                                {avail.primaryConflictLocation && (
                                                                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[280px]">
                                                                        📍 {avail.primaryConflictLocation}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : avail.status === 'BUSY' ? (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span
                                                                    onClick={() => setActiveConflictInfoUserId(activeConflictInfoUserId === u.id ? null : u.id)}
                                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200/60 dark:border-rose-800/40 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                                                                    title="Click to view shoot details"
                                                                >
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                                                    <span>Busy on Shoot</span>
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveConflictInfoUserId(activeConflictInfoUserId === u.id ? null : u.id)}
                                                                    className="text-[11px] text-primary hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                                                                >
                                                                    <Info size={11} />
                                                                    <span>Details</span>
                                                                </button>
                                                            </div>

                                                            {/* Subtitle with full shoot title and location */}
                                                            <div className="text-[11px] leading-tight space-y-0.5">
                                                                <div
                                                                    className="font-bold text-rose-600 dark:text-rose-400 truncate max-w-[280px]"
                                                                    title={avail.primaryConflictTitle}
                                                                >
                                                                    {avail.primaryConflictTitle}
                                                                </div>
                                                                {avail.primaryConflictLocation && (
                                                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[280px]">
                                                                        📍 {avail.primaryConflictLocation}
                                                                    </div>
                                                                )}
                                                                {avail.primaryConflictDaysSummary && (
                                                                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                                                                        ⏱️ {avail.primaryConflictDaysSummary}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span
                                                                    onClick={() => setActiveConflictInfoUserId(activeConflictInfoUserId === u.id ? null : u.id)}
                                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/40 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                                                                    title="Click to view leave details"
                                                                >
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                                                    <span>On Leave</span>
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveConflictInfoUserId(activeConflictInfoUserId === u.id ? null : u.id)}
                                                                    className="text-[11px] text-primary hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                                                                >
                                                                    <Info size={11} />
                                                                    <span>Details</span>
                                                                </button>
                                                            </div>
                                                            <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium leading-tight truncate max-w-[280px]" title={avail.summaryText}>
                                                                {avail.summaryText}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Schedule Breakdown Popover */}
                                                    {activeConflictInfoUserId === u.id && (
                                                        <div
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={`absolute left-0 ${isNearBottom ? 'bottom-full mb-2' : 'top-full mt-2'} z-40 w-80 p-3.5 rounded-2xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-100 text-left select-none ring-1 ring-black/10 dark:ring-white/10`}
                                                        >
                                                            {/* Header */}
                                                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-zinc-700">
                                                                <div className="min-w-0 pr-2">
                                                                    <div className="font-bold text-gray-900 dark:text-white text-xs truncate">
                                                                        {u.name}&apos;s Schedule
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-400">
                                                                        {isMultiDay ? `${shootDays.length}-day shoot breakdown` : 'Shoot date availability'}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveConflictInfoUserId(null)}
                                                                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
                                                                >
                                                                    <X size={13} />
                                                                </button>
                                                            </div>

                                                            {/* Day-by-Day Schedule List */}
                                                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                                                                {avail.dayBreakdown.map((day, dIdx) => (
                                                                    <div
                                                                        key={dIdx}
                                                                        className={`p-2.5 rounded-xl border text-xs ${
                                                                            day.isFree
                                                                                ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                                                                                : day.type === 'LEAVE'
                                                                                ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40 text-amber-900 dark:text-amber-200'
                                                                                : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center justify-between font-semibold mb-1">
                                                                            <span className="text-xs">{day.dayLabel}</span>
                                                                            {day.isFree ? (
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                                                                                    <Check size={10} /> Free
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-900/40 px-1.5 py-0.5 rounded">
                                                                                    ✕ {day.type === 'LEAVE' ? 'On Leave' : 'Busy'}
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        {!day.isFree && (
                                                                            <div className="space-y-0.5 text-[11px] pt-1 border-t border-black/5 dark:border-white/5">
                                                                                {day.type === 'LEAVE' ? (
                                                                                    <div className="text-amber-800 dark:text-amber-300">
                                                                                        🌴 {day.leaveReason ? `Reason: ${day.leaveReason}` : 'Approved Leave'}
                                                                                    </div>
                                                                                ) : (
                                                                                    <>
                                                                                        <div className="font-bold text-rose-700 dark:text-rose-300">
                                                                                            🎬 {day.title}
                                                                                        </div>
                                                                                        {day.location && (
                                                                                            <div className="text-[10px] text-gray-600 dark:text-gray-400">
                                                                                                📍 {day.location}
                                                                                            </div>
                                                                                        )}
                                                                                        {day.timingStr && (
                                                                                            <div className="text-[10px] text-gray-600 dark:text-gray-400">
                                                                                                ⏱️ {day.timingStr}
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Footer Action: 1-Click Swap */}
                                                            {avail.conflictingShoot && (
                                                                <div className="pt-2 border-t border-gray-100 dark:border-zinc-700 flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] text-gray-400">Need this crew member?</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setActiveConflictInfoUserId(null);
                                                                            setSwapModalData({ currentUserId: u.id });
                                                                        }}
                                                                        className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                                                                    >
                                                                        <ArrowLeftRight size={11} />
                                                                        <span>Swap Crew</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 4: Operational Scope & Custom Hours */}
                                            <td className="px-4 py-3.5">
                                                {isSelected ? (
                                                    <div className="space-y-1 relative">
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                value={currentScope}
                                                                onChange={(e) => setMemberScope(u.id, e.target.value)}
                                                                className={`text-xs font-semibold py-1.5 px-3 rounded-xl border cursor-pointer focus:outline-none flex-1 min-w-0 transition-all shadow-2xs ${
                                                                    currentScope === 'Setup Only'
                                                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                                                        : currentScope === 'Windup Only'
                                                                        ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                                                        : currentScope === 'Custom Hours'
                                                                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                                                        : 'bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-zinc-700'
                                                                }`}
                                                            >
                                                                {CREW_SCOPE_OPTIONS.map(opt => (
                                                                    <option key={opt.value} value={opt.value}>
                                                                        {opt.icon} {opt.label}
                                                                    </option>
                                                                ))}
                                                            </select>

                                                            {currentScope === 'Custom Hours' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveTimePickerUserId(activeTimePickerUserId === u.id ? null : u.id)}
                                                                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 flex items-center gap-1.5 cursor-pointer shrink-0"
                                                                    title="Edit specific timing"
                                                                >
                                                                    <Clock size={13} />
                                                                    <span>{formatTime12h(customTiming.startTime)} - {formatTime12h(customTiming.endTime)}</span>
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Custom Hours Popover */}
                                                        {activeTimePickerUserId === u.id && (
                                                            <div className="absolute left-0 top-full mt-1.5 z-30 w-72 p-3.5 rounded-2xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-100">
                                                                <div className="flex items-center justify-between text-xs font-bold pb-2 border-b border-gray-150 dark:border-zinc-700 text-gray-800 dark:text-gray-200">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <Clock size={14} className="text-amber-500" />
                                                                        Support Timing
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setActiveTimePickerUserId(null)}
                                                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-2.5 text-xs">
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                                                                            From
                                                                        </label>
                                                                        <input
                                                                            type="time"
                                                                            value={customTiming.startTime}
                                                                            onChange={(e) => updateMemberTiming(u.id, e.target.value, customTiming.endTime)}
                                                                            className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white font-semibold text-xs focus:ring-2 focus:ring-primary/40 focus:outline-none"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                                                                            To
                                                                        </label>
                                                                        <input
                                                                            type="time"
                                                                            value={customTiming.endTime}
                                                                            onChange={(e) => updateMemberTiming(u.id, customTiming.startTime, e.target.value)}
                                                                            className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white font-semibold text-xs focus:ring-2 focus:ring-primary/40 focus:outline-none"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Quick Preset Buttons */}
                                                                <div className="pt-2 border-t border-gray-150 dark:border-zinc-700">
                                                                    <span className="block text-[10px] font-bold uppercase text-gray-400 mb-1.5">Quick Presets</span>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (shoot.startTime) {
                                                                                    const st = parseISO(shoot.startTime);
                                                                                    const setupStart = subMinutes(st, 60);
                                                                                    updateMemberTiming(u.id, format(setupStart, 'HH:mm'), format(st, 'HH:mm'));
                                                                                }
                                                                            }}
                                                                            className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                                                                        >
                                                                            1h Setup
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (shoot.startTime) {
                                                                                    const st = parseISO(shoot.startTime);
                                                                                    const setupStart = subMinutes(st, 120);
                                                                                    updateMemberTiming(u.id, format(setupStart, 'HH:mm'), format(st, 'HH:mm'));
                                                                                }
                                                                            }}
                                                                            className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                                                                        >
                                                                            2h Setup
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (shoot.endTime) {
                                                                                    const et = parseISO(shoot.endTime);
                                                                                    const windupEnd = addMinutes(et, 60);
                                                                                    updateMemberTiming(u.id, format(et, 'HH:mm'), format(windupEnd, 'HH:mm'));
                                                                                }
                                                                            }}
                                                                            className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-gray-700 dark:text-gray-300 cursor-pointer font-medium"
                                                                        >
                                                                            1h Windup
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveTimePickerUserId(null)}
                                                                    className="w-full py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-2xs"
                                                                >
                                                                    Done
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 dark:text-zinc-600 text-xs italic">Not assigned</span>
                                                )}
                                            </td>

                                            {/* 5: Multi-Day Days Selector */}
                                            {isMultiDay && (
                                                <td className="px-4 py-3.5">
                                                    {isSelected ? (
                                                        <div className="relative">
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveDayPickerUserId(activeDayPickerUserId === u.id ? null : u.id)}
                                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center justify-between w-full cursor-pointer shadow-2xs ${
                                                                    isCustomDays
                                                                        ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                                                                        : 'bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700'
                                                                }`}
                                                            >
                                                                <span>{assignedDays.length}/{shootDays.length} Days</span>
                                                                <ChevronDown size={12} className="text-gray-400 ml-1.5" />
                                                            </button>

                                                            {/* Day Picker Popover */}
                                                            {activeDayPickerUserId === u.id && (
                                                                <div className="absolute left-0 top-full mt-1.5 z-30 w-64 p-3 rounded-2xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-2xl space-y-2 animate-in fade-in zoom-in-95 duration-100">
                                                                    <div className="flex items-center justify-between text-xs font-bold pb-1.5 border-b border-gray-150 dark:border-zinc-700">
                                                                        <span className="text-gray-700 dark:text-gray-300">Select Days</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setMemberAllDays(u.id)}
                                                                            className="text-primary hover:underline text-[11px] font-semibold cursor-pointer"
                                                                        >
                                                                            All Days
                                                                        </button>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        {shootDays.map(day => {
                                                                            const isDaySelected = assignedDays.includes(day.dateStr);
                                                                            const dayConflict = avail.conflicts.find(c => c.dateStr === day.dateStr);

                                                                            return (
                                                                                <label
                                                                                    key={day.dateStr}
                                                                                    className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-700/50 cursor-pointer text-xs transition-colors"
                                                                                >
                                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={isDaySelected}
                                                                                            onChange={() => toggleMemberDay(u.id, day.dateStr)}
                                                                                            className="w-4 h-4 rounded text-primary focus:ring-primary/40"
                                                                                        />
                                                                                        <span className="text-gray-900 dark:text-white font-medium text-xs truncate">
                                                                                            {day.fullLabel}
                                                                                        </span>
                                                                                    </div>
                                                                                    {dayConflict && (
                                                                                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md shrink-0 truncate max-w-[120px]" title={dayConflict.title}>
                                                                                            ⚠️ {dayConflict.title || dayConflict.type}
                                                                                        </span>
                                                                                    )}
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300 dark:text-zinc-700 text-xs font-mono">—</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* 6: Incharge Toggle */}
                                            <td className="px-4 py-3.5 text-center">
                                                {isSelected ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleIncharge(u.id)}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs ${
                                                            isIncharge
                                                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                                                : 'text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-zinc-800 border border-transparent'
                                                        }`}
                                                        title={isIncharge ? 'Designated Incharge' : 'Make Incharge'}
                                                    >
                                                        <Star size={13} className={isIncharge ? 'fill-amber-500 text-amber-500' : ''} />
                                                        <span>{isIncharge ? 'Incharge' : 'Make'}</span>
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-300 dark:text-zinc-700 text-xs font-mono">—</span>
                                                )}
                                            </td>

                                            {/* 7: Actions */}
                                            <td className="px-4 py-3.5 text-right pr-6">
                                                {isSelected ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSwapModalData({
                                                            currentUserId: u.id
                                                        })}
                                                        className="p-2 rounded-xl text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                                        title={`Swap ${u.name} with another crew member`}
                                                    >
                                                        <ArrowLeftRight size={14} />
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-300 dark:text-zinc-700 text-xs font-mono">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 4. Footer */}
                <div className="px-6 py-4 bg-gray-50/90 dark:bg-zinc-900/80 border-t border-gray-150 dark:border-zinc-800 flex items-center justify-between gap-4 shrink-0">
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        <strong className="text-gray-900 dark:text-white font-bold">{selectedIds.length}</strong> crew assigned
                        {inchargeId && users.find(u => u.id === inchargeId) && (
                            <span className="hidden sm:inline"> • Incharge: <strong className="text-amber-600 dark:text-amber-400 font-bold">{users.find(u => u.id === inchargeId)?.name}</strong></span>
                        )}
                        {pendingSwaps.length > 0 && (
                            <span className="ml-2.5 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold text-xs">
                                {pendingSwaps.length} staged swap{pendingSwaps.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            size="md"
                            onClick={onClose}
                            disabled={isSaving}
                            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="md"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-6 py-2 rounded-xl text-xs sm:text-sm font-bold bg-primary text-white hover:bg-primary/90 shadow-xs hover:shadow-primary/20"
                        >
                            {isSaving ? 'Saving...' : `Save Assignments (${selectedIds.length})`}
                        </Button>
                    </div>
                </div>
            </div>

            {/* 5. Cross-Shoot Swap Modal */}
            {swapModalData && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-3 sm:p-4 select-none">
                    <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#18181b] border border-gray-200 dark:border-zinc-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="p-3.5 border-b border-gray-150 dark:border-zinc-800 flex items-center justify-between bg-gray-50 dark:bg-zinc-900/60">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
                                    <ArrowLeftRight size={14} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                                        Swap Crew Across Shoots
                                    </h3>
                                    <p className="text-[11px] text-gray-400">
                                        Exchange {users.find(u => u.id === swapModalData.currentUserId)?.name} with crew on another shoot (Staged until saved)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSwapModalData(null)}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Search & Filter */}
                        <div className="p-2.5 border-b border-gray-100 dark:border-zinc-800 space-y-2 bg-white dark:bg-[#18181b]">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={swapShootSearch}
                                    onChange={(e) => setSwapShootSearch(e.target.value)}
                                    placeholder="Search shoot by title or #number..."
                                    className="w-full text-xs pl-8 pr-7 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                {swapShootSearch && (
                                    <button
                                        onClick={() => setSwapShootSearch('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 text-[11px]">
                                <button
                                    type="button"
                                    onClick={() => setSwapShootFilter('OVERLAPPING')}
                                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                        swapShootFilter === 'OVERLAPPING'
                                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                                    }`}
                                >
                                    Overlapping Schedule ({indexedOtherShoots.filter(s => {
                                        const shootStart = shoot?.startTime ? new Date(shoot.startTime).getTime() : 0;
                                        const shootEnd = shoot?.endTime ? new Date(shoot.endTime).getTime() : shootStart + 4 * 3600000;
                                        return shootStart < s.endMs && shootEnd > s.startMs;
                                    }).length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSwapShootFilter('ALL')}
                                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                        swapShootFilter === 'ALL'
                                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                                    }`}
                                >
                                    All Active Shoots ({indexedOtherShoots.length})
                                </button>
                            </div>
                        </div>

                        {/* List of other ongoing/active shoots and their crew */}
                        <div className="p-3 overflow-y-auto flex-1 space-y-2.5 scrollbar-thin">
                            {availableOtherShootsForSwap.length === 0 ? (
                                <div className="text-center py-8 text-xs text-gray-400 space-y-1">
                                    <AlertTriangle size={20} className="mx-auto text-amber-500 mb-1" />
                                    <p className="font-semibold text-gray-600 dark:text-gray-300">No shoots found</p>
                                    <p className="text-gray-400">Try switching to &quot;All Active Shoots&quot; or clearing your search.</p>
                                </div>
                            ) : (
                                availableOtherShootsForSwap.map(otherShoot => {
                                    const otherCrewAssignments = allAssignments.filter(a => a.shootId === otherShoot.id);
                                    const shootNum = otherShoot.shootNumber ? `#${otherShoot.shootNumber} ` : '';

                                    return (
                                        <div
                                            key={otherShoot.id}
                                            className="p-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 space-y-2"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-xs text-gray-900 dark:text-white truncate">
                                                        {shootNum}{otherShoot.title}
                                                    </h4>
                                                    <p className="text-[10px] text-gray-400">
                                                        {otherShoot.startTime ? format(new Date(otherShoot.startTime), 'MMM d, yyyy • h:mm a') : 'TBD'}
                                                    </p>
                                                </div>
                                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 shrink-0">
                                                    {otherCrewAssignments.length} Crew
                                                </span>
                                            </div>

                                            <div className="space-y-1 pt-1">
                                                {otherCrewAssignments.length === 0 ? (
                                                    <p className="text-[11px] text-gray-400 italic">No crew assigned to this shoot yet</p>
                                                ) : (
                                                    otherCrewAssignments.map(assignment => {
                                                        const otherUser = users.find(u => u.id === assignment.userId);
                                                        if (!otherUser) return null;

                                                        return (
                                                            <div
                                                                key={assignment.id}
                                                                className="flex items-center justify-between p-1.5 px-2 rounded-lg bg-white dark:bg-zinc-800 border border-gray-150 dark:border-zinc-700/70 hover:border-primary/50 transition-colors"
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="w-5 h-5 rounded flex items-center justify-center font-bold text-[9px] bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700">
                                                                        {getInitials(otherUser.name)}
                                                                    </div>
                                                                    <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                                                                        {otherUser.name}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-400">
                                                                        ({assignment.role || 'Crew'})
                                                                    </span>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => stageCrossShootSwap(swapModalData.currentUserId, otherShoot, otherUser, assignment.id)}
                                                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
                                                                >
                                                                    Stage Swap With {otherUser.name.split(' ')[0]}
                                                                </button>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
