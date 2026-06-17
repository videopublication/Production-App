'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    addDays,
    addMonths,
    differenceInCalendarDays,
    differenceInMilliseconds,
    eachDayOfInterval,
    endOfDay,
    endOfMonth,
    format,
    isSameDay,
    isToday,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import {
    AlertTriangle,
    CalendarPlus,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Download,
    ExternalLink,
    MapPin,
    Plus,
    Search,
    Trash2,
    UserCheck,
    Users,
} from 'lucide-react';
import { Assignment, AssignmentSegment, Leave, PlannerDraftAssignment, Shoot, User } from '@/types';
import { DepartmentLabels } from '@/lib/department-labels';
import { getRoleLabel } from '@/lib/roles';
import { storage } from '@/lib/storage';
import { generateUUID } from '@/lib/id';
import { sendPushNotification } from '@/lib/push-notifications';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { Button } from './Button';

type ShootPlannerProps = {
    shoots: Shoot[];
    assignments: Assignment[];
    draftAssignments: PlannerDraftAssignment[];
    assignmentSegments: AssignmentSegment[];
    users: User[];
    leaves: Leave[];
    labels: DepartmentLabels;
    currentUser?: User | null;
    activeDepartmentId?: string | null;
    crewFilter?: string;
    onCrewFilterChange?: (value: string) => void;
    initialWeek?: string | null;
    initialRange?: string | null;
    onRefresh: () => Promise<void>;
};

type PlannerAssignment = {
    assignment: Assignment | PlannerDraftAssignment;
    shoot: Shoot;
    isDraft: boolean;
    segment?: AssignmentSegment;
};
type ShootDayConflict = {
    key: string;
    user?: User;
    first: PlannerAssignment;
    second: PlannerAssignment;
    overlapStart: Date;
    overlapEnd: Date;
};

type CrewRosterMode = 'CREW_ONLY' | 'ASSIGNED' | 'ALL_ACTIVE';
type PlannerRange = 'WEEK' | 'TWO_WEEK' | 'MONTH';
type PlannerViewMode = 'CREW' | 'SHOOT';
type PlannerAssignmentMode = 'DRAFT' | 'PUBLISH';
type PlannerScheduleMode = 'FULL_SHOOT' | 'SELECTED_DAY' | 'CUSTOM';
type CrewAvailabilityStatus = 'AVAILABLE' | 'CONFLICT' | 'ABSENT' | 'ASSIGNED';
type PlannerItemPlacement = {
    columnStart: number;
    columnSpan: number;
    columnEnd: number;
};
type PackedPlannerItem = {
    item: PlannerAssignment;
    placement: PlannerItemPlacement;
    lane: number;
};
type PackedShootRangeBar = {
    shoot: Shoot;
    placement: PlannerItemPlacement;
    lane: number;
};
type ShootTimelineSegment = {
    shoot: Shoot;
    start: Date;
    end: Date;
    startMinutes: number;
    endMinutes: number;
    leftPercent: number;
    widthPercent: number;
    lane: number;
};

const plannerColors = [
    'border-l-primary bg-card text-card-foreground',
    'border-l-primary bg-card text-card-foreground',
    'border-l-primary bg-card text-card-foreground',
    'border-l-primary bg-card text-card-foreground',
    'border-l-primary bg-card text-card-foreground',
    'border-l-primary bg-card text-card-foreground',
];

const plannerAccentColors = [
    'border-l-primary',
    'border-l-primary',
    'border-l-primary',
    'border-l-primary',
    'border-l-primary',
    'border-l-primary',
];

const timelineMinVisualMinutes = 190;

const parseDate = (value?: string | null) => {
    if (!value) return null;
    const date = parseISO(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getShootStart = (shoot: Shoot) => parseDate(shoot.startTime);

const getShootEnd = (shoot: Shoot) => {
    const start = getShootStart(shoot);
    if (!start) return null;

    const end = parseDate(shoot.endTime);
    if (end && end >= start) return end;

    const fallback = new Date(start);
    fallback.setHours(fallback.getHours() + 4);
    return fallback;
};

const intervalsOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) =>
    startA <= endB && startB <= endA;

const timeBlocksOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) =>
    startA < endB && startB < endA;

const shootOverlapsRange = (shoot: Shoot, rangeStart: Date, rangeEnd: Date) => {
    const start = getShootStart(shoot);
    const end = getShootEnd(shoot);
    if (!start || !end) return false;
    return intervalsOverlap(start, end, rangeStart, rangeEnd);
};

const leaveOverlapsDay = (leave: Leave, day: Date) => {
    if (leave.status !== 'APPROVED') return false;
    const start = parseDate(leave.startDate);
    const end = parseDate(leave.endDate);
    if (!start || !end) return false;
    return intervalsOverlap(startOfDay(start), endOfDay(end), startOfDay(day), endOfDay(day));
};

const leaveOverlapsRange = (leave: Leave, rangeStart: Date, rangeEnd: Date) => {
    if (leave.status !== 'APPROVED') return false;
    const start = parseDate(leave.startDate);
    const end = parseDate(leave.endDate);
    if (!start || !end) return false;
    return intervalsOverlap(startOfDay(start), endOfDay(end), rangeStart, rangeEnd);
};

const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
};

const formatTimeRange = (shoot: Shoot) => {
    const start = getShootStart(shoot);
    const end = getShootEnd(shoot);
    if (!start) return 'Time TBD';
    return end ? `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}` : format(start, 'HH:mm');
};

const formatDateTimeLocal = (date: Date) => {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const parseLocalDateKey = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;

    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
};

const combineDateAndTime = (day: Date, source: Date) => {
    const next = new Date(day);
    next.setHours(source.getHours(), source.getMinutes(), 0, 0);
    return next;
};

const formatCsvDateTime = (date?: Date | null) => date ? format(date, 'yyyy-MM-dd HH:mm') : '';

const formatCsvHours = (start?: Date | null, end?: Date | null) => {
    if (!start || !end || end <= start) return '';
    return (differenceInMilliseconds(end, start) / 3600000).toFixed(2);
};

const escapeCsvValue = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildCsv = (headers: string[], rows: string[][]) => {
    return [headers, ...rows]
        .map(row => row.map(escapeCsvValue).join(','))
        .join('\r\n');
};

const canBeAssignedToShoots = (employee: User) => employee.canBeAssignedToShoots ?? employee.role === 'CREW';
const isAssignableCrew = (employee: User) => employee.role === 'CREW' && canBeAssignedToShoots(employee);

type PlannerDropdownOption = {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
};

type PlannerReturnState = {
    returnTo: string;
    windowScrollX: number;
    windowScrollY: number;
    plannerScrollLeft: number;
    plannerScrollTop: number;
    plannerViewMode: PlannerViewMode;
    crewRosterMode: CrewRosterMode;
    selectedPlanDateKey?: string | null;
    selectedShootId?: string;
    selectedUserId?: string;
    selectedPlannerItemKey?: string;
};

const plannerReturnStateKey = 'shootPlanner:returnState';

type PlannerDropdownProps = {
    value: string;
    options: PlannerDropdownOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
};

const PlannerDropdown: React.FC<PlannerDropdownProps> = ({
    value,
    options,
    onChange,
    placeholder = 'Select',
    disabled = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const selectedOption = options.find(option => option.value === value && !option.disabled);
    const enabledOptions = options.filter(option => !option.disabled);
    const isDisabled = disabled || enabledOptions.length === 0;

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    return (
        <div ref={rootRef} className="relative mt-1">
            <button
                type="button"
                disabled={isDisabled}
                onClick={() => setIsOpen(prev => !prev)}
                className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
                <span className={`min-w-0 truncate ${selectedOption ? '' : 'text-muted-foreground'}`}>
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown
                    size={16}
                    className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && !isDisabled && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
                    {enabledOptions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">{placeholder}</div>
                    ) : (
                        enabledOptions.map(option => {
                            const isSelected = option.value === value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                    className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${isSelected
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        }`}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-semibold">{option.label}</span>
                                        {option.description && (
                                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                                {option.description}
                                            </span>
                                        )}
                                    </span>
                                    {isSelected && <Check size={15} className="mt-0.5 shrink-0 text-primary" />}
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};

export const ShootPlanner: React.FC<ShootPlannerProps> = ({
    shoots,
    assignments,
    draftAssignments,
    assignmentSegments,
    users,
    leaves,
    labels,
    currentUser,
    activeDepartmentId,
    crewFilter = 'ALL',
    onCrewFilterChange,
    initialWeek,
    initialRange,
    onRefresh,
}) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [weekStart, setWeekStart] = useState(() => {
        const initialDate = parseDate(initialWeek);
        return startOfWeek(initialDate || new Date(), { weekStartsOn: 0 });
    });
    const [selectedShootId, setSelectedShootId] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedPlannerItemKey, setSelectedPlannerItemKey] = useState('');
    const [plannerRole, setPlannerRole] = useState<'DEFAULT' | 'Incharge'>('DEFAULT');
    const [plannerViewMode, setPlannerViewMode] = useState<PlannerViewMode>('CREW');
    const [plannerRange, setPlannerRange] = useState<PlannerRange>(() => {
        if (initialRange === 'two_week') return 'TWO_WEEK';
        if (initialRange === 'month') return 'MONTH';
        return 'WEEK';
    });
    const [assignmentMode, setAssignmentMode] = useState<PlannerAssignmentMode>('DRAFT');
    const [scheduleMode, setScheduleMode] = useState<PlannerScheduleMode>('FULL_SHOOT');
    const [customSegmentStart, setCustomSegmentStart] = useState('');
    const [customSegmentEnd, setCustomSegmentEnd] = useState('');
    const [crewRosterMode, setCrewRosterMode] = useState<CrewRosterMode>('ALL_ACTIVE');
    const [crewSearch, setCrewSearch] = useState('');
    const [shootSearch, setShootSearch] = useState('');
    const [showAllAvailableCrew, setShowAllAvailableCrew] = useState(false);
    const [expandedConflictDay, setExpandedConflictDay] = useState<string | null>(null);
    const [selectedPlanDate, setSelectedPlanDate] = useState<Date | null>(null);
    const [showDraftShootForm, setShowDraftShootForm] = useState(false);
    const [draftShootTitle, setDraftShootTitle] = useState('');
    const [draftShootLocation, setDraftShootLocation] = useState('');
    const [draftShootStart, setDraftShootStart] = useState('');
    const [draftShootEnd, setDraftShootEnd] = useState('');
    const [editSegmentStart, setEditSegmentStart] = useState('');
    const [editSegmentEnd, setEditSegmentEnd] = useState('');
    const [editSegmentDay, setEditSegmentDay] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);
    const [isPublishingDrafts, setIsPublishingDrafts] = useState(false);
    const [isCreatingDraftShoot, setIsCreatingDraftShoot] = useState(false);
    const [isUpdatingSegment, setIsUpdatingSegment] = useState(false);
    const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
    const plannerScrollRef = useRef<HTMLDivElement | null>(null);

    const visibleRangeStart = useMemo(() => (
        plannerRange === 'MONTH' ? startOfMonth(weekStart) : startOfDay(weekStart)
    ), [plannerRange, weekStart]);

    const visibleRangeEnd = useMemo(() => {
        if (plannerRange === 'MONTH') return endOfDay(endOfMonth(weekStart));
        return endOfDay(addDays(weekStart, plannerRange === 'TWO_WEEK' ? 13 : 6));
    }, [plannerRange, weekStart]);

    const plannerDays = useMemo(() => {
        return eachDayOfInterval({ start: visibleRangeStart, end: visibleRangeEnd });
    }, [visibleRangeEnd, visibleRangeStart]);

    const columnTemplate = useMemo(
        () => `240px repeat(${plannerDays.length}, minmax(134px, 1fr))`,
        [plannerDays.length]
    );

    const minGridWidth = useMemo(() => 240 + plannerDays.length * 134, [plannerDays.length]);

    const shootById = useMemo(() => {
        return new Map(shoots.map(shoot => [shoot.id, shoot]));
    }, [shoots]);

    const liveAssignmentKeys = useMemo(() => {
        return new Set(assignments.map(assignment => `${assignment.shootId}:${assignment.userId}`));
    }, [assignments]);

    const segmentsByAssignmentId = useMemo(() => {
        const map = new Map<string, AssignmentSegment[]>();
        assignmentSegments.forEach(segment => {
            if (!segment.assignmentId) return;
            const list = map.get(segment.assignmentId) || [];
            list.push(segment);
            map.set(segment.assignmentId, list);
        });
        return map;
    }, [assignmentSegments]);

    const segmentsByDraftAssignmentId = useMemo(() => {
        const map = new Map<string, AssignmentSegment[]>();
        assignmentSegments.forEach(segment => {
            if (!segment.draftAssignmentId) return;
            const list = map.get(segment.draftAssignmentId) || [];
            list.push(segment);
            map.set(segment.draftAssignmentId, list);
        });
        return map;
    }, [assignmentSegments]);

    const effectiveAssignments = useMemo<PlannerAssignment[]>(() => {
        const items: PlannerAssignment[] = [];

        assignments.forEach(assignment => {
            const shoot = shootById.get(assignment.shootId);
            if (shoot) {
                const segments = segmentsByAssignmentId.get(assignment.id) || [];
                if (segments.length > 0) {
                    segments.forEach(segment => items.push({ assignment, shoot, isDraft: false, segment }));
                } else {
                    items.push({ assignment, shoot, isDraft: false });
                }
            }
        });

        draftAssignments
            .filter(assignment => !liveAssignmentKeys.has(`${assignment.shootId}:${assignment.userId}`))
            .forEach(assignment => {
                const shoot = shootById.get(assignment.shootId);
                if (shoot) {
                    const segments = segmentsByDraftAssignmentId.get(assignment.id) || [];
                    if (segments.length > 0) {
                        segments.forEach(segment => items.push({ assignment, shoot, isDraft: true, segment }));
                    } else {
                        items.push({ assignment, shoot, isDraft: true });
                    }
                }
            });

        return items;
    }, [assignments, draftAssignments, liveAssignmentKeys, segmentsByAssignmentId, segmentsByDraftAssignmentId, shootById]);

    const plannerShoots = useMemo(() => {
        return shoots
            .filter(shoot => shoot.status !== 'CANCELLED')
            .filter(shoot => shootOverlapsRange(shoot, visibleRangeStart, visibleRangeEnd))
            .sort((a, b) => {
                const aStart = getShootStart(a)?.getTime() || 0;
                const bStart = getShootStart(b)?.getTime() || 0;
                return aStart - bStart || a.title.localeCompare(b.title);
            });
    }, [shoots, visibleRangeEnd, visibleRangeStart]);

    const visiblePlannerShoots = useMemo(() => {
        const normalizedSearch = shootSearch.trim().toLowerCase();
        if (!normalizedSearch) return plannerShoots;

        return plannerShoots.filter(shoot => {
            const haystack = `${shoot.title} ${shoot.location || ''} ${shoot.status}`.toLowerCase();
            return haystack.includes(normalizedSearch);
        });
    }, [plannerShoots, shootSearch]);

    const activeShootById = useMemo(() => {
        return new Map(plannerShoots.map(shoot => [shoot.id, shoot]));
    }, [plannerShoots]);

    const unassignedShoots = useMemo(() => {
        return plannerShoots.filter(shoot => !effectiveAssignments.some(item => item.assignment.shootId === shoot.id));
    }, [effectiveAssignments, plannerShoots]);

    const quickAssignShoots = useMemo(() => {
        if (!selectedPlanDate) return plannerShoots;

        return plannerShoots.filter(shoot =>
            shootOverlapsRange(shoot, startOfDay(selectedPlanDate), endOfDay(selectedPlanDate))
        );
    }, [plannerShoots, selectedPlanDate]);

    const assignedUserIds = useMemo(() => {
        const ids = new Set<string>();
        effectiveAssignments.forEach(item => {
            if (activeShootById.has(item.assignment.shootId)) ids.add(item.assignment.userId);
        });
        return ids;
    }, [activeShootById, effectiveAssignments]);

    const activeEmployees = useMemo(() => {
        const normalizedSearch = crewSearch.trim().toLowerCase();

        return users
            .filter(employee => employee.status === 'ACTIVE')
            .filter(employee => crewFilter === 'ALL' || employee.id === crewFilter)
            .filter(employee => {
                if (crewRosterMode === 'ASSIGNED') return assignedUserIds.has(employee.id);
                if (crewFilter !== 'ALL') return canBeAssignedToShoots(employee) || assignedUserIds.has(employee.id);
                if (crewRosterMode === 'CREW_ONLY') return isAssignableCrew(employee);
                return canBeAssignedToShoots(employee);
            })
            .filter(employee => {
                if (!normalizedSearch) return true;
                const haystack = `${employee.name} ${employee.email} ${getRoleLabel(employee.role)}`.toLowerCase();
                return haystack.includes(normalizedSearch);
            })
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    }, [users, crewFilter, crewRosterMode, assignedUserIds, crewSearch]);

    const selectableEmployees = useMemo(() => {
        return users
            .filter(employee => employee.status === 'ACTIVE')
            .filter(employee => canBeAssignedToShoots(employee))
            .filter(employee => crewFilter === 'ALL' || employee.id === crewFilter)
            .filter(employee => {
                if (crewFilter !== 'ALL') return true;
                return crewRosterMode === 'ALL_ACTIVE' || isAssignableCrew(employee);
            })
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    }, [users, crewFilter, crewRosterMode]);

    const getItemStart = (item: PlannerAssignment) => {
        return item.segment ? parseDate(item.segment.startTime) : getShootStart(item.shoot);
    };

    const getItemEnd = (item: PlannerAssignment) => {
        return item.segment ? parseDate(item.segment.endTime) : getShootEnd(item.shoot);
    };

    const itemOverlapsDay = (item: PlannerAssignment, day: Date) => {
        const start = getItemStart(item);
        const end = getItemEnd(item);
        return !!start && !!end && timeBlocksOverlap(start, end, startOfDay(day), addDays(startOfDay(day), 1));
    };

    const formatPlannerItemTimeRange = (item: PlannerAssignment) => {
        const start = getItemStart(item);
        const end = getItemEnd(item);
        if (!start) return 'Time TBD';
        return end ? `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}` : format(start, 'HH:mm');
    };

    const formatPlannerItemDateRange = (item: PlannerAssignment) => {
        const start = getItemStart(item);
        const end = getItemEnd(item);
        if (!start || !end || isSameDay(start, end)) return null;

        return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
    };

    const getPlannerItemKey = (item: PlannerAssignment) =>
        item.segment?.id || `${item.assignment.id}-${item.shoot.id}`;

    const getAssignmentsForUserRange = (userId: string): PlannerAssignment[] => {
        return effectiveAssignments
            .filter(item => item.assignment.userId === userId)
            .map(item => ({
                ...item,
                shoot: activeShootById.get(item.assignment.shootId) || item.shoot,
            }))
            .filter(item => activeShootById.has(item.assignment.shootId))
            .filter(item => {
                const start = getItemStart(item);
                const end = getItemEnd(item);
                return !!start && !!end && timeBlocksOverlap(start, end, visibleRangeStart, visibleRangeEnd);
            })
            .sort((a, b) => {
                const aStart = getItemStart(a)?.getTime() || 0;
                const bStart = getItemStart(b)?.getTime() || 0;
                return aStart - bStart || a.shoot.title.localeCompare(b.shoot.title);
            });
    };

    const getPlannerItemPlacement = (item: PlannerAssignment): PlannerItemPlacement => {
        const start = getItemStart(item);
        const end = getItemEnd(item);
        if (!start || !end) return { columnStart: 1, columnSpan: 1, columnEnd: 1 };

        const rawStart = differenceInCalendarDays(startOfDay(start), visibleRangeStart);
        const placementEnd = end > start ? new Date(end.getTime() - 1) : end;
        const rawEnd = differenceInCalendarDays(startOfDay(placementEnd), visibleRangeStart);
        const startIndex = Math.max(0, Math.min(plannerDays.length - 1, rawStart));
        const endIndex = Math.max(startIndex, Math.min(plannerDays.length - 1, rawEnd));

        return {
            columnStart: startIndex + 1,
            columnSpan: endIndex - startIndex + 1,
            columnEnd: endIndex + 1,
        };
    };

    const placementsOverlap = (first: PlannerItemPlacement, second: PlannerItemPlacement) =>
        first.columnStart <= second.columnEnd && second.columnStart <= first.columnEnd;

    const getPackedPlannerItems = (items: PlannerAssignment[]): PackedPlannerItem[] => {
        const lanes: PlannerItemPlacement[][] = [];

        return items.map(item => {
            const placement = getPlannerItemPlacement(item);
            let lane = lanes.findIndex(existingPlacements =>
                existingPlacements.every(existing => !placementsOverlap(existing, placement))
            );

            if (lane === -1) {
                lane = lanes.length;
                lanes.push([]);
            }

            lanes[lane].push(placement);
            return { item, placement, lane };
        });
    };

    const getShootRangePlacement = (shoot: Shoot): PlannerItemPlacement => {
        const start = getShootStart(shoot);
        const end = getShootEnd(shoot);
        if (!start || !end) return { columnStart: 1, columnSpan: 1, columnEnd: 1 };

        const clippedStart = new Date(Math.max(start.getTime(), visibleRangeStart.getTime()));
        const clippedEnd = new Date(Math.min((end > start ? end.getTime() - 1 : end.getTime()), visibleRangeEnd.getTime()));
        const rawStart = differenceInCalendarDays(startOfDay(clippedStart), visibleRangeStart);
        const rawEnd = differenceInCalendarDays(startOfDay(clippedEnd), visibleRangeStart);
        const startIndex = Math.max(0, Math.min(plannerDays.length - 1, rawStart));
        const endIndex = Math.max(startIndex, Math.min(plannerDays.length - 1, rawEnd));

        return {
            columnStart: startIndex + 1,
            columnSpan: endIndex - startIndex + 1,
            columnEnd: endIndex + 1,
        };
    };

    const getPackedShootRangeBars = (rangeShoots: Shoot[]): PackedShootRangeBar[] => {
        const lanes: PlannerItemPlacement[][] = [];

        return rangeShoots.map(shoot => {
            const placement = getShootRangePlacement(shoot);
            let lane = lanes.findIndex(existingPlacements =>
                existingPlacements.every(existing => !placementsOverlap(existing, placement))
            );

            if (lane === -1) {
                lane = lanes.length;
                lanes.push([]);
            }

            lanes[lane].push(placement);
            return { shoot, placement, lane };
        });
    };

    const isShootSpanningMultipleDays = (shoot: Shoot) => {
        const start = getShootStart(shoot);
        const end = getShootEnd(shoot);
        if (!start || !end) return false;

        const endForDay = end > start ? new Date(end.getTime() - 1) : end;
        return differenceInCalendarDays(startOfDay(endForDay), startOfDay(start)) > 0;
    };

    const getAssignmentsForUserDay = (userId: string, day: Date): PlannerAssignment[] => {
        return effectiveAssignments
            .filter(item => item.assignment.userId === userId)
            .map(item => ({
                ...item,
                shoot: activeShootById.get(item.assignment.shootId) || item.shoot,
            }))
            .filter(item => activeShootById.has(item.assignment.shootId))
            .filter(item => itemOverlapsDay(item, day))
            .sort((a, b) => {
                const aStart = getItemStart(a)?.getTime() || 0;
                const bStart = getItemStart(b)?.getTime() || 0;
                return aStart - bStart;
            });
    };

    const getAssignmentsForShoot = (shootId: string): PlannerAssignment[] => {
        return effectiveAssignments
            .filter(item => item.assignment.shootId === shootId)
            .map(item => ({
                ...item,
                shoot: activeShootById.get(item.assignment.shootId) || item.shoot,
            }))
            .filter(item => activeShootById.has(item.assignment.shootId))
            .sort((a, b) => {
                const aUser = users.find(user => user.id === a.assignment.userId)?.name || '';
                const bUser = users.find(user => user.id === b.assignment.userId)?.name || '';
                const aStart = getItemStart(a)?.getTime() || 0;
                const bStart = getItemStart(b)?.getTime() || 0;
                return aUser.localeCompare(bUser, undefined, { sensitivity: 'base', numeric: true }) || aStart - bStart;
            });
    };

    const getUniqueCrewAssignments = (items: PlannerAssignment[]) => {
        const map = new Map<string, PlannerAssignment>();
        items.forEach(item => {
            if (!map.has(item.assignment.userId)) {
                map.set(item.assignment.userId, item);
            }
        });
        return Array.from(map.values());
    };

    const getExternalConflictsForItem = (item: PlannerAssignment) => {
        const itemStart = getItemStart(item);
        const itemEnd = getItemEnd(item);
        if (!itemStart || !itemEnd) return [];

        return effectiveAssignments.filter(other => {
            if (other.assignment.userId !== item.assignment.userId) return false;
            if (other.assignment.shootId === item.assignment.shootId) return false;
            if (other.shoot.status === 'CANCELLED') return false;

            const otherStart = getItemStart(other);
            const otherEnd = getItemEnd(other);
            return !!otherStart && !!otherEnd && timeBlocksOverlap(itemStart, itemEnd, otherStart, otherEnd);
        });
    };

    const getShootConflictCountForRange = (shootId: string, rangeStart: Date, rangeEnd: Date) => {
        return getUniqueCrewAssignments(getAssignmentsForShoot(shootId)).reduce(
            (sum, item) => {
                const itemStart = getItemStart(item);
                const itemEnd = getItemEnd(item);
                if (!itemStart || !itemEnd || !timeBlocksOverlap(itemStart, itemEnd, rangeStart, rangeEnd)) return sum;

                const clippedStart = new Date(Math.max(itemStart.getTime(), rangeStart.getTime()));
                const clippedEnd = new Date(Math.min(itemEnd.getTime(), rangeEnd.getTime()));

                return sum + getExternalConflictsForItem(item).filter(conflict => {
                    const conflictStart = getItemStart(conflict);
                    const conflictEnd = getItemEnd(conflict);
                    return !!conflictStart && !!conflictEnd && timeBlocksOverlap(clippedStart, clippedEnd, conflictStart, conflictEnd);
                }).length;
            },
            0
        );
    };

    const getShootConflictsForDay = (day: Date): ShootDayConflict[] => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        const seen = new Set<string>();
        const items = effectiveAssignments
            .map(item => ({
                ...item,
                shoot: activeShootById.get(item.assignment.shootId) || item.shoot,
            }))
            .filter(item => activeShootById.has(item.assignment.shootId))
            .filter(item => item.shoot.status !== 'CANCELLED')
            .filter(item => {
                const start = getItemStart(item);
                const end = getItemEnd(item);
                return !!start && !!end && timeBlocksOverlap(start, end, dayStart, dayEnd);
            })
            .sort((a, b) => {
                const aUser = a.assignment.userId;
                const bUser = b.assignment.userId;
                const aStart = getItemStart(a)?.getTime() || 0;
                const bStart = getItemStart(b)?.getTime() || 0;
                return aUser.localeCompare(bUser) || aStart - bStart || a.shoot.title.localeCompare(b.shoot.title);
            });
        const conflicts: ShootDayConflict[] = [];

        for (let i = 0; i < items.length; i += 1) {
            for (let j = i + 1; j < items.length; j += 1) {
                const first = items[i];
                const second = items[j];
                if (first.assignment.userId !== second.assignment.userId) continue;
                if (first.assignment.shootId === second.assignment.shootId) continue;

                const firstStart = getItemStart(first);
                const firstEnd = getItemEnd(first);
                const secondStart = getItemStart(second);
                const secondEnd = getItemEnd(second);
                if (!firstStart || !firstEnd || !secondStart || !secondEnd) continue;

                const overlapStart = new Date(Math.max(firstStart.getTime(), secondStart.getTime(), dayStart.getTime()));
                const overlapEnd = new Date(Math.min(firstEnd.getTime(), secondEnd.getTime(), dayEnd.getTime()));
                if (overlapEnd <= overlapStart) continue;

                const conflictKeys = [getPlannerItemKey(first), getPlannerItemKey(second)].sort();
                const key = `${first.assignment.userId}:${conflictKeys.join(':')}:${overlapStart.toISOString()}:${overlapEnd.toISOString()}`;
                if (seen.has(key)) continue;

                seen.add(key);
                conflicts.push({
                    key,
                    user: users.find(user => user.id === first.assignment.userId),
                    first,
                    second,
                    overlapStart,
                    overlapEnd,
                });
            }
        }

        return conflicts;
    };

    const formatConflictItemWindow = (item: PlannerAssignment, day: Date) => {
        const start = getItemStart(item);
        const end = getItemEnd(item);
        if (!start || !end) return 'Time TBD';

        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        const clippedStart = new Date(Math.max(start.getTime(), dayStart.getTime()));
        const clippedEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));

        return `${format(clippedStart, 'HH:mm')} - ${clippedEnd >= dayEnd ? '24:00' : format(clippedEnd, 'HH:mm')}`;
    };

    const packShootTimelineSegments = (segments: ShootTimelineSegment[]) => {
        const laneEnds: number[] = [];

        return segments
            .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes || a.shoot.title.localeCompare(b.shoot.title))
            .map(segment => {
                let lane = laneEnds.findIndex(endMinute => segment.startMinutes >= endMinute);
                if (lane === -1) {
                    lane = laneEnds.length;
                }

                laneEnds[lane] = Math.max(segment.endMinutes, segment.startMinutes + timelineMinVisualMinutes);
                return { ...segment, lane };
            });
    };

    const getShootTimelineSegmentsForDay = (day: Date): ShootTimelineSegment[] => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        const segments = visiblePlannerShoots
            .map(shoot => {
                const shootStart = getShootStart(shoot);
                const shootEnd = getShootEnd(shoot);
                if (!shootStart || !shootEnd || !timeBlocksOverlap(shootStart, shootEnd, dayStart, dayEnd)) return null;

                const start = new Date(Math.max(shootStart.getTime(), dayStart.getTime()));
                const end = new Date(Math.min(shootEnd.getTime(), dayEnd.getTime()));
                if (end <= start) return null;

                const startMinutes = differenceInMilliseconds(start, dayStart) / 60000;
                const endMinutes = differenceInMilliseconds(end, dayStart) / 60000;
                const visualEndMinutes = Math.min(1440, Math.max(endMinutes, startMinutes + timelineMinVisualMinutes));

                return {
                    shoot,
                    start,
                    end,
                    startMinutes,
                    endMinutes,
                    leftPercent: (startMinutes / 1440) * 100,
                    widthPercent: ((visualEndMinutes - startMinutes) / 1440) * 100,
                    lane: 0,
                };
            })
            .filter((segment): segment is ShootTimelineSegment => !!segment);

        return packShootTimelineSegments(segments);
    };

    const isLongTimelineSegment = (segment: ShootTimelineSegment, day: Date) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        const shootStart = getShootStart(segment.shoot);
        const shootEnd = getShootEnd(segment.shoot);
        const durationMinutes = segment.endMinutes - segment.startMinutes;

        return (!!shootStart && shootStart < dayStart)
            || (!!shootEnd && shootEnd > dayEnd)
            || durationMinutes >= 960
            || (segment.startMinutes <= 0 && segment.endMinutes >= 1440);
    };

    const formatTimelineSegmentTime = (segment: ShootTimelineSegment) => {
        const start = segment.startMinutes <= 0 ? '00:00' : format(segment.start, 'HH:mm');
        const end = segment.endMinutes >= 1440 ? '24:00' : format(segment.end, 'HH:mm');
        return `${start} - ${end}`;
    };

    const getTimelineSegmentNote = (segment: ShootTimelineSegment, day: Date) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        const shootStart = getShootStart(segment.shoot);
        const shootEnd = getShootEnd(segment.shoot);
        const startedEarlier = !!shootStart && shootStart < dayStart;
        const continuesAfter = !!shootEnd && shootEnd > dayEnd;

        if (startedEarlier && continuesAfter) return 'All day';
        if (startedEarlier) return 'Started earlier';
        if (continuesAfter) return 'Continues';
        if (segment.startMinutes <= 0 && segment.endMinutes >= 1440) return 'All day';

        return '';
    };

    const getLeavesForUserDay = (userId: string, day: Date) => {
        return leaves.filter(leave => leave.userId === userId && leaveOverlapsDay(leave, day));
    };

    const getWeeklyHours = (userId: string) => {
        const totalMs = effectiveAssignments
            .filter(item => item.assignment.userId === userId)
            .reduce((sum, item) => {
                const start = getItemStart(item);
                const end = getItemEnd(item);
                if (!start || !end) return sum;

                const clampedStart = new Date(Math.max(start.getTime(), visibleRangeStart.getTime()));
                const clampedEnd = new Date(Math.min(end.getTime(), visibleRangeEnd.getTime()));
                if (clampedEnd <= clampedStart) return sum;

                return sum + differenceInMilliseconds(clampedEnd, clampedStart);
            }, 0);

        return Math.round((totalMs / 3600000) * 10) / 10;
    };

    const getConflictCount = (items: PlannerAssignment[]) => {
        let count = 0;
        for (let i = 0; i < items.length; i += 1) {
            for (let j = i + 1; j < items.length; j += 1) {
                const firstStart = getItemStart(items[i]);
                const firstEnd = getItemEnd(items[i]);
                const secondStart = getItemStart(items[j]);
                const secondEnd = getItemEnd(items[j]);
                if (firstStart && firstEnd && secondStart && secondEnd && timeBlocksOverlap(firstStart, firstEnd, secondStart, secondEnd)) {
                    count += 1;
                }
            }
        }
        return count;
    };

    const getPlannerItemConflictCount = (item: PlannerAssignment, items: PlannerAssignment[]) => {
        const itemStart = getItemStart(item);
        const itemEnd = getItemEnd(item);
        if (!itemStart || !itemEnd) return 0;

        return items.filter(other => {
            if (getPlannerItemKey(other) === getPlannerItemKey(item)) return false;

            const otherStart = getItemStart(other);
            const otherEnd = getItemEnd(other);
            return !!otherStart && !!otherEnd && timeBlocksOverlap(itemStart, itemEnd, otherStart, otherEnd);
        }).length;
    };

    const conflictItems = activeEmployees.flatMap(employee =>
        plannerDays.flatMap(day => {
            const dayAssignments = getAssignmentsForUserDay(employee.id, day);
            const conflictCount = getConflictCount(dayAssignments);
            return conflictCount > 0
                ? [{ user: employee, day, conflictCount }]
                : [];
        })
    );
    const timelineTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24].map(hour => ({
        hour,
        isMajor: hour % 6 === 0,
        label: hour === 24 ? '24:00' : `${String(hour).padStart(2, '0')}:00`,
    }));
    const spanningShootBars = getPackedShootRangeBars(
        visiblePlannerShoots.filter(shoot => isShootSpanningMultipleDays(shoot))
    );
    const spanningLaneCount = Math.max(1, ...spanningShootBars.map(bar => bar.lane + 1));
    const getActiveMultiDayShootsForDay = (day: Date) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);

        return visiblePlannerShoots
            .filter(shoot => isShootSpanningMultipleDays(shoot))
            .filter(shoot => shootOverlapsRange(shoot, dayStart, dayEnd));
    };
    const shootTimelineGroups = plannerDays
        .map(day => ({
            day,
            segments: getShootTimelineSegmentsForDay(day).filter(segment => !isShootSpanningMultipleDays(segment.shoot)),
            activeMultiDayShoots: getActiveMultiDayShootsForDay(day),
        }))
        .filter(group => group.segments.length > 0 || group.activeMultiDayShoots.length > 0);

    const selectedShoot = selectedShootId ? shootById.get(selectedShootId) : undefined;
    const selectedEmployee = selectedUserId ? users.find(employee => employee.id === selectedUserId) : undefined;
    const selectedUserIsOnSelectedShoot = !!selectedShootId
        && !!selectedUserId
        && effectiveAssignments.some(item =>
            item.assignment.shootId === selectedShootId && item.assignment.userId === selectedUserId
        );
    const quickAssignShootOptions = useMemo<PlannerDropdownOption[]>(() => {
        return quickAssignShoots.map(shoot => {
            const start = getShootStart(shoot);
            const end = getShootEnd(shoot);
            return {
                value: shoot.id,
                label: `${format(start || weekStart, 'MMM d')} - ${shoot.title}`,
                description: [
                    start && end ? formatTimeRange(shoot) : null,
                    shoot.location || null,
                ].filter(Boolean).join(' · '),
            };
        });
    }, [quickAssignShoots, weekStart]);
    const selectableEmployeeOptions = useMemo<PlannerDropdownOption[]>(() => {
        const employees = [...selectableEmployees];
        if (selectedEmployee && selectedUserIsOnSelectedShoot && !employees.some(employee => employee.id === selectedEmployee.id)) {
            employees.unshift(selectedEmployee);
        }

        return employees.map(employee => ({
            value: employee.id,
            label: employee.name,
            description: canBeAssignedToShoots(employee)
                ? getRoleLabel(employee.role)
                : `Already assigned - hidden from new planning`,
        }));
    }, [selectableEmployees, selectedEmployee, selectedUserIsOnSelectedShoot]);
    const plannerCrewFilterOptions = useMemo<PlannerDropdownOption[]>(() => ([
        { value: 'ALL', label: `All ${labels.teamPlural}` },
        ...users
            .filter(employee => employee.status === 'ACTIVE')
            .filter(employee => canBeAssignedToShoots(employee) || assignedUserIds.has(employee.id))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
            .map(employee => ({
                value: employee.id,
                label: employee.name,
                description: canBeAssignedToShoots(employee)
                    ? getRoleLabel(employee.role)
                    : `Already assigned - hidden from new planning`,
            })),
    ]), [assignedUserIds, labels.teamPlural, users]);
    const plannerRoleOptions = useMemo<PlannerDropdownOption[]>(() => ([
        { value: 'DEFAULT', label: 'Default role', description: selectedEmployee ? getRoleLabel(selectedEmployee.role) : undefined },
        { value: 'Incharge', label: labels.leadLabel },
    ]), [labels.leadLabel, selectedEmployee]);
    const defaultSegmentWindow = useMemo(() => {
        if (!selectedShoot) return null;
        const shootStart = getShootStart(selectedShoot);
        const shootEnd = getShootEnd(selectedShoot);
        if (!shootStart || !shootEnd) return null;

        if (selectedPlanDate) {
            const dayStart = combineDateAndTime(selectedPlanDate, shootStart);
            let dayEnd = combineDateAndTime(selectedPlanDate, shootEnd);
            if (dayEnd <= dayStart) {
                dayEnd = new Date(dayStart);
                dayEnd.setHours(dayEnd.getHours() + 4);
            }
            return { start: dayStart, end: dayEnd };
        }

        return { start: shootStart, end: shootEnd };
    }, [selectedPlanDate, selectedShoot]);

    useEffect(() => {
        if (!defaultSegmentWindow) {
            setCustomSegmentStart('');
            setCustomSegmentEnd('');
            return;
        }

        setCustomSegmentStart(formatDateTimeLocal(defaultSegmentWindow.start));
        setCustomSegmentEnd(formatDateTimeLocal(defaultSegmentWindow.end));
    }, [defaultSegmentWindow]);

    useEffect(() => {
        const baseDay = selectedPlanDate || visibleRangeStart;
        const defaultStart = new Date(baseDay);
        defaultStart.setHours(10, 0, 0, 0);
        const defaultEnd = new Date(baseDay);
        defaultEnd.setHours(18, 0, 0, 0);

        setDraftShootStart(formatDateTimeLocal(defaultStart));
        setDraftShootEnd(formatDateTimeLocal(defaultEnd));
    }, [selectedPlanDate, visibleRangeStart]);

    useEffect(() => {
        setShowAllAvailableCrew(false);
    }, [crewFilter, selectedShootId]);

    const selectedScheduleWindow = useMemo(() => {
        if (!selectedShoot) return null;
        const shootStart = getShootStart(selectedShoot);
        const shootEnd = getShootEnd(selectedShoot);
        if (!shootStart || !shootEnd) return null;

        if (scheduleMode === 'FULL_SHOOT') {
            return { start: shootStart, end: shootEnd };
        }

        if (scheduleMode === 'CUSTOM') {
            const start = customSegmentStart ? new Date(customSegmentStart) : null;
            const end = customSegmentEnd ? new Date(customSegmentEnd) : null;
            if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
            return { start, end };
        }

        return defaultSegmentWindow;
    }, [customSegmentEnd, customSegmentStart, defaultSegmentWindow, scheduleMode, selectedShoot]);

    const buildAssignmentSegment = (link: { assignmentId?: string; draftAssignmentId?: string }): AssignmentSegment | null => {
        if (!selectedShoot || !selectedEmployee || !selectedScheduleWindow) return null;

        return {
            id: generateUUID(),
            assignmentId: link.assignmentId,
            draftAssignmentId: link.draftAssignmentId,
            shootId: selectedShoot.id,
            userId: selectedEmployee.id,
            startTime: selectedScheduleWindow.start.toISOString(),
            endTime: selectedScheduleWindow.end.toISOString(),
            role: plannerRole === 'Incharge' ? 'Incharge' : selectedEmployee.role,
            createdBy: currentUser?.id,
            createdAt: new Date().toISOString(),
            departmentId: selectedShoot.departmentId || activeDepartmentId || undefined,
        };
    };

    const existingPublishedAssignment = selectedShoot && selectedEmployee ? assignments.find(
        assignment => assignment.shootId === selectedShoot.id && assignment.userId === selectedEmployee.id
    ) : undefined;
    const existingDraftAssignment = selectedShoot && selectedEmployee ? draftAssignments.find(
        assignment => assignment.shootId === selectedShoot.id && assignment.userId === selectedEmployee.id
    ) : undefined;
    const alreadyPublished = !!existingPublishedAssignment;
    const alreadyDrafted = !!existingDraftAssignment;
    const alreadyAssigned = alreadyPublished || alreadyDrafted;
    const preferredQuickAssignShoots = useMemo(() => {
        if (!selectedEmployee) return quickAssignShoots;

        const notAssigned = quickAssignShoots.filter(shoot =>
            !effectiveAssignments.some(item => item.assignment.shootId === shoot.id && item.assignment.userId === selectedEmployee.id)
        );

        return notAssigned.length > 0 ? notAssigned : quickAssignShoots;
    }, [effectiveAssignments, quickAssignShoots, selectedEmployee]);
    const selectedUserConflicts = useMemo(() => {
        if (!selectedShoot || !selectedEmployee || !selectedScheduleWindow) return [];
        const selectedStart = selectedScheduleWindow.start;
        const selectedEnd = selectedScheduleWindow.end;

        return effectiveAssignments
            .filter(item => item.assignment.userId === selectedEmployee.id && item.assignment.shootId !== selectedShoot.id)
            .filter(item => item.shoot.status !== 'CANCELLED')
            .filter(item => {
                const start = getItemStart(item);
                const end = getItemEnd(item);
                return !!start && !!end && timeBlocksOverlap(selectedStart, selectedEnd, start, end);
            })
            .map(item => item.shoot);
    }, [effectiveAssignments, selectedEmployee, selectedScheduleWindow, selectedShoot]);

    const selectedShootAssignments = selectedShoot ? getAssignmentsForShoot(selectedShoot.id) : [];
    const selectedShootCrewAssignments = getUniqueCrewAssignments(selectedShootAssignments);
    const selectedShootAvailability = selectedShoot && selectedScheduleWindow
        ? selectableEmployees
            .map(employee => {
                const assignedItems = selectedShootAssignments.filter(item => item.assignment.userId === employee.id);
                const conflictItemsForEmployee = effectiveAssignments.filter(item => {
                    if (item.assignment.userId !== employee.id || item.assignment.shootId === selectedShoot.id) return false;
                    if (item.shoot.status === 'CANCELLED') return false;

                    const start = getItemStart(item);
                    const end = getItemEnd(item);
                    return !!start && !!end && timeBlocksOverlap(selectedScheduleWindow.start, selectedScheduleWindow.end, start, end);
                });
                const absentItems = leaves.filter(leave =>
                    leave.userId === employee.id
                    && leaveOverlapsRange(leave, selectedScheduleWindow.start, selectedScheduleWindow.end)
                );
                const status: CrewAvailabilityStatus = assignedItems.length > 0
                    ? 'ASSIGNED'
                    : absentItems.length > 0
                        ? 'ABSENT'
                        : conflictItemsForEmployee.length > 0
                            ? 'CONFLICT'
                            : 'AVAILABLE';

                return {
                    employee,
                    status,
                    assignedItems,
                    conflicts: conflictItemsForEmployee,
                    leaves: absentItems,
                };
            })
            .sort((a, b) => {
                const order: Record<CrewAvailabilityStatus, number> = {
                    AVAILABLE: 0,
                    CONFLICT: 1,
                    ABSENT: 2,
                    ASSIGNED: 3,
                };
                return order[a.status] - order[b.status]
                    || a.employee.name.localeCompare(b.employee.name, undefined, { sensitivity: 'base', numeric: true });
            })
        : [];
    const availableCrewForSelectedShoot = selectedShootAvailability.filter(item => item.status === 'AVAILABLE');
    const visibleAvailableCrewForSelectedShoot = showAllAvailableCrew
        ? availableCrewForSelectedShoot
        : availableCrewForSelectedShoot.slice(0, 8);
    const conflictedCrewForSelectedShoot = selectedShootAvailability.filter(item => item.status === 'CONFLICT');
    const absentCrewForSelectedShoot = selectedShootAvailability.filter(item => item.status === 'ABSENT');

    const visibleDraftAssignments = useMemo(() => {
        return draftAssignments
            .filter(assignment => activeShootById.has(assignment.shootId))
            .filter(assignment => !liveAssignmentKeys.has(`${assignment.shootId}:${assignment.userId}`));
    }, [activeShootById, draftAssignments, liveAssignmentKeys]);

    const handleExportPlannerCsv = () => {
        const visibleShootIds = new Set(visiblePlannerShoots.map(shoot => shoot.id));
        const exportedAt = new Date();
        const headers = [
            'Range Start',
            'Range End',
            'Shoot ID',
            'Shoot Number',
            'Shoot Title',
            'Shoot Status',
            'Shoot Start',
            'Shoot End',
            'Shoot Location',
            'Jira Ticket',
            'Department ID',
            'Planning Status',
            'Assignment Source',
            'Assignment ID',
            'Assignment Acceptance Status',
            'Time Block ID',
            'Crew ID',
            'Crew Name',
            'Crew Email',
            'Crew Role',
            'Work Start',
            'Work End',
            'Work Hours',
            'Conflict Count',
            'Conflict Details',
            'Exported At',
        ];
        const rows: Array<{
            shootId: string;
            sortCrew: string;
            sortStart: number;
            values: string[];
        }> = [];
        const shootsWithVisibleAssignments = new Set<string>();

        const getShootValues = (shoot: Shoot) => {
            const shootStart = getShootStart(shoot);
            const shootEnd = getShootEnd(shoot);

            return [
                formatCsvDateTime(visibleRangeStart),
                formatCsvDateTime(visibleRangeEnd),
                shoot.id,
                shoot.shootNumber ? String(shoot.shootNumber) : '',
                shoot.title,
                shoot.status,
                formatCsvDateTime(shootStart),
                formatCsvDateTime(shootEnd),
                shoot.location || '',
                shoot.jiraTicketId || '',
                shoot.departmentId || '',
            ];
        };

        effectiveAssignments.forEach(item => {
            if (!visibleShootIds.has(item.assignment.shootId)) return;

            const shoot = activeShootById.get(item.assignment.shootId) || item.shoot;
            const start = getItemStart(item);
            const end = getItemEnd(item);
            if (!start || !end || !timeBlocksOverlap(start, end, visibleRangeStart, visibleRangeEnd)) return;

            const employee = users.find(candidate => candidate.id === item.assignment.userId);
            const conflicts = getExternalConflictsForItem(item);
            const conflictDetails = conflicts
                .map(conflict => {
                    const conflictStart = getItemStart(conflict);
                    const conflictEnd = getItemEnd(conflict);
                    return `${conflict.shoot.title} (${formatCsvDateTime(conflictStart)} - ${formatCsvDateTime(conflictEnd)})`;
                })
                .join('; ');
            const assignmentStatus = 'status' in item.assignment ? item.assignment.status : 'DRAFT';

            shootsWithVisibleAssignments.add(shoot.id);
            rows.push({
                shootId: shoot.id,
                sortCrew: employee?.name || '',
                sortStart: start.getTime(),
                values: [
                    ...getShootValues(shoot),
                    'Assigned',
                    item.isDraft ? 'Draft plan' : 'Assigned and notified',
                    item.assignment.id,
                    assignmentStatus,
                    item.segment?.id || '',
                    item.assignment.userId,
                    employee?.name || 'Unknown crew member',
                    employee?.email || '',
                    item.assignment.role === 'Incharge' ? labels.leadLabel : getRoleLabel(item.assignment.role),
                    formatCsvDateTime(start),
                    formatCsvDateTime(end),
                    formatCsvHours(start, end),
                    String(conflicts.length),
                    conflictDetails,
                    formatCsvDateTime(exportedAt),
                ],
            });
        });

        visiblePlannerShoots
            .filter(shoot => !shootsWithVisibleAssignments.has(shoot.id))
            .forEach(shoot => {
                const shootStart = getShootStart(shoot);
                rows.push({
                    shootId: shoot.id,
                    sortCrew: '',
                    sortStart: shootStart?.getTime() || 0,
                    values: [
                        ...getShootValues(shoot),
                        'Needs planning',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '0',
                        '',
                        formatCsvDateTime(exportedAt),
                    ],
                });
            });

        if (rows.length === 0) {
            showToast(`No visible ${labels.workPluralLower} to export`, 'warning');
            return;
        }

        const csv = buildCsv(
            headers,
            rows
                .sort((a, b) =>
                    a.sortStart - b.sortStart
                    || a.shootId.localeCompare(b.shootId)
                    || a.sortCrew.localeCompare(b.sortCrew, undefined, { sensitivity: 'base', numeric: true })
                )
                .map(row => row.values)
        );
        const fileLabel = labels.workPluralLower.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'shoots';
        const filename = `${fileLabel}-planner-${format(visibleRangeStart, 'yyyyMMdd')}-${format(visibleRangeEnd, 'yyyyMMdd')}.csv`.toLowerCase();
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        showToast(`Planner CSV exported (${rows.length} rows)`, 'success');
    };

    const selectedPlannerItem = useMemo(() => {
        if (!selectedPlannerItemKey) return undefined;

        return effectiveAssignments
            .map(item => ({
                ...item,
                shoot: activeShootById.get(item.assignment.shootId) || item.shoot,
            }))
            .filter(item => activeShootById.has(item.assignment.shootId))
            .find(item => getPlannerItemKey(item) === selectedPlannerItemKey);
    }, [activeShootById, effectiveAssignments, selectedPlannerItemKey]);

    const selectedPlannerEmployee = selectedPlannerItem
        ? users.find(employee => employee.id === selectedPlannerItem.assignment.userId)
        : undefined;

    const getSegmentsForPlannerItem = (item: PlannerAssignment) => {
        if (item.isDraft) return segmentsByDraftAssignmentId.get(item.assignment.id) || [];
        return segmentsByAssignmentId.get(item.assignment.id) || [];
    };

    const selectedPlannerSegments = selectedPlannerItem ? getSegmentsForPlannerItem(selectedPlannerItem) : [];
    const selectedPlannerHasCustomTime = !!selectedPlannerItem?.segment;
    const selectedPlannerStart = selectedPlannerItem ? getItemStart(selectedPlannerItem) : null;
    const selectedPlannerEnd = selectedPlannerItem ? getItemEnd(selectedPlannerItem) : null;
    const selectedPlannerEffectiveEnd = selectedPlannerStart && selectedPlannerEnd && selectedPlannerEnd > selectedPlannerStart
        ? new Date(selectedPlannerEnd.getTime() - 1)
        : selectedPlannerEnd;
    const selectedPlannerCoversMultipleDates = !!selectedPlannerStart
        && !!selectedPlannerEffectiveEnd
        && !isSameDay(selectedPlannerStart, selectedPlannerEffectiveEnd);
    const selectedPlannerRemoveLabel = selectedPlannerHasCustomTime && selectedPlannerSegments.length > 1
        ? 'Remove This Time Only'
        : `Remove ${labels.teamSingular} From ${labels.workSingular}`;

    const buildSegmentForPlannerItem = (
        item: PlannerAssignment,
        start: Date,
        end: Date,
        segmentId?: string
    ): AssignmentSegment => ({
        id: segmentId || generateUUID(),
        assignmentId: item.isDraft ? null : item.assignment.id,
        draftAssignmentId: item.isDraft ? item.assignment.id : null,
        shootId: item.shoot.id,
        userId: item.assignment.userId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        role: item.assignment.role,
        note: item.segment?.note,
        createdBy: currentUser?.id || item.segment?.createdBy,
        createdAt: item.segment?.createdAt || new Date().toISOString(),
        departmentId: item.assignment.departmentId || item.shoot.departmentId || activeDepartmentId || undefined,
    });

    const getDayFromPlannerCardClick = (
        event: React.MouseEvent<HTMLDivElement>,
        placement: PlannerItemPlacement
    ) => {
        const clickedDayElement = document
            .elementsFromPoint(event.clientX, event.clientY)
            .find(element => element instanceof HTMLElement && !!element.dataset.plannerDay);

        if (clickedDayElement instanceof HTMLElement && clickedDayElement.dataset.plannerDay) {
            const clickedDay = parseLocalDateKey(clickedDayElement.dataset.plannerDay);
            if (clickedDay) return clickedDay;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(rect.width - 1, event.clientX - rect.left));
        const dayOffset = Math.min(
            placement.columnSpan - 1,
            Math.floor((offsetX / Math.max(rect.width, 1)) * placement.columnSpan)
        );

        return plannerDays[placement.columnStart - 1 + dayOffset] || visibleRangeStart;
    };

    const handleSelectPlannerItem = (item: PlannerAssignment, employeeId: string, fallbackDay?: Date) => {
        const start = getItemStart(item);
        const end = getItemEnd(item);
        const selectedDay = fallbackDay || (start ? startOfDay(start) : visibleRangeStart);

        setSelectedPlannerItemKey(getPlannerItemKey(item));
        setSelectedUserId(employeeId);
        setSelectedShootId(item.shoot.id);
        setSelectedPlanDate(selectedDay);
        setEditSegmentDay(format(selectedDay, 'yyyy-MM-dd'));

        if (start) {
            setEditSegmentStart(formatDateTimeLocal(start));
        }

        if (end) {
            setEditSegmentEnd(formatDateTimeLocal(end));
        }
    };

    const notifyAssignment = async (assignment: Assignment, shoot: Shoot, employee: User) => {
        const title = `New ${labels.workSingular} Assignment`;
        const message = `You have been added to ${labels.workLower} "${shoot.title}" as ${getRoleLabel(assignment.role)}.`;

        await storage.addNotification({
            userId: employee.id,
            title,
            message,
            link: `/shoots/${shoot.id}`,
            departmentId: shoot.departmentId || activeDepartmentId || undefined,
        });

        sendPushNotification({
            userId: employee.id,
            title,
            message,
            link: `/shoots/${shoot.id}`,
        }).catch(error => console.error('Planner assignment push failed', error));
    };

    useEffect(() => {
        if (quickAssignShoots.length === 0) {
            setSelectedShootId('');
            return;
        }

        if (!quickAssignShoots.some(shoot => shoot.id === selectedShootId)) {
            setSelectedShootId(preferredQuickAssignShoots[0]?.id || quickAssignShoots[0].id);
        }
    }, [preferredQuickAssignShoots, quickAssignShoots, selectedShootId]);

    useEffect(() => {
        if (selectableEmployees.length === 0) {
            setSelectedUserId('');
            return;
        }
        if (!selectableEmployees.some(employee => employee.id === selectedUserId)) {
            if (plannerViewMode === 'SHOOT') {
                if (selectedUserIsOnSelectedShoot) return;
                setSelectedUserId('');
                return;
            }
            setSelectedUserId(selectableEmployees[0].id);
        }
    }, [plannerViewMode, selectableEmployees, selectedUserId, selectedUserIsOnSelectedShoot]);

    const handleQuickAssign = async () => {
        if (!selectedShoot || !selectedEmployee || !selectedScheduleWindow || isAssigning) return;

        setIsAssigning(true);
        try {
            const role = plannerRole === 'Incharge' ? 'Incharge' : selectedEmployee.role;

            if (existingPublishedAssignment) {
                const segment = buildAssignmentSegment({ assignmentId: existingPublishedAssignment.id });
                if (!segment) {
                    showToast('Select a valid crew time block', 'error');
                    return;
                }

                await storage.saveAssignmentSegments([segment]);

                if (currentUser) {
                    await storage.addLog({
                        id: generateUUID(),
                        action: 'EDIT',
                        entityId: selectedShoot.id,
                        userId: currentUser.id,
                        timestamp: new Date().toISOString(),
                        details: `Added crew time block for ${selectedEmployee.name} on ${labels.workLower} "${selectedShoot.title}"`,
                        departmentId: selectedShoot.departmentId || activeDepartmentId || undefined,
                    });
                }

                showToast(`Added time block for ${selectedEmployee.name}`, 'success');
                await onRefresh();
                return;
            }

            if (assignmentMode === 'DRAFT') {
                const draftAssignment: PlannerDraftAssignment = existingDraftAssignment || {
                    id: generateUUID(),
                    shootId: selectedShoot.id,
                    userId: selectedEmployee.id,
                    role,
                    createdBy: currentUser?.id,
                    createdAt: new Date().toISOString(),
                    departmentId: selectedShoot.departmentId || activeDepartmentId || undefined,
                };
                const segment = buildAssignmentSegment({ draftAssignmentId: draftAssignment.id });

                await storage.savePlannerDraftAssignments([draftAssignment]);
                if (segment) {
                    await storage.saveAssignmentSegments([segment]);
                }

                if (currentUser) {
                    await storage.addLog({
                        id: generateUUID(),
                        action: 'EDIT',
                        entityId: selectedShoot.id,
                        userId: currentUser.id,
                        timestamp: new Date().toISOString(),
                        details: `Draft planned ${selectedEmployee.name} for ${labels.workLower} "${selectedShoot.title}" from planner`,
                        departmentId: selectedShoot.departmentId || activeDepartmentId || undefined,
                    });
                }

                showToast(`${selectedEmployee.name} saved as draft for ${selectedShoot.title}`, 'success');
                await onRefresh();
                return;
            }

            const assignment: Assignment = {
                id: generateUUID(),
                shootId: selectedShoot.id,
                userId: selectedEmployee.id,
                role,
                status: 'PENDING',
                departmentId: selectedShoot.departmentId || activeDepartmentId || undefined,
            };

            await storage.saveAssignments([assignment]);
            const segment = buildAssignmentSegment({ assignmentId: assignment.id });
            if (segment) {
                await storage.saveAssignmentSegments([segment]);
            }
            if (existingDraftAssignment) {
                await storage.deleteAssignmentSegmentsByDraftAssignmentIds([existingDraftAssignment.id]);
                await storage.deletePlannerDraftAssignment(existingDraftAssignment.id);
            }
            await notifyAssignment(assignment, selectedShoot, selectedEmployee);

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'EDIT',
                    entityId: selectedShoot.id,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Assigned ${selectedEmployee.name} to ${labels.workLower} "${selectedShoot.title}" from planner`,
                    departmentId: selectedShoot.departmentId || activeDepartmentId || undefined,
                });
            }

            showToast(`${selectedEmployee.name} added to ${selectedShoot.title}`, 'success');
            await onRefresh();
        } catch (error) {
            console.error('Failed to assign from planner:', error);
            showToast(`Failed to update ${labels.workLower} plan`, 'error');
        } finally {
            setIsAssigning(false);
        }
    };

    const handleCreateDraftShoot = async () => {
        if (isCreatingDraftShoot) return;

        const title = draftShootTitle.trim();
        const location = draftShootLocation.trim();
        const start = draftShootStart ? new Date(draftShootStart) : null;
        const end = draftShootEnd ? new Date(draftShootEnd) : null;

        if (!title) {
            showToast(`${labels.workSingular} title is required`, 'error');
            return;
        }

        if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            showToast(`Select a valid ${labels.workLower} time`, 'error');
            return;
        }

        setIsCreatingDraftShoot(true);
        try {
            const shootId = generateUUID();
            const draftShoot: Shoot = {
                id: shootId,
                title,
                description: '',
                location,
                status: 'DRAFT',
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                requiredRoles: [],
                createdBy: currentUser?.id || '',
                departmentId: activeDepartmentId || undefined,
                expenses: [],
            };

            await storage.saveShoot(draftShoot);

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'CREATE',
                    entityId: shootId,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Created draft ${labels.workLower} "${title}" from planner`,
                    departmentId: activeDepartmentId || undefined,
                });
            }

            setDraftShootTitle('');
            setDraftShootLocation('');
            setShowDraftShootForm(false);
            setSelectedPlanDate(startOfDay(start));

            showToast(`Draft ${labels.workLower} created`, 'success');
            await onRefresh();
            setSelectedShootId(shootId);
        } catch (error) {
            console.error('Failed to create draft shoot from planner:', error);
            showToast(`Failed to create draft ${labels.workLower}`, 'error');
        } finally {
            setIsCreatingDraftShoot(false);
        }
    };

    const getEditableSegmentWindow = () => {
        const start = editSegmentStart ? new Date(editSegmentStart) : null;
        const end = editSegmentEnd ? new Date(editSegmentEnd) : null;

        if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            return null;
        }

        return { start, end };
    };

    const handleSaveSelectedTimeBlock = async () => {
        if (!selectedPlannerItem || isUpdatingSegment) return;

        const window = getEditableSegmentWindow();
        if (!window) {
            showToast('Select a valid time block', 'error');
            return;
        }

        setIsUpdatingSegment(true);
        try {
            const segment = buildSegmentForPlannerItem(
                selectedPlannerItem,
                window.start,
                window.end,
                selectedPlannerItem.segment?.id
            );

            await storage.saveAssignmentSegments([segment]);

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'EDIT',
                    entityId: selectedPlannerItem.shoot.id,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Updated crew time block for ${selectedPlannerEmployee?.name || 'crew'} on ${labels.workLower} "${selectedPlannerItem.shoot.title}"`,
                    departmentId: selectedPlannerItem.shoot.departmentId || activeDepartmentId || undefined,
                });
            }

            showToast('Time block updated', 'success');
            await onRefresh();
            setSelectedPlannerItemKey(segment.id);
        } catch (error) {
            console.error('Failed to update planner segment:', error);
            showToast('Failed to update time block', 'error');
        } finally {
            setIsUpdatingSegment(false);
        }
    };

    const handleAddSelectedTimeBlock = async () => {
        if (!selectedPlannerItem || isUpdatingSegment) return;

        const window = getEditableSegmentWindow();
        if (!window) {
            showToast('Select a valid time block', 'error');
            return;
        }

        setIsUpdatingSegment(true);
        try {
            const segment = buildSegmentForPlannerItem(selectedPlannerItem, window.start, window.end);
            await storage.saveAssignmentSegments([segment]);

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'EDIT',
                    entityId: selectedPlannerItem.shoot.id,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Added another crew time block for ${selectedPlannerEmployee?.name || 'crew'} on ${labels.workLower} "${selectedPlannerItem.shoot.title}"`,
                    departmentId: selectedPlannerItem.shoot.departmentId || activeDepartmentId || undefined,
                });
            }

            showToast('Time block added', 'success');
            await onRefresh();
            setSelectedPlannerItemKey(segment.id);
        } catch (error) {
            console.error('Failed to add planner segment:', error);
            showToast('Failed to add time block', 'error');
        } finally {
            setIsUpdatingSegment(false);
        }
    };

    const handleRemoveSelectedTimeBlock = async () => {
        if (!selectedPlannerItem || isUpdatingSegment) return;

        const siblingSegments = getSegmentsForPlannerItem(selectedPlannerItem);
        if (!selectedPlannerItem.segment || siblingSegments.length <= 1) {
            await handleRemoveAssignment(selectedPlannerItem);
            setSelectedPlannerItemKey('');
            return;
        }

        const isConfirmed = await confirm({
            title: 'Remove Time Block?',
            message: `Remove this time block from "${selectedPlannerItem.shoot.title}"? Other time blocks for this crew member will stay.`,
            confirmLabel: 'Remove',
            variant: 'danger',
        });

        if (!isConfirmed) return;

        setIsUpdatingSegment(true);
        try {
            await storage.deleteAssignmentSegmentsByIds([selectedPlannerItem.segment.id]);

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'EDIT',
                    entityId: selectedPlannerItem.shoot.id,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Removed one crew time block for ${selectedPlannerEmployee?.name || 'crew'} from ${labels.workLower} "${selectedPlannerItem.shoot.title}"`,
                    departmentId: selectedPlannerItem.shoot.departmentId || activeDepartmentId || undefined,
                });
            }

            showToast('Time block removed', 'success');
            setSelectedPlannerItemKey('');
            await onRefresh();
        } catch (error) {
            console.error('Failed to remove planner segment:', error);
            showToast('Failed to remove time block', 'error');
        } finally {
            setIsUpdatingSegment(false);
        }
    };

    const handleRemoveSelectedDay = async () => {
        if (!selectedPlannerItem || isUpdatingSegment) return;

        const start = getItemStart(selectedPlannerItem);
        const end = getItemEnd(selectedPlannerItem);
        const day = editSegmentDay ? parseLocalDateKey(editSegmentDay) : null;

        if (!start || !end || !day) {
            showToast('Select a valid day to remove', 'error');
            return;
        }

        const dayStart = startOfDay(day);
        const nextDayStart = addDays(dayStart, 1);

        if (start >= nextDayStart || end <= dayStart) {
            showToast('Selected day is outside this time block', 'error');
            return;
        }

        const isConfirmed = await confirm({
            title: 'Remove This Day?',
            message: `Remove ${selectedPlannerEmployee?.name || 'this crew member'} from "${selectedPlannerItem.shoot.title}" on ${format(dayStart, 'MMM d')} only?`,
            confirmLabel: 'Remove Day',
            variant: 'danger',
        });

        if (!isConfirmed) return;

        const replacements: AssignmentSegment[] = [];
        const beforeEnd = new Date(Math.min(end.getTime(), dayStart.getTime()));
        if (start < beforeEnd) {
            replacements.push(buildSegmentForPlannerItem(selectedPlannerItem, start, beforeEnd));
        }

        const afterStart = new Date(Math.max(start.getTime(), nextDayStart.getTime()));
        if (afterStart < end) {
            replacements.push(buildSegmentForPlannerItem(selectedPlannerItem, afterStart, end));
        }

        const siblingSegments = getSegmentsForPlannerItem(selectedPlannerItem);

        setIsUpdatingSegment(true);
        try {
            if (selectedPlannerItem.segment) {
                await storage.deleteAssignmentSegmentsByIds([selectedPlannerItem.segment.id]);
            }

            if (replacements.length > 0) {
                await storage.saveAssignmentSegments(replacements);
            } else if (!selectedPlannerItem.segment || siblingSegments.length <= 1) {
                await handleRemoveAssignment(selectedPlannerItem, { skipConfirm: true });
                setSelectedPlannerItemKey('');
                return;
            }

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'EDIT',
                    entityId: selectedPlannerItem.shoot.id,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Removed ${selectedPlannerEmployee?.name || 'crew'} from ${labels.workLower} "${selectedPlannerItem.shoot.title}" on ${format(dayStart, 'MMM d')}`,
                    departmentId: selectedPlannerItem.shoot.departmentId || activeDepartmentId || undefined,
                });
            }

            showToast('Day removed from time block', 'success');
            await onRefresh();
            setSelectedPlannerItemKey(replacements[0]?.id || '');
        } catch (error) {
            console.error('Failed to remove day from planner segment:', error);
            showToast('Failed to remove selected day', 'error');
        } finally {
            setIsUpdatingSegment(false);
        }
    };

    const handlePublishDrafts = async () => {
        if (visibleDraftAssignments.length === 0 || isPublishingDrafts) return;

        const isConfirmed = await confirm({
            title: 'Publish Draft Plan?',
            message: `Publish ${visibleDraftAssignments.length} draft assignment${visibleDraftAssignments.length !== 1 ? 's' : ''}? Crew will be notified after publishing.`,
            confirmLabel: 'Publish',
        });

        if (!isConfirmed) return;

        setIsPublishingDrafts(true);
        try {
            const publishable = visibleDraftAssignments
                .map(draft => {
                    const shoot = shootById.get(draft.shootId);
                    const employee = users.find(candidate => candidate.id === draft.userId);
                    if (!shoot || !employee) return null;

                    const assignment: Assignment = {
                        id: generateUUID(),
                        shootId: draft.shootId,
                        userId: draft.userId,
                        role: draft.role,
                        status: 'PENDING',
                        departmentId: draft.departmentId || shoot.departmentId || activeDepartmentId || undefined,
                    };

                    return { draft, assignment, shoot, employee };
                })
                .filter((item): item is { draft: PlannerDraftAssignment; assignment: Assignment; shoot: Shoot; employee: User } => !!item);

            if (publishable.length === 0) {
                showToast('No valid draft assignments to publish', 'error');
                return;
            }

            const draftShootIds = Array.from(new Set(
                publishable
                    .filter(item => item.shoot.status === 'DRAFT')
                    .map(item => item.shoot.id)
            ));

            await Promise.all(draftShootIds.map(shootId =>
                storage.updateShoot(shootId, { status: 'CONFIRMED' })
            ));
            await storage.saveAssignments(publishable.map(item => item.assignment));
            const publishedSegments: AssignmentSegment[] = publishable.flatMap(item => {
                const draftSegments = segmentsByDraftAssignmentId.get(item.draft.id) || [];
                if (draftSegments.length === 0) {
                    const shootStart = getShootStart(item.shoot);
                    const shootEnd = getShootEnd(item.shoot);
                    if (!shootStart || !shootEnd) return [];
                    return [{
                        id: generateUUID(),
                        assignmentId: item.assignment.id,
                        draftAssignmentId: null,
                        shootId: item.shoot.id,
                        userId: item.employee.id,
                        startTime: shootStart.toISOString(),
                        endTime: shootEnd.toISOString(),
                        role: item.assignment.role,
                        createdBy: currentUser?.id,
                        createdAt: new Date().toISOString(),
                        departmentId: item.assignment.departmentId,
                    }];
                }

                return draftSegments.map(segment => ({
                    ...segment,
                    id: generateUUID(),
                    assignmentId: item.assignment.id,
                    draftAssignmentId: null,
                    createdBy: currentUser?.id || segment.createdBy,
                    createdAt: new Date().toISOString(),
                }));
            });
            await storage.saveAssignmentSegments(publishedSegments);
            await Promise.all(publishable.map(item => notifyAssignment(item.assignment, item.shoot, item.employee)));
            await storage.deleteAssignmentSegmentsByDraftAssignmentIds(publishable.map(item => item.draft.id));
            await storage.deletePlannerDraftAssignments(publishable.map(item => item.draft.id));

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'EDIT',
                    entityId: publishable[0].shoot.id,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Published ${publishable.length} draft planner assignment${publishable.length !== 1 ? 's' : ''}`,
                    newValue: publishable.map(item => ({
                        shootId: item.shoot.id,
                        shootTitle: item.shoot.title,
                        userId: item.employee.id,
                        userName: item.employee.name,
                        role: item.assignment.role,
                    })),
                    departmentId: activeDepartmentId || publishable[0].shoot.departmentId || undefined,
                });
            }

            showToast(`Published ${publishable.length} draft assignment${publishable.length !== 1 ? 's' : ''}`, 'success');
            await onRefresh();
        } catch (error) {
            console.error('Failed to publish planner drafts:', error);
            showToast('Failed to publish draft plan', 'error');
        } finally {
            setIsPublishingDrafts(false);
        }
    };

    const handleOpenCrewDayPlan = (userId: string, day: Date) => {
        setSelectedPlannerItemKey('');
        setSelectedUserId(userId);
        setSelectedPlanDate(day);

        const dayShoots = plannerShoots.filter(shoot =>
            shootOverlapsRange(shoot, startOfDay(day), endOfDay(day))
        );
        const firstUnassignedShoot = dayShoots.find(shoot =>
            !effectiveAssignments.some(item => item.assignment.shootId === shoot.id && item.assignment.userId === userId)
        );

        setSelectedShootId(firstUnassignedShoot?.id || dayShoots[0]?.id || '');
    };

    const handleOpenShootPlan = (shoot: Shoot) => {
        const shootStart = getShootStart(shoot);

        setSelectedPlannerItemKey('');
        setSelectedUserId('');
        setSelectedShootId(shoot.id);
        setSelectedPlanDate(shootStart ? startOfDay(shootStart) : null);
        setScheduleMode('FULL_SHOOT');
    };

    const handleSelectShootCrew = (employee: User) => {
        setSelectedPlannerItemKey('');
        setSelectedUserId(employee.id);
        setScheduleMode('FULL_SHOOT');
    };

    const handleOpenConflict = (item: { user: User; day: Date; conflictCount: number }) => {
        setSelectedPlannerItemKey('');
        setSelectedUserId(item.user.id);
        setSelectedPlanDate(item.day);

        const dayAssignments = getAssignmentsForUserDay(item.user.id, item.day);
        const firstConflict = dayAssignments.find(assignment =>
            getPlannerItemConflictCount(assignment, dayAssignments) > 0
        ) || dayAssignments[0];

        if (firstConflict) {
            handleSelectPlannerItem(firstConflict, item.user.id, item.day);
        }

        window.setTimeout(() => {
            const dateKey = format(item.day, 'yyyy-MM-dd');
            const target = document.querySelector(`[data-planner-cell="${item.user.id}-${dateKey}"]`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }, 0);
    };

    const getPlannerReturnTo = () => {
        const params = new URLSearchParams({
            view: 'planner',
            week: format(weekStart, 'yyyy-MM-dd'),
            range: plannerRange.toLowerCase(),
        });

        if (crewFilter !== 'ALL') params.set('user', crewFilter);
        return `/calendar?${params.toString()}`;
    };

    const rememberPlannerReturnState = () => {
        if (typeof window === 'undefined') return;

        const returnTo = getPlannerReturnTo();
        const state: PlannerReturnState = {
            returnTo,
            windowScrollX: window.scrollX,
            windowScrollY: window.scrollY,
            plannerScrollLeft: plannerScrollRef.current?.scrollLeft || 0,
            plannerScrollTop: plannerScrollRef.current?.scrollTop || 0,
            plannerViewMode,
            crewRosterMode,
            selectedPlanDateKey: selectedPlanDate ? format(selectedPlanDate, 'yyyy-MM-dd') : null,
            selectedShootId,
            selectedUserId,
            selectedPlannerItemKey,
        };

        window.sessionStorage.setItem(plannerReturnStateKey, JSON.stringify(state));
    };

    const getShootPlannerHref = (shootId: string) =>
        `/shoots/${shootId}?returnTo=${encodeURIComponent(getPlannerReturnTo())}`;

    const getShootPlannerEditHref = (shootId: string) =>
        `/shoots/${shootId}/edit?returnTo=${encodeURIComponent(getPlannerReturnTo())}`;

    const getNewShootPlannerHref = (day: Date) =>
        `/shoots/new?date=${format(day, 'yyyy-MM-dd')}&returnTo=${encodeURIComponent(getPlannerReturnTo())}`;

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const rawState = window.sessionStorage.getItem(plannerReturnStateKey);
        if (!rawState) return;

        try {
            const state = JSON.parse(rawState) as PlannerReturnState;
            const currentPath = `${window.location.pathname}${window.location.search}`;
            if (state.returnTo !== currentPath) return;

            setPlannerViewMode(state.plannerViewMode);
            setCrewRosterMode(state.crewRosterMode);
            setSelectedShootId(state.selectedShootId || '');
            setSelectedUserId(state.selectedUserId || '');
            setSelectedPlannerItemKey(state.selectedPlannerItemKey || '');
            setSelectedPlanDate(state.selectedPlanDateKey ? parseLocalDateKey(state.selectedPlanDateKey) : null);

            window.sessionStorage.removeItem(plannerReturnStateKey);
            window.setTimeout(() => {
                window.scrollTo(state.windowScrollX || 0, state.windowScrollY || 0);
                if (plannerScrollRef.current) {
                    plannerScrollRef.current.scrollLeft = state.plannerScrollLeft || 0;
                    plannerScrollRef.current.scrollTop = state.plannerScrollTop || 0;
                }
            }, 100);
        } catch {
            window.sessionStorage.removeItem(plannerReturnStateKey);
        }
    }, []);

    const handleRemoveAssignment = async (
        item: PlannerAssignment,
        options: { skipConfirm?: boolean } = {}
    ) => {
        if (removingAssignmentId) return;

        const assignedUser = users.find(candidate => candidate.id === item.assignment.userId);
        const assignedName = assignedUser?.name || 'this crew member';
        const isConfirmed = options.skipConfirm || await confirm({
            title: item.isDraft ? 'Remove Draft Plan?' : `Remove ${labels.teamSingular}?`,
            message: item.isDraft
                ? `Remove draft plan for ${assignedName} from "${item.shoot.title}"? No notification will be sent.`
                : `Remove ${assignedName} from "${item.shoot.title}"?`,
            confirmLabel: 'Remove',
            variant: 'danger',
        });

        if (!isConfirmed) return;

        setRemovingAssignmentId(item.assignment.id);
        try {
            if (item.isDraft) {
                await storage.deleteAssignmentSegmentsByDraftAssignmentIds([item.assignment.id]);
                await storage.deletePlannerDraftAssignment(item.assignment.id);

                if (currentUser) {
                    await storage.addLog({
                        id: generateUUID(),
                        action: 'EDIT',
                        entityId: item.shoot.id,
                        userId: currentUser.id,
                        timestamp: new Date().toISOString(),
                        details: `Removed draft plan for ${assignedName} from ${labels.workLower} "${item.shoot.title}"`,
                        departmentId: item.shoot.departmentId || activeDepartmentId || undefined,
                    });
                }

                showToast(`Draft plan removed for ${assignedName}`, 'success');
                await onRefresh();
                return;
            }

            await storage.deleteAssignmentSegmentsByAssignmentIds([item.assignment.id]);
            await storage.deleteAssignment(item.assignment.id);

            if (assignedUser) {
                const title = `${labels.workSingular} Assignment Removed`;
                const message = `You have been removed from ${labels.workLower} "${item.shoot.title}".`;

                await storage.addNotification({
                    userId: assignedUser.id,
                    title,
                    message,
                    link: `/shoots/${item.shoot.id}`,
                    departmentId: item.shoot.departmentId || activeDepartmentId || undefined,
                });

                sendPushNotification({
                    userId: assignedUser.id,
                    title,
                    message,
                    link: `/shoots/${item.shoot.id}`,
                }).catch(error => console.error('Planner removal push failed', error));
            }

            if (currentUser) {
                await storage.addLog({
                    id: generateUUID(),
                    action: 'EDIT',
                    entityId: item.shoot.id,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    details: `Removed ${assignedName} from ${labels.workLower} "${item.shoot.title}" from planner`,
                    departmentId: item.shoot.departmentId || activeDepartmentId || undefined,
                });
            }

            showToast(`${assignedName} removed from ${item.shoot.title}`, 'success');
            await onRefresh();
        } catch (error) {
            console.error('Failed to remove planner assignment:', error);
            showToast(`Failed to remove ${labels.teamLower}`, 'error');
        } finally {
            setRemovingAssignmentId(null);
        }
    };

    const assignedCrewCount = activeEmployees.filter(employee => assignedUserIds.has(employee.id)).length;
    const rangeLabel = plannerRange === 'MONTH'
        ? format(visibleRangeStart, 'MMMM yyyy')
        : `${format(visibleRangeStart, 'MMM d')} - ${format(visibleRangeEnd, 'MMM d, yyyy')}`;
    const rangeStepDays = plannerRange === 'TWO_WEEK' ? 14 : 7;
    const rangeTitle = plannerRange === 'MONTH'
        ? 'Monthly Planner'
        : plannerRange === 'TWO_WEEK'
            ? 'Two Week Planner'
            : 'Weekly Planner';
    const segmentedControlClass = 'border border-border bg-background p-1';
    const getSegmentButtonClass = (isActive: boolean, baseClass: string) =>
        `${baseClass} transition-colors ${isActive
            ? 'bg-muted text-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`;

    return (
        <div
            className="space-y-4"
            onClickCapture={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest('a[href^="/shoots"]')) {
                    rememberPlannerReturnState();
                }
            }}
        >
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold text-foreground">{rangeTitle}</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {plannerViewMode === 'CREW'
                                ? `${rangeLabel} - ${activeEmployees.length} crew - ${plannerShoots.length} visible ${plannerShoots.length === 1 ? labels.workLower : labels.workPluralLower}`
                                : `${rangeLabel} - ${visiblePlannerShoots.length} ${visiblePlannerShoots.length === 1 ? labels.workLower : labels.workPluralLower} - ${selectableEmployees.length} crew in pool`}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className={`inline-flex h-9 overflow-hidden rounded-lg ${segmentedControlClass}`}>
                            {[
                                { value: 'CREW' as const, label: 'Crew View' },
                                { value: 'SHOOT' as const, label: `${labels.workSingular} View` },
                            ].map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        setPlannerViewMode(option.value);
                                        setSelectedPlannerItemKey('');
                                        if (option.value === 'SHOOT') {
                                            setSelectedUserId('');
                                        }
                                    }}
                                    className={getSegmentButtonClass(plannerViewMode === option.value, 'rounded-md px-3 text-xs font-semibold')}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <div className={`inline-flex h-9 overflow-hidden rounded-lg ${segmentedControlClass}`}>
                            {[
                                { value: 'WEEK' as const, label: 'Week' },
                                { value: 'TWO_WEEK' as const, label: '2 Weeks' },
                                { value: 'MONTH' as const, label: 'Month' },
                            ].map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        setPlannerRange(option.value);
                                        setSelectedPlanDate(null);
                                        setWeekStart(prev => option.value === 'MONTH'
                                            ? startOfMonth(prev)
                                            : startOfWeek(prev, { weekStartsOn: 0 }));
                                    }}
                                    className={getSegmentButtonClass(plannerRange === option.value, 'rounded-md px-3 text-xs font-semibold')}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        {visibleDraftAssignments.length > 0 && (
                            <Button
                                type="button"
                                size="sm"
                                variant="success"
                                onClick={handlePublishDrafts}
                                isLoading={isPublishingDrafts}
                                className="gap-2"
                            >
                                Publish Drafts ({visibleDraftAssignments.length})
                            </Button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedPlanDate(null);
                                setWeekStart(prev => plannerRange === 'MONTH'
                                    ? startOfMonth(addMonths(prev, -1))
                                    : addDays(prev, -rangeStepDays));
                            }}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                            title="Previous range"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedPlanDate(null);
                                setWeekStart(plannerRange === 'MONTH'
                                    ? startOfMonth(new Date())
                                    : startOfWeek(new Date(), { weekStartsOn: 0 }));
                            }}
                            className="h-9 px-3 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:bg-muted"
                        >
                            {plannerRange === 'MONTH' ? 'This Month' : 'This Week'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedPlanDate(null);
                                setWeekStart(prev => plannerRange === 'MONTH'
                                    ? startOfMonth(addMonths(prev, 1))
                                    : addDays(prev, rangeStepDays));
                            }}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                            title="Next range"
                        >
                            <ChevronRight size={18} />
                        </button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleExportPlannerCsv}
                            className="gap-2"
                        >
                            <Download size={15} />
                            Export CSV
                        </Button>
                        <Link href={getNewShootPlannerHref(visibleRangeStart)}>
                            <Button size="sm" className="gap-2">
                                <CalendarPlus size={15} />
                                New {labels.workSingular}
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-border">
                    <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scheduled</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{plannerShoots.length}</p>
                    </div>
                    <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Need Planning</p>
                        <p className="text-2xl font-bold text-warning mt-1">{unassignedShoots.length}</p>
                    </div>
                    <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drafts</p>
                        <p className="text-2xl font-bold text-warning mt-1">{visibleDraftAssignments.length}</p>
                    </div>
                    <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Crew Used</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{assignedCrewCount}</p>
                    </div>
                    <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conflicts</p>
                        <p className={`text-2xl font-bold mt-1 ${conflictItems.length > 0 ? 'text-destructive' : 'text-success'}`}>
                            {conflictItems.length}
                        </p>
                    </div>
                </div>

                <div className="p-4 border-t border-border flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
                    <div className="flex w-full flex-col gap-3 lg:max-w-2xl lg:flex-row">
                        <div className="relative w-full lg:max-w-sm">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={plannerViewMode === 'CREW' ? crewSearch : shootSearch}
                                onChange={event => {
                                    if (plannerViewMode === 'CREW') {
                                        setCrewSearch(event.target.value);
                                    } else {
                                        setShootSearch(event.target.value);
                                    }
                                }}
                                placeholder={plannerViewMode === 'CREW' ? 'Search crew...' : `Search ${labels.workPluralLower}...`}
                                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    </div>

                    {crewFilter === 'ALL' && (
                        <div className={`inline-flex h-10 overflow-hidden rounded-xl ${segmentedControlClass}`}>
                            {[
                                { value: 'CREW_ONLY' as const, label: 'Crew Only' },
                                { value: 'ASSIGNED' as const, label: 'Assigned' },
                                { value: 'ALL_ACTIVE' as const, label: 'Assignable' },
                            ].map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setCrewRosterMode(option.value)}
                                    className={getSegmentButtonClass(crewRosterMode === option.value, 'rounded-lg px-3 text-xs sm:text-sm font-semibold')}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4 xl:items-start">
                {plannerViewMode === 'CREW' ? (
                <div className="min-w-0 rounded-2xl border border-border bg-card shadow-sm overflow-hidden xl:col-span-3">
                    <div ref={plannerScrollRef} className="max-h-[calc(100vh-220px)] min-h-[520px] overflow-auto">
                        <div style={{ minWidth: `${minGridWidth}px` }}>
                            <div
                                className="sticky top-0 z-30 grid bg-muted/40 border-b border-border shadow-sm"
                                style={{ gridTemplateColumns: columnTemplate }}
                            >
                                <div className="sticky left-0 z-20 bg-muted/40 px-4 py-3 border-r border-border">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                        <Users size={14} />
                                        {crewFilter === 'ALL' ? 'All Crew' : 'Selected Crew'}
                                    </div>
                                </div>
                                {plannerDays.map(day => (
                                    <div key={day.toISOString()} className="px-3 py-3 text-center border-r last:border-r-0 border-border ">
                                        <p className="text-xs font-semibold uppercase text-muted-foreground">{format(day, 'EEE')}</p>
                                        <p className={`mt-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold ${isToday(day) ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                                            {format(day, 'd')}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {activeEmployees.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    No crew found for this view.
                                </div>
                            ) : (
                                activeEmployees.map(employee => {
                                    const weeklyHours = getWeeklyHours(employee.id);
                                    const rowAssignments = getAssignmentsForUserRange(employee.id);
                                    const rowHasAssignments = rowAssignments.length > 0;
                                    const packedItems = getPackedPlannerItems(rowAssignments);
                                    const rowTrackCount = Math.max(1, ...packedItems.map(item => item.lane + 1));
                                    const rowMinHeight = rowHasAssignments
                                        ? Math.max(112, rowTrackCount * 98 + 14)
                                        : 80;
                                    const dayColumnTemplate = `repeat(${plannerDays.length}, minmax(134px, 1fr))`;

                                    return (
                                        <div
                                            key={employee.id}
                                            className="grid border-b last:border-b-0 border-border "
                                            style={{ gridTemplateColumns: '240px minmax(0, 1fr)' }}
                                        >
                                            <div
                                                className="sticky left-0 z-20 bg-card px-4 py-3 border-r border-border"
                                                style={{ minHeight: `${rowMinHeight}px` }}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                                                        {getInitials(employee.name)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-foreground truncate">{employee.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{getRoleLabel(employee.role)}</p>
                                                        <p className="text-xs font-semibold text-primary mt-1">{weeklyHours} h planned</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="relative bg-card" style={{ minHeight: `${rowMinHeight}px` }}>
                                                <div
                                                    className="absolute inset-0 grid"
                                                    style={{ gridTemplateColumns: dayColumnTemplate }}
                                                >
                                                    {plannerDays.map(day => {
                                                        const dayAssignments = getAssignmentsForUserDay(employee.id, day);
                                                        const dayLeaves = getLeavesForUserDay(employee.id, day);
                                                        const isSelectedPlanningCell = !!selectedPlanDate
                                                            && selectedUserId === employee.id
                                                            && format(selectedPlanDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');

                                                        return (
                                                            <div
                                                                key={`${employee.id}-${day.toISOString()}`}
                                                                data-planner-day={format(day, 'yyyy-MM-dd')}
                                                                data-planner-cell={`${employee.id}-${format(day, 'yyyy-MM-dd')}`}
                                                                onClick={(event) => {
                                                                    if (dayAssignments.length === 0) return;

                                                                    const candidates = packedItems.filter(candidate => itemOverlapsDay(candidate.item, day));
                                                                    if (candidates.length === 0) return;

                                                                    const rect = event.currentTarget.getBoundingClientRect();
                                                                    const clickRatio = Math.max(0, Math.min(0.999, (event.clientY - rect.top) / Math.max(rect.height, 1)));
                                                                    const clickedLane = Math.min(rowTrackCount - 1, Math.floor(clickRatio * rowTrackCount));
                                                                    const selectedCandidate = candidates.find(candidate => candidate.lane === clickedLane)
                                                                        || candidates
                                                                            .slice()
                                                                            .sort((a, b) => Math.abs(a.lane - clickedLane) - Math.abs(b.lane - clickedLane))[0];

                                                                    handleSelectPlannerItem(selectedCandidate.item, employee.id, day);
                                                                }}
                                                                className={`relative p-2 border-r last:border-r-0 border-border ${dayAssignments.length > 0 ? 'cursor-pointer hover:bg-muted/50' : ''} ${isSelectedPlanningCell ? 'bg-muted/70 ring-1 ring-inset ring-border' : ''}`}
                                                                style={{ minHeight: `${rowMinHeight}px` }}
                                                            >
                                                                {isSelectedPlanningCell && (
                                                                    <div className="absolute left-3 right-3 top-1 h-1 rounded-full bg-muted-foreground/50" />
                                                                )}
                                                                <div className="space-y-2">
                                                                    {dayLeaves.map(leave => (
                                                                        <div
                                                                            key={leave.id}
                                                                            className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
                                                                            title={leave.reason}
                                                                        >
                                                                            <div className="font-bold">Absent</div>
                                                                            <div className="truncate opacity-80">{leave.reason}</div>
                                                                        </div>
                                                                    ))}

                                                                    {dayAssignments.length === 0 && dayLeaves.length === 0 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleOpenCrewDayPlan(employee.id, day)}
                                                                            className="group absolute inset-1 flex items-center justify-center rounded-lg border border-dashed border-transparent text-muted-foreground opacity-0 transition-all hover:opacity-100 hover:border-border hover:bg-muted/40 hover:text-primary focus:opacity-100 focus:border-primary focus:bg-primary/5 focus:text-primary focus:outline-none  "
                                                                            title={`Plan ${employee.name} on ${format(day, 'MMM d')}`}
                                                                        >
                                                                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-current/30 bg-background shadow-sm transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                                                                                <Plus size={15} />
                                                                            </span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div
                                                    className="relative z-10 grid pointer-events-none"
                                                    style={{
                                                        gridTemplateColumns: dayColumnTemplate,
                                                        gridTemplateRows: `repeat(${rowTrackCount}, minmax(104px, auto))`,
                                                        minHeight: `${rowMinHeight}px`,
                                                    }}
                                                >
                                                    {packedItems.map(({ item, placement, lane }) => {
                                                        const shootIndex = plannerShoots.findIndex(shoot => shoot.id === item.shoot.id);
                                                        const colorClass = plannerColors[(shootIndex >= 0 ? shootIndex : 0) % plannerColors.length];
                                                        const isRemoving = removingAssignmentId === item.assignment.id;
                                                        const itemConflictCount = getPlannerItemConflictCount(item, rowAssignments);
                                                        const itemDateRange = formatPlannerItemDateRange(item);

                                                        return (
                                                            <div
                                                                key={getPlannerItemKey(item)}
                                                                onClick={event => handleSelectPlannerItem(
                                                                    item,
                                                                    employee.id,
                                                                    getDayFromPlannerCardClick(event, placement)
                                                                )}
                                                                className={`pointer-events-auto relative my-2 flex min-h-[92px] flex-col rounded-lg border border-border border-l-4 px-3 py-2 text-xs shadow-sm hover:shadow-md transition-shadow ${selectedPlannerItemKey === getPlannerItemKey(item) ? 'ring-2 ring-primary/40' : ''} ${itemConflictCount > 0 ? 'ring-1 ring-destructive/60' : ''} ${item.isDraft ? 'border-dashed ring-1 ring-warning/60' : ''} ${colorClass}`}
                                                                style={{
                                                                    gridColumn: `${placement.columnStart} / span ${placement.columnSpan}`,
                                                                    gridRow: lane + 1,
                                                                }}
                                                                title={item.shoot.title}
                                                            >
                                                                {(item.isDraft || item.shoot.status === 'DRAFT') && (
                                                                    <div className="mb-1 flex flex-wrap gap-1">
                                                                        {item.shoot.status === 'DRAFT' && (
                                                                            <span className="inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                                                                                Draft Shoot
                                                                            </span>
                                                                        )}
                                                                        {item.isDraft && (
                                                                            <span className="inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                                                                                Tentative
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex min-w-0 items-center gap-1 font-bold leading-none">
                                                                            <Clock size={11} className="shrink-0" />
                                                                            <span className="min-w-0 truncate">
                                                                                {formatPlannerItemTimeRange(item)}
                                                                                {itemDateRange ? ` - ${itemDateRange}` : ''}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    {itemConflictCount > 0 && (
                                                                        <span
                                                                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
                                                                            title={`${itemConflictCount} overlapping ${itemConflictCount === 1 ? 'assignment' : 'assignments'}`}
                                                                        >
                                                                            <AlertTriangle size={12} />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="font-semibold mt-1 line-clamp-2">{item.shoot.title}</div>
                                                                {item.shoot.location && (
                                                                    <div className="flex items-center gap-1 mt-1 opacity-75">
                                                                        <MapPin size={11} />
                                                                        <span className="truncate">{item.shoot.location}</span>
                                                                    </div>
                                                                )}
                                                                <div className="mt-1 text-[10px] uppercase font-bold opacity-70">
                                                                    {item.assignment.role === 'Incharge' ? labels.leadLabel : getRoleLabel(item.assignment.role)}
                                                                </div>
                                                                <div className="mt-auto flex items-center gap-1 pt-2">
                                                                    <Link
                                                                        href={getShootPlannerHref(item.shoot.id)}
                                                                        onClick={event => event.stopPropagation()}
                                                                        className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded bg-background/80 px-2 text-[11px] font-bold hover:bg-muted"
                                                                    >
                                                                        <ExternalLink size={12} />
                                                                        View
                                                                    </Link>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            handleRemoveAssignment(item);
                                                                        }}
                                                                        disabled={isRemoving}
                                                                        className="inline-flex h-7 w-8 items-center justify-center rounded bg-background/80 text-destructive hover:bg-destructive/10  disabled:opacity-50"
                                                                        title={`Remove ${employee.name} from ${item.shoot.title}`}
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
                ) : (
                    <div className="min-w-0 rounded-2xl border border-border bg-card shadow-sm overflow-hidden xl:col-span-3">
                        <div ref={plannerScrollRef} className="max-h-[calc(100vh-220px)] min-h-[520px] overflow-auto">
                            <div className="sticky top-0 z-20 border-b border-border bg-muted/40 px-4 py-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                            {labels.workSingular} timeline
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Grouped by date so same-day overlaps are visible.
                                        </p>
                                    </div>
                                    <p className="text-xs font-semibold text-muted-foreground">
                                        {visiblePlannerShoots.length} visible
                                    </p>
                                </div>
                            </div>

                            {shootTimelineGroups.length === 0 && spanningShootBars.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    No {labels.workPluralLower} found for this view.
                                </div>
                            ) : (
                                <div className="space-y-4 p-4">
                                    {spanningShootBars.length > 0 && (
                                        <div className="rounded-xl border border-border bg-card shadow-sm">
                                            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                                        Multi-day {labels.workPluralLower}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        One line connects the dates it covers.
                                                    </p>
                                                </div>
                                                <p className="text-xs font-semibold text-muted-foreground">
                                                    {spanningShootBars.length} {spanningShootBars.length === 1 ? labels.workLower : labels.workPluralLower}
                                                </p>
                                            </div>

                                            <div className="overflow-x-auto p-3">
                                                <div style={{ minWidth: `${Math.max(960, plannerDays.length * 84)}px` }}>
                                                    <div
                                                        className="grid border-b border-border pb-2 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground "
                                                        style={{ gridTemplateColumns: `repeat(${plannerDays.length}, minmax(84px, 1fr))` }}
                                                    >
                                                        {plannerDays.map(day => (
                                                            <div key={`range-day-${day.toISOString()}`} className="truncate border-r border-border px-2 last:border-r-0 ">
                                                                {format(day, 'MMM d')}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div
                                                        className="relative grid gap-y-1 rounded-b-lg bg-muted/30 py-2 "
                                                        style={{
                                                            gridTemplateColumns: `repeat(${plannerDays.length}, minmax(84px, 1fr))`,
                                                            gridTemplateRows: `repeat(${spanningLaneCount}, 26px)`,
                                                            minHeight: `${spanningLaneCount * 30}px`,
                                                        }}
                                                    >
                                                        <div
                                                            className="pointer-events-none absolute inset-0 grid"
                                                            style={{ gridTemplateColumns: `repeat(${plannerDays.length}, minmax(84px, 1fr))` }}
                                                        >
                                                            {plannerDays.map(day => (
                                                                <div key={`range-grid-${day.toISOString()}`} className="border-r border-border last:border-r-0 " />
                                                            ))}
                                                        </div>

                                                        {spanningShootBars.map(bar => {
                                                            const shootStart = getShootStart(bar.shoot);
                                                            const shootEnd = getShootEnd(bar.shoot);
                                                            const assignedCount = getUniqueCrewAssignments(getAssignmentsForShoot(bar.shoot.id)).length;
                                                            const rangeStart = shootStart ? new Date(Math.max(shootStart.getTime(), visibleRangeStart.getTime())) : visibleRangeStart;
                                                            const rangeEnd = shootEnd ? new Date(Math.min(shootEnd.getTime(), visibleRangeEnd.getTime())) : visibleRangeEnd;
                                                            const conflictCount = getShootConflictCountForRange(bar.shoot.id, rangeStart, rangeEnd);
                                                            const isSelected = selectedShootId === bar.shoot.id;
                                                            const shootIndex = plannerShoots.findIndex(shoot => shoot.id === bar.shoot.id);
                                                            const accentClass = plannerAccentColors[(shootIndex >= 0 ? shootIndex : 0) % plannerAccentColors.length];
                                                            const title = [
                                                                bar.shoot.title,
                                                                shootStart && shootEnd ? `${format(shootStart, 'MMM d, HH:mm')} - ${format(shootEnd, 'MMM d, HH:mm')}` : 'Time TBD',
                                                                bar.shoot.location || '',
                                                                assignedCount === 0 ? 'Needs crew' : `${assignedCount} crew`,
                                                                conflictCount > 0 ? `${conflictCount} conflict${conflictCount !== 1 ? 's' : ''}` : '',
                                                            ].filter(Boolean).join('\n');

                                                            return (
                                                                <button
                                                                    key={`spanning-${bar.shoot.id}`}
                                                                    type="button"
                                                                    onClick={() => handleOpenShootPlan(bar.shoot)}
                                                                    title={title}
                                                                    className={`group relative z-10 mx-1 flex h-6 min-w-0 items-center gap-2 rounded-full border border-border border-l-4 bg-background px-2 text-left text-[11px] font-bold text-foreground shadow-sm transition hover:border-border hover:bg-muted/40 ${accentClass} ${isSelected ? 'ring-2 ring-primary/45' : ''} ${conflictCount > 0 ? 'ring-1 ring-destructive/50' : ''}`}
                                                                    style={{
                                                                        gridColumn: `${bar.placement.columnStart} / span ${bar.placement.columnSpan}`,
                                                                        gridRow: bar.lane + 1,
                                                                    }}
                                                                >
                                                                    <span className="min-w-0 flex-1 truncate">{bar.shoot.title}</span>
                                                                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                                                                        {assignedCount === 0 ? 'Needs crew' : `${assignedCount} crew`}
                                                                    </span>
                                                                    {conflictCount > 0 && (
                                                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] text-destructive-foreground">
                                                                            <AlertTriangle size={9} />
                                                                            {conflictCount}
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {shootTimelineGroups.map(group => {
                                        const longSegments: ShootTimelineSegment[] = [];
                                        const timedSegments = packShootTimelineSegments(group.segments);
                                        const laneCount = Math.max(1, ...timedSegments.map(segment => segment.lane + 1));
                                        const conflictDateKey = format(group.day, 'yyyy-MM-dd');
                                        const dayConflicts = getShootConflictsForDay(group.day);
                                        const groupConflictCount = dayConflicts.length;
                                        const isConflictExpanded = expandedConflictDay === conflictDateKey;
                                        const hasSplitTimeline = false;

                                        return (
                                            <div
                                                key={group.day.toISOString()}
                                                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-bold text-foreground">
                                                            {format(group.day, 'EEE, MMM d')}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {group.segments.length} timed {group.segments.length === 1 ? labels.workLower : labels.workPluralLower}
                                                            {group.activeMultiDayShoots.length > 0
                                                                ? ` - ${group.activeMultiDayShoots.length} multi-day active`
                                                                : ''}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs font-bold">
                                                        {groupConflictCount > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedConflictDay(isConflictExpanded ? null : conflictDateKey)}
                                                                className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-1 text-destructive-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive/40"
                                                            >
                                                                <AlertTriangle size={12} />
                                                                {groupConflictCount} conflict{groupConflictCount !== 1 ? 's' : ''}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {group.activeMultiDayShoots.length > 0 && (
                                                    <div className="border-b border-border px-4 py-2 ">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                                                Active multi-day
                                                            </span>
                                                            {group.activeMultiDayShoots.slice(0, 4).map(shoot => {
                                                                const assignedCount = getUniqueCrewAssignments(getAssignmentsForShoot(shoot.id)).length;
                                                                const isSelected = selectedShootId === shoot.id;
                                                                const start = getShootStart(shoot);
                                                                const end = getShootEnd(shoot);
                                                                const title = [
                                                                    shoot.title,
                                                                    start && end ? `${format(start, 'MMM d, HH:mm')} - ${format(end, 'MMM d, HH:mm')}` : 'Time TBD',
                                                                    assignedCount === 0 ? 'Needs crew' : `${assignedCount} crew`,
                                                                ].filter(Boolean).join('\n');

                                                                return (
                                                                    <button
                                                                        key={`${format(group.day, 'yyyy-MM-dd')}-${shoot.id}`}
                                                                        type="button"
                                                                        onClick={() => handleOpenShootPlan(shoot)}
                                                                        title={title}
                                                                        className={`inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors ${isSelected
                                                                            ? 'border-primary/60 bg-primary/10 text-primary'
                                                                            : 'border-border bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted'
                                                                        }`}
                                                                    >
                                                                        <span className="truncate">{shoot.title}</span>
                                                                        <span className="shrink-0 text-[10px] opacity-75">
                                                                            {assignedCount === 0 ? 'No crew' : `${assignedCount}`}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                            {group.activeMultiDayShoots.length > 4 && (
                                                                <span className="text-[11px] font-semibold text-muted-foreground">
                                                                    +{group.activeMultiDayShoots.length - 4} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {isConflictExpanded && dayConflicts.length > 0 && (
                                                    <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3">
                                                        <div className="mb-2 flex items-center justify-between gap-3">
                                                            <p className="text-xs font-bold uppercase tracking-wide text-destructive">
                                                                Conflict details
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedConflictDay(null)}
                                                                className="text-xs font-semibold text-destructive hover:underline"
                                                            >
                                                                Close
                                                            </button>
                                                        </div>
                                                        <div className="grid gap-2 lg:grid-cols-2">
                                                            {dayConflicts.map(conflict => (
                                                                <div
                                                                    key={conflict.key}
                                                                    className="rounded-lg border border-destructive/30 bg-background/80 p-3 text-xs text-destructive "
                                                                >
                                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                                        <span className="min-w-0 truncate font-bold">
                                                                            {conflict.user?.name || 'Crew member'}
                                                                        </span>
                                                                        <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                                                                            Overlap {format(conflict.overlapStart, 'HH:mm')} - {format(conflict.overlapEnd, 'HH:mm')}
                                                                        </span>
                                                                    </div>
                                                                    {[conflict.first, conflict.second].map(item => (
                                                                        <div
                                                                            key={getPlannerItemKey(item)}
                                                                            className="mt-1 grid grid-cols-[82px_minmax(0,1fr)] gap-2 rounded-md bg-destructive/15 px-2 py-1.5"
                                                                        >
                                                                            <span className="font-semibold text-destructive">
                                                                                {formatConflictItemWindow(item, group.day)}
                                                                            </span>
                                                                            <span className="truncate font-semibold">
                                                                                {item.shoot.title}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className={hasSplitTimeline
                                                    ? 'grid gap-4 p-3 sm:p-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start'
                                                    : 'space-y-3 p-3 sm:p-4'
                                                }>
                                                    {longSegments.length > 0 && (
                                                        <div className="min-w-0">
                                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                                                    Spans this day
                                                                </p>
                                                                <p className="text-[11px] font-semibold text-muted-foreground">
                                                                    {longSegments.length} {longSegments.length === 1 ? labels.workLower : labels.workPluralLower}
                                                                </p>
                                                            </div>
                                                            <div className="overflow-hidden rounded-lg border border-border bg-muted/30 divide-y divide-border">
                                                                {longSegments.map(segment => {
                                                                    const shootAssignments = getAssignmentsForShoot(segment.shoot.id);
                                                                    const uniqueAssignments = getUniqueCrewAssignments(shootAssignments);
                                                                    const conflictCount = getShootConflictCountForRange(segment.shoot.id, segment.start, segment.end);
                                                                    const isSelected = selectedShootId === segment.shoot.id;
                                                                    const shootIndex = plannerShoots.findIndex(shoot => shoot.id === segment.shoot.id);
                                                                    const accentClass = plannerAccentColors[(shootIndex >= 0 ? shootIndex : 0) % plannerAccentColors.length];
                                                                    const segmentNote = getTimelineSegmentNote(segment, group.day);
                                                                    const rowStateClass = isSelected
                                                                        ? 'bg-primary/5 ring-1 ring-inset ring-primary/40'
                                                                        : conflictCount > 0
                                                                            ? 'bg-destructive/10 ring-1 ring-inset ring-destructive/30'
                                                                            : 'bg-transparent';

                                                                    return (
                                                                        <div
                                                                            key={`long-${segment.shoot.id}-${group.day.toISOString()}`}
                                                                            onClick={() => handleOpenShootPlan(segment.shoot)}
                                                                            className={`group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-l-4 px-3 py-2 text-xs text-foreground transition-colors hover:bg-background/80 ${hasSplitTimeline ? 'sm:grid-cols-[minmax(0,1fr)_auto]' : 'sm:grid-cols-[112px_minmax(0,1fr)_auto_auto]'} sm:gap-x-3 ${accentClass} ${rowStateClass}`}
                                                                            title={segment.shoot.title}
                                                                        >
                                                                            <div className={`col-span-2 min-w-0 ${hasSplitTimeline ? 'sm:col-span-2' : 'sm:col-span-1'}`}>
                                                                                <div className="flex items-center gap-1 font-bold">
                                                                                    <Clock size={12} className="shrink-0 text-muted-foreground" />
                                                                                    <span className="truncate">{formatTimelineSegmentTime(segment)}</span>
                                                                                </div>
                                                                                {segmentNote && (
                                                                                    <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                                        {segmentNote}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className={`col-span-2 min-w-0 ${hasSplitTimeline ? 'sm:col-span-2' : 'sm:col-span-1'}`}>
                                                                                <div className="flex min-w-0 items-center gap-2">
                                                                                    {isSelected && (
                                                                                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                                                                                            Selected
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="truncate text-sm font-bold">{segment.shoot.title}</span>
                                                                                    {segment.shoot.status === 'DRAFT' && (
                                                                                        <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
                                                                                            Draft
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex shrink-0 items-center gap-2">
                                                                                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                                                                                    {uniqueAssignments.length === 0 ? 'Needs crew' : `${uniqueAssignments.length} crew`}
                                                                                </span>
                                                                                {conflictCount > 0 && (
                                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                                                                                        <AlertTriangle size={11} />
                                                                                        {conflictCount}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <Link
                                                                                href={getShootPlannerHref(segment.shoot.id)}
                                                                                onClick={event => event.stopPropagation()}
                                                                                className="inline-flex h-8 w-8 justify-self-end items-center justify-center rounded bg-muted text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:opacity-100 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                                                                                title={`View ${segment.shoot.title}`}
                                                                            >
                                                                                <ExternalLink size={13} />
                                                                            </Link>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {timedSegments.length > 0 ? (
                                                        <div className="overflow-x-auto">
                                                            <div className="min-w-[960px]">
                                                                <div className="relative h-7 text-[11px] font-semibold text-muted-foreground">
                                                                    {timelineTicks.map(tick => (
                                                                        <span
                                                                            key={tick.hour}
                                                                            className={`absolute top-0 ${tick.isMajor ? 'text-muted-foreground' : 'text-muted-foreground/50 '}`}
                                                                            style={{
                                                                                left: `${(tick.hour / 24) * 100}%`,
                                                                                transform: tick.hour === 0 ? 'translateX(0)' : tick.hour === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
                                                                            }}
                                                                        >
                                                                            {tick.label}
                                                                        </span>
                                                                    ))}
                                                                </div>

                                                                <div
                                                                    className="relative rounded-lg border border-border bg-muted/30"
                                                                    style={{ height: `${laneCount * 64 + 14}px` }}
                                                                >
                                                                    <div className="pointer-events-none absolute inset-0">
                                                                {timelineTicks.map(tick => (
                                                                    <div
                                                                        key={tick.hour}
                                                                        className={`absolute bottom-0 top-0 border-l ${tick.isMajor ? 'border-border/90' : 'border-border/80'}`}
                                                                        style={{ left: `${(tick.hour / 24) * 100}%` }}
                                                                    />
                                                                ))}
                                                                    </div>

                                                                    {timedSegments.map(segment => {
                                                                        const shootAssignments = getAssignmentsForShoot(segment.shoot.id);
                                                                        const uniqueAssignments = getUniqueCrewAssignments(shootAssignments);
                                                                        const conflictCount = getShootConflictCountForRange(segment.shoot.id, segment.start, segment.end);
                                                                        const isSelected = selectedShootId === segment.shoot.id;
                                                                        const shootIndex = plannerShoots.findIndex(shoot => shoot.id === segment.shoot.id);
                                                                        const colorClass = plannerColors[(shootIndex >= 0 ? shootIndex : 0) % plannerColors.length];

                                                                        return (
                                                                            <div
                                                                                key={`${segment.shoot.id}-${group.day.toISOString()}`}
                                                                                onClick={() => handleOpenShootPlan(segment.shoot)}
                                                                                className={`absolute grid min-h-[52px] min-w-[118px] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-l-4 px-2.5 py-1.5 text-xs shadow-sm transition-all hover:shadow-md ${colorClass} ${isSelected ? 'ring-2 ring-primary/45' : ''} ${conflictCount > 0 ? 'ring-1 ring-destructive/60' : ''}`}
                                                                                style={{
                                                                                    left: `${segment.leftPercent}%`,
                                                                                    top: `${7 + segment.lane * 64}px`,
                                                                                    width: `${segment.widthPercent}%`,
                                                                                }}
                                                                                title={segment.shoot.title}
                                                                            >
                                                                                <div className="min-w-0">
                                                                                    <div className="flex min-w-0 items-center gap-1 font-bold leading-none">
                                                                                        <Clock size={11} className="shrink-0" />
                                                                                        <span className="truncate">{formatTimelineSegmentTime(segment)}</span>
                                                                                        {conflictCount > 0 && (
                                                                                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground">
                                                                                                <AlertTriangle size={9} />
                                                                                                {conflictCount}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="mt-1 truncate text-[12px] font-bold">
                                                                                        {segment.shoot.title}
                                                                                    </div>
                                                                                    <div className="mt-0.5 truncate text-[10px] font-bold uppercase opacity-70">
                                                                                        {uniqueAssignments.length === 0 ? 'Needs crew' : `${uniqueAssignments.length} assigned`}
                                                                                    </div>
                                                                                </div>
                                                                                <Link
                                                                                    href={getShootPlannerHref(segment.shoot.id)}
                                                                                    onClick={event => event.stopPropagation()}
                                                                                    className="inline-flex h-7 w-7 items-center justify-center rounded bg-background/60 hover:bg-background"
                                                                                    title={`View ${segment.shoot.title}`}
                                                                                >
                                                                                    <ExternalLink size={12} />
                                                                                </Link>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground ">
                                                            No timed {labels.workPluralLower} on this date.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:col-span-1 xl:max-h-[calc(100vh-32px)] xl:overflow-y-auto">
                    {plannerViewMode === 'CREW' && (
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <CalendarPlus size={18} className="text-primary" />
                                <h3 className="font-bold text-foreground">Create Draft {labels.workSingular}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDraftShootForm(prev => !prev)}
                                className="text-xs font-semibold text-primary hover:underline"
                            >
                                {showDraftShootForm ? 'Close' : 'New Draft'}
                            </button>
                        </div>

                        {showDraftShootForm && (
                            <div className="mt-4 space-y-3">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</span>
                                    <input
                                        type="text"
                                        value={draftShootTitle}
                                        onChange={event => setDraftShootTitle(event.target.value)}
                                        placeholder={`${labels.workSingular} title`}
                                        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </label>

                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</span>
                                    <input
                                        type="text"
                                        value={draftShootLocation}
                                        onChange={event => setDraftShootLocation(event.target.value)}
                                        placeholder="Location"
                                        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </label>

                                <div className="grid grid-cols-1 gap-2">
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start</span>
                                        <input
                                            type="datetime-local"
                                            value={draftShootStart}
                                            onChange={event => setDraftShootStart(event.target.value)}
                                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">End</span>
                                        <input
                                            type="datetime-local"
                                            value={draftShootEnd}
                                            onChange={event => setDraftShootEnd(event.target.value)}
                                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </label>
                                </div>

                                <Button
                                    type="button"
                                    className="w-full gap-2"
                                    onClick={handleCreateDraftShoot}
                                    isLoading={isCreatingDraftShoot}
                                    disabled={!draftShootTitle.trim() || !draftShootStart || !draftShootEnd}
                                >
                                    <CalendarPlus size={15} />
                                    Save Draft {labels.workSingular}
                                </Button>
                            </div>
                        )}
                    </div>
                    )}

                    {selectedPlannerItem && (
                        <div className="rounded-2xl border border-primary/25 bg-card p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Clock size={18} className="text-primary" />
                                        <h3 className="font-bold text-foreground">Crew Timing</h3>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-foreground line-clamp-2">
                                        {selectedPlannerItem.shoot.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedPlannerEmployee?.name || 'Crew'} - {selectedPlannerItem.isDraft ? 'Draft plan' : 'Live assignment'}
                                    </p>
                                    {selectedPlanDate && (
                                        <p className="mt-1 text-xs font-semibold text-primary">
                                            {format(selectedPlanDate, 'EEE, MMM d')}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedPlannerItemKey('')}
                                    className="text-xs font-semibold text-muted-foreground hover:text-primary "
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs">
                                <p className="font-bold uppercase tracking-wide text-muted-foreground">
                                    Current setup
                                </p>
                                <p className="mt-1 text-foreground">
                                    {selectedPlannerHasCustomTime
                                        ? 'This crew member has a custom working time for this assignment.'
                                        : 'This crew member is following the main shoot time. Save a custom time only if their working hours are different.'}
                                </p>
                            </div>

                            <div className="mt-4 space-y-3">
                                <div className="rounded-xl border border-border p-3">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                        Change working time
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Use this when the crew member starts later, leaves earlier, or works only part of the shoot.
                                    </p>
                                    <div className="mt-3 grid grid-cols-1 gap-2">
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work starts</span>
                                        <input
                                            type="datetime-local"
                                            value={editSegmentStart}
                                            onChange={event => setEditSegmentStart(event.target.value)}
                                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work ends</span>
                                        <input
                                            type="datetime-local"
                                            value={editSegmentEnd}
                                            onChange={event => setEditSegmentEnd(event.target.value)}
                                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </label>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleSaveSelectedTimeBlock}
                                        isLoading={isUpdatingSegment}
                                    >
                                        Save Crew Time
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleAddSelectedTimeBlock}
                                        isLoading={isUpdatingSegment}
                                        disabled={!selectedPlannerItem.segment}
                                    >
                                        Add Another Time
                                    </Button>
                                    </div>
                                    {!selectedPlannerHasCustomTime && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Save once before adding another time block.
                                        </p>
                                    )}
                                </div>

                                {selectedPlannerCoversMultipleDates && (
                                    <div className="rounded-xl border border-border p-3">
                                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                            Remove one date
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Use this if the crew member is not working on one day inside this time range.
                                        </p>
                                        <label className="block">
                                            <span className="mt-3 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date to remove</span>
                                            <input
                                                type="date"
                                                value={editSegmentDay}
                                                onChange={event => setEditSegmentDay(event.target.value)}
                                                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                            />
                                        </label>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="mt-2 w-full"
                                            onClick={handleRemoveSelectedDay}
                                            isLoading={isUpdatingSegment}
                                        >
                                            Remove Selected Date
                                        </Button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="danger"
                                        onClick={handleRemoveSelectedTimeBlock}
                                        isLoading={isUpdatingSegment}
                                    >
                                        {selectedPlannerRemoveLabel}
                                    </Button>
                                    <Link href={getShootPlannerHref(selectedPlannerItem.shoot.id)} className="block">
                                        <Button type="button" size="sm" variant="outline" className="w-full gap-2">
                                            <ExternalLink size={14} />
                                            View {labels.workSingular}
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}

                    {plannerViewMode === 'SHOOT' && selectedShoot && selectedScheduleWindow && (
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <UserCheck size={18} className="text-primary" />
                                        <h3 className="font-bold text-foreground">Crew for this shoot</h3>
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">
                                        {selectedShoot.title}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {format(selectedScheduleWindow.start, 'MMM d, HH:mm')} - {format(selectedScheduleWindow.end, 'MMM d, HH:mm')}
                                    </p>
                                </div>
                                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                                    {availableCrewForSelectedShoot.length} free
                                </span>
                            </div>

                            {onCrewFilterChange && (
                                <label className="mt-4 block">
                                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                        Show crew
                                    </span>
                                    <PlannerDropdown
                                        value={crewFilter}
                                        onChange={onCrewFilterChange}
                                        options={plannerCrewFilterOptions}
                                    />
                                </label>
                            )}

                            {selectedShootCrewAssignments.length > 0 && (
                                <div className="mt-4 rounded-xl border border-border p-3">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                        Already on this shoot
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedShootCrewAssignments.slice(0, 8).map(item => {
                                            const employee = users.find(candidate => candidate.id === item.assignment.userId);
                                            return (
                                                <button
                                                    key={getPlannerItemKey(item)}
                                                    type="button"
                                                    onClick={() => handleSelectPlannerItem(
                                                        item,
                                                        item.assignment.userId,
                                                        selectedPlanDate || startOfDay(selectedScheduleWindow.start)
                                                    )}
                                                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted  "
                                                >
                                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-background text-[10px] ">
                                                        {getInitials(employee?.name || 'Crew')}
                                                    </span>
                                                    {employee?.name || 'Crew'}
                                                </button>
                                            );
                                        })}
                                        {selectedShootCrewAssignments.length > 8 && (
                                            <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground ">
                                                +{selectedShootCrewAssignments.length - 8} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                        Available to add
                                    </p>
                                </div>
                                {availableCrewForSelectedShoot.length === 0 ? (
                                    <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                                        No free crew found in the current crew pool.
                                    </p>
                                ) : (
                                    visibleAvailableCrewForSelectedShoot.map(item => (
                                        <div
                                            key={item.employee.id}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2"
                                        >
                                            <div className="min-w-0 flex items-center gap-2">
                                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-xs font-bold text-success">
                                                    {getInitials(item.employee.name)}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">
                                                        {item.employee.name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {getRoleLabel(item.employee.role)}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSelectShootCrew(item.employee)}
                                                className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                                            >
                                                Choose
                                            </button>
                                        </div>
                                    ))
                                )}
                                {availableCrewForSelectedShoot.length > 8 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllAvailableCrew(prev => !prev)}
                                        className="w-full rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary   "
                                    >
                                        {showAllAvailableCrew
                                            ? 'Show less'
                                            : `Show ${availableCrewForSelectedShoot.length - 8} more`}
                                    </button>
                                )}
                            </div>

                            {selectedEmployee && (
                                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 ">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold uppercase tracking-wide text-primary">Add crew</p>
                                            <p className="truncate text-sm font-semibold text-foreground">
                                                {selectedEmployee.name}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedUserId('')}
                                            className="shrink-0 text-xs font-bold text-primary hover:underline"
                                        >
                                            Change
                                        </button>
                                    </div>

                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        <label className="block">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</span>
                                            <PlannerDropdown
                                                value={plannerRole}
                                                onChange={value => setPlannerRole(value as 'DEFAULT' | 'Incharge')}
                                                options={plannerRoleOptions}
                                            />
                                        </label>

                                        <div>
                                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</span>
                                            <div className={`mt-1 grid grid-cols-3 gap-1 rounded-xl ${segmentedControlClass}`}>
                                                {[
                                                    { value: 'FULL_SHOOT' as const, label: 'Full' },
                                                    { value: 'SELECTED_DAY' as const, label: 'Day' },
                                                    { value: 'CUSTOM' as const, label: 'Custom' },
                                                ].map(option => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => setScheduleMode(option.value)}
                                                        className={getSegmentButtonClass(scheduleMode === option.value, 'h-9 rounded-lg text-xs font-bold')}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {scheduleMode === 'CUSTOM' && (
                                                <div className="mt-2 grid grid-cols-1 gap-2">
                                                    <input
                                                        type="datetime-local"
                                                        value={customSegmentStart}
                                                        onChange={event => setCustomSegmentStart(event.target.value)}
                                                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    <input
                                                        type="datetime-local"
                                                        value={customSegmentEnd}
                                                        onChange={event => setCustomSegmentEnd(event.target.value)}
                                                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                </div>
                                            )}
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {selectedScheduleWindow
                                                    ? `${format(selectedScheduleWindow.start, 'MMM d, HH:mm')} - ${format(selectedScheduleWindow.end, 'MMM d, HH:mm')}`
                                                    : 'Select a valid time'}
                                            </p>
                                        </div>

                                        <div>
                                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Save</span>
                                            <div className={`mt-1 grid grid-cols-2 gap-1 rounded-xl ${segmentedControlClass}`}>
                                                {[
                                                    { value: 'DRAFT' as const, label: 'Draft' },
                                                    { value: 'PUBLISH' as const, label: 'Notify' },
                                                ].map(option => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => setAssignmentMode(option.value)}
                                                        className={getSegmentButtonClass(assignmentMode === option.value, 'h-9 rounded-lg text-xs font-bold')}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {selectedUserConflicts.length > 0 && !alreadyAssigned && (
                                            <div className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                                                <div className="font-bold">Conflict</div>
                                                {selectedUserConflicts.slice(0, 2).map(shoot => (
                                                    <div key={shoot.id} className="truncate">{shoot.title}</div>
                                                ))}
                                            </div>
                                        )}

                                        <Button
                                            type="button"
                                            className="w-full"
                                            onClick={handleQuickAssign}
                                            disabled={!selectedShoot || !selectedEmployee || !selectedScheduleWindow}
                                            isLoading={isAssigning}
                                        >
                                            {alreadyAssigned ? 'Add Time' : assignmentMode === 'DRAFT' ? 'Save Draft' : 'Assign & Notify'}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {(conflictedCrewForSelectedShoot.length > 0 || absentCrewForSelectedShoot.length > 0) && (
                                <div className="mt-4 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                        Busy or absent
                                    </p>
                                    {conflictedCrewForSelectedShoot.slice(0, 4).map(item => (
                                        <div key={item.employee.id} className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="font-bold">{item.employee.name}</p>
                                                    <p className="text-[11px] text-warning/80 ">
                                                        Already booked during this time
                                                    </p>
                                                </div>
                                                <span className="shrink-0 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
                                                    {item.conflicts.length}
                                                </span>
                                            </div>
                                            <div className="mt-2 space-y-1">
                                                {item.conflicts.slice(0, 2).map(conflict => (
                                                    <div
                                                        key={getPlannerItemKey(conflict)}
                                                        className="rounded-md border border-warning/30 bg-background/50 px-2 py-1.5"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold text-warning ">
                                                                    {conflict.shoot.title}
                                                                </p>
                                                                <p className="text-[11px] text-warning/80 ">
                                                                    {formatPlannerItemDateRange(conflict) || format(getItemStart(conflict) || selectedScheduleWindow.start, 'MMM d')} - {formatPlannerItemTimeRange(conflict)}
                                                                </p>
                                                            </div>
                                                            <Link
                                                                href={getShootPlannerHref(conflict.shoot.id)}
                                                                className="shrink-0 text-[11px] font-bold text-warning underline-offset-2 hover:underline "
                                                            >
                                                                View
                                                            </Link>
                                                        </div>
                                                    </div>
                                                ))}
                                                {item.conflicts.length > 2 && (
                                                    <div className="text-[11px] font-semibold text-warning/80 ">
                                                        +{item.conflicts.length - 2} more overlapping {labels.workPluralLower}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {absentCrewForSelectedShoot.slice(0, 3).map(item => (
                                        <div key={item.employee.id} className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                            <span className="font-bold">{item.employee.name}</span> is absent during this time.
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {plannerViewMode === 'CREW' && (
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <UserCheck size={18} className="text-primary" />
                            <h3 className="font-bold text-foreground">
                                Assign Existing {labels.workSingular}
                            </h3>
                        </div>

                        <div className="space-y-3">
                            {selectedPlanDate && (
                                <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wide text-primary">
                                                Planning
                                            </p>
                                            {false ? (
                                                <>
                                                    <p className="text-sm font-semibold text-foreground line-clamp-2">
                                                        {selectedShoot?.title || ''}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {selectedEmployee?.name ? `Assigning ${selectedEmployee?.name}` : 'Choose crew from Available Crew'}
                                                        {false
                                                            ? ''
                                                            : ''}
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-sm font-semibold text-foreground">
                                                        {selectedEmployee?.name || 'Selected crew'} on {format(selectedPlanDate, 'EEE, MMM d')}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {quickAssignShoots.length} existing {quickAssignShoots.length === 1 ? labels.workLower : labels.workPluralLower} on this date
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                        {true && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPlanDate(null)}
                                                className="text-xs font-semibold text-muted-foreground hover:text-primary "
                                            >
                                                Show week
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {false && (
                                <p className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                                    Choose a crew member from the available list above.
                                </p>
                            )}

                            {true && (
                                <>
                            {true ? (
                                <>
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.workSingular} to plan</span>
                                        <PlannerDropdown
                                            value={selectedShootId}
                                            onChange={setSelectedShootId}
                                            options={quickAssignShootOptions}
                                            placeholder={`No existing ${labels.workPluralLower}${selectedPlanDate ? ' on this date' : ' in this range'}`}
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assign to</span>
                                        <PlannerDropdown
                                            value={selectedUserId}
                                            onChange={setSelectedUserId}
                                            options={selectableEmployeeOptions}
                                            placeholder="No crew available"
                                        />
                                    </label>
                                </>
                            ) : selectedEmployee && (
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Crew</p>
                                        <p className="truncate text-sm font-semibold text-foreground">{selectedEmployee?.name || 'Crew'}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUserId('')}
                                        className="shrink-0 text-xs font-bold text-primary hover:underline"
                                    >
                                        Change
                                    </button>
                                </div>
                            )}

                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</span>
                                <PlannerDropdown
                                    value={plannerRole}
                                    onChange={value => setPlannerRole(value as 'DEFAULT' | 'Incharge')}
                                    options={plannerRoleOptions}
                                />
                            </label>

                            <div>
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Working time</span>
                                <div className={`mt-1 grid grid-cols-3 gap-1 rounded-xl ${segmentedControlClass}`}>
                                    {[
                                        { value: 'FULL_SHOOT' as const, label: 'Full Shoot' },
                                        { value: 'SELECTED_DAY' as const, label: 'This Day' },
                                        { value: 'CUSTOM' as const, label: 'Custom' },
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setScheduleMode(option.value)}
                                            className={getSegmentButtonClass(scheduleMode === option.value, 'h-9 rounded-lg text-xs font-bold')}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                {scheduleMode === 'CUSTOM' && (
                                    <div className="mt-2 grid grid-cols-1 gap-2">
                                        <input
                                            type="datetime-local"
                                            value={customSegmentStart}
                                            onChange={event => setCustomSegmentStart(event.target.value)}
                                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                        <input
                                            type="datetime-local"
                                            value={customSegmentEnd}
                                            onChange={event => setCustomSegmentEnd(event.target.value)}
                                            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </div>
                                )}
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {selectedScheduleWindow
                                        ? (
                                            scheduleMode === 'FULL_SHOOT'
                                                ? `Uses the full ${labels.workLower} time: ${format(selectedScheduleWindow.start, 'MMM d, HH:mm')} - ${format(selectedScheduleWindow.end, 'MMM d, HH:mm')}`
                                                : scheduleMode === 'SELECTED_DAY'
                                                    ? `Uses only this date: ${format(selectedScheduleWindow.start, 'MMM d, HH:mm')} - ${format(selectedScheduleWindow.end, 'MMM d, HH:mm')}`
                                                    : `Custom crew time: ${format(selectedScheduleWindow.start, 'MMM d, HH:mm')} - ${format(selectedScheduleWindow.end, 'MMM d, HH:mm')}`
                                        )
                                        : 'Select a valid crew time block'}
                                </p>
                            </div>

                            <div>
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Save as</span>
                                <div className={`mt-1 grid grid-cols-2 gap-1 rounded-xl ${segmentedControlClass}`}>
                                    {[
                                        { value: 'DRAFT' as const, label: 'Draft' },
                                        { value: 'PUBLISH' as const, label: 'Assign & Notify' },
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setAssignmentMode(option.value)}
                                            className={getSegmentButtonClass(assignmentMode === option.value, 'h-9 rounded-lg text-xs font-bold')}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {assignmentMode === 'DRAFT'
                                        ? 'Draft stays internal. Crew will not be notified.'
                                        : 'This becomes a live assignment and the crew member will be notified.'}
                                </p>
                            </div>

                            {alreadyAssigned && (
                                <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                                    {alreadyPublished
                                        ? `This crew member is already on this ${labels.workLower}. Saving will add this as another working time.`
                                        : `This crew member already has a draft plan for this ${labels.workLower}. Saving will add this as another draft time.`}
                                </p>
                            )}

                            {selectedUserConflicts.length > 0 && !alreadyAssigned && (
                                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                    <div className="font-bold mb-1">Possible conflict</div>
                                    {selectedUserConflicts.slice(0, 2).map(shoot => (
                                        <div key={shoot.id} className="truncate">{shoot.title}</div>
                                    ))}
                                </div>
                            )}

                            <Button
                                type="button"
                                className="w-full"
                                onClick={handleQuickAssign}
                                disabled={!selectedShoot || !selectedEmployee || !selectedScheduleWindow}
                                isLoading={isAssigning}
                            >
                                {alreadyAssigned ? 'Add This Working Time' : assignmentMode === 'DRAFT' ? 'Save Draft Plan' : 'Assign & Notify'}
                            </Button>
                                </>
                            )}

                        </div>
                    </div>
                    )}

                    {unassignedShoots.length > 0 && (
                        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <h3 className="font-bold text-foreground">Needs Planning</h3>
                            <p className="text-xs text-muted-foreground mt-1">{labels.workPlural} without assigned {labels.teamPluralLower} in this range.</p>

                            <div className="mt-4 space-y-2">
                                {unassignedShoots.map(shoot => (
                                    <div key={shoot.id} className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                                        <div className="font-semibold text-sm text-foreground line-clamp-2">{shoot.title}</div>
                                        <div className="text-xs text-muted-foreground mt-1">{formatTimeRange(shoot)}</div>
                                        <Link href={getShootPlannerEditHref(shoot.id)} className="inline-flex mt-2 text-xs font-bold text-primary hover:underline">
                                            Plan {labels.teamLower}
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {plannerViewMode === 'CREW' && conflictItems.length > 0 && (
                        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 shadow-sm">
                            <h3 className="font-bold text-destructive">Conflicts</h3>
                            <div className="mt-3 space-y-2">
                                {conflictItems.slice(0, 4).map(item => (
                                    <button
                                        key={`${item.user.id}-${item.day.toISOString()}`}
                                        type="button"
                                        onClick={() => handleOpenConflict(item)}
                                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-xs text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/40   "
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-bold">{item.user.name}</span>
                                            <span className="block truncate opacity-90">
                                                {format(item.day, 'EEE, MMM d')} - {item.conflictCount} overlap{item.conflictCount !== 1 ? 's' : ''}
                                            </span>
                                        </span>
                                        <span className="shrink-0 rounded-full border border-destructive/30 bg-background/70 px-2 py-0.5 font-bold text-destructive   ">
                                            Show
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
