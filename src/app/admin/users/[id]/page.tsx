'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { Role, User } from '@/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { UserAvatar } from '@/components/UserAvatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import { USER_KEYS } from '@/hooks/useUsers';
import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { logActionVariant } from '@/lib/log-display';
import {
    ASSIGNABLE_ROLES,
    formatPhone,
    normalizePhoneInput,
    roleBadgeClass,
    roleLabel,
    statusBadgeClass,
    statusGlyph,
    statusMeta,
    userPhone,
    whatsappHref,
} from '@/lib/user-display';
import {
    Activity,
    ArrowLeft,
    Calendar,
    CalendarOff,
    Check,
    ChevronRight,
    Copy,
    KeyRound,
    Laptop,
    MessageCircle,
    Package,
    Pencil,
    Smartphone,
    UserCheck,
    UserX,
    X,
} from 'lucide-react';

type TabKey = 'overview' | 'activity' | 'equipment' | 'shoots' | 'leave' | 'devices';

interface SessionRow {
    id: string;
    user_agent: string;
    last_active_at: string;
}

/** Newest N rows are fetched; the UI then reveals them a page at a time. */
const LOG_FETCH_LIMIT = 100;
const PAGE_INITIAL = 10;
const PAGE_MORE = 20;

const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: 'Activity' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'shoots', label: 'Shoots' }, // replaced by the department vocabulary at render
    { key: 'leave', label: 'Leave' },
    { key: 'devices', label: 'Devices' },
];

const describeDevice = (userAgent: string) => {
    const ua = userAgent || '';
    const mobile = /mobile|iphone|android/i.test(ua);
    const os = /windows/i.test(ua) ? 'Windows'
        : /iphone|ipad|ios/i.test(ua) ? 'iOS'
            : /android/i.test(ua) ? 'Android'
                : /mac/i.test(ua) ? 'macOS'
                    : /linux/i.test(ua) ? 'Linux' : 'Unknown OS';
    const browser = /edg/i.test(ua) ? 'Edge'
        : /chrome|crios/i.test(ua) ? 'Chrome'
            : /firefox/i.test(ua) ? 'Firefox'
                : /safari/i.test(ua) ? 'Safari' : 'Browser';
    return { mobile, label: `${os} · ${browser}` };
};

/** Dates read as prose, not as machine output. */
const whenLabel = (iso: string) => format(new Date(iso), 'EEE, d MMM yyyy · h:mm a');

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="min-w-0">
        <p className="text-[12px] text-muted-foreground">{label}</p>
        <div className="mt-1 truncate text-[14px] text-foreground">{children}</div>
    </div>
);

const SectionCard = ({
    title,
    count,
    action,
    children,
}: {
    title: string;
    count?: number;
    action?: React.ReactNode;
    children: React.ReactNode;
}) => (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <header className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
            {action ?? (typeof count === 'number' && (
                <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
            ))}
        </header>
        <div className="border-t border-border/60">{children}</div>
    </section>
);

/** One row of a list: title, a quiet meta line, and an optional right rail. */
const ListRow = ({
    href,
    title,
    meta,
    right,
}: {
    href?: string;
    title: React.ReactNode;
    meta?: React.ReactNode;
    right?: React.ReactNode;
}) => {
    const body = (
        <>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">{title}</p>
                {meta && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{meta}</p>}
            </div>
            {right}
            {href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
        </>
    );

    const shell = 'flex items-center gap-4 px-5 py-3.5 transition-colors';

    return href ? (
        <Link href={href} className={`${shell} hover:bg-secondary/40`}>{body}</Link>
    ) : (
        <div className={shell}>{body}</div>
    );
};

const ShowMore = ({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) => {
    if (shown >= total) return null;
    return (
        <button
            onClick={onMore}
            className="w-full border-t border-border/60 px-5 py-3.5 text-[13px] font-medium text-primary transition-colors hover:bg-secondary/40"
        >
            Show {Math.min(PAGE_MORE, total - shown)} more
            <span className="ml-1.5 tabular-nums text-muted-foreground">{total - shown} left</span>
        </button>
    );
};

const EmptyRow = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
        <span className="text-muted-foreground/40">{icon}</span>
        <p className="text-[13px] text-muted-foreground">{text}</p>
    </div>
);

export default function UserProfilePage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    const { user: viewer } = useAuth();
    const { department } = useDepartment();
    const labels = getDepartmentLabels(department);
    const { showToast } = useToast();
    const confirm = useConfirm();
    const queryClient = useQueryClient();

    /**
     * The open tab is URL state, not component state. Leaving for a shoot and
     * pressing Back then lands on the tab you left instead of resetting to
     * Overview, which is what made Back feel like it went somewhere else.
     */
    const searchParams = useSearchParams();
    const rawTab = searchParams.get('tab');
    const tab: TabKey = TABS.some(t => t.key === rawTab) ? (rawTab as TabKey) : 'overview';
    const setTab = (next: TabKey) => {
        router.replace(next === 'overview' ? `/admin/users/${id}` : `/admin/users/${id}?tab=${next}`, { scroll: false });
    };

    // One paging counter per list, so no list ever renders hundreds of rows.
    const [visible, setVisible] = useState<Record<string, number>>({});
    const shown = (key: string) => visible[key] ?? PAGE_INITIAL;
    const showMore = (key: string) => setVisible(v => ({ ...v, [key]: (v[key] ?? PAGE_INITIAL) + PAGE_MORE }));

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savingFlag, setSavingFlag] = useState<string | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: '',
        phone: '',
        role: 'CREW' as Role,
        departmentId: '',
        status: 'ACTIVE' as User['status'],
    });

    const isSuperAdmin = viewer?.role === 'SUPER_ADMIN';
    const effectiveDeptId = viewer && viewer.role !== 'SUPER_ADMIN'
        ? viewer.departmentId || null
        : department?.id || null;

    useEffect(() => {
        if (viewer && !['ADMIN', 'SUPER_ADMIN'].includes(viewer.role)) router.push('/dashboard');
    }, [viewer, router]);

    const { data: member, isLoading, refetch: refetchMember } = useQuery({
        queryKey: USER_KEYS.detail(id),
        queryFn: () => storage.getUser(id),
        enabled: !!id && !!viewer,
    });

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => storage.getDepartments(),
        staleTime: 5 * 60 * 1000,
    });

    const { data: transactions = [], refetch: refetchTransactions } = useQuery({
        queryKey: ['user-transactions', id],
        queryFn: () => storage.getTransactions(undefined, undefined, undefined, 'ALL', [id], undefined, null),
        enabled: !!id && !!viewer,
    });

    const { data: equipment = [] } = useQuery({
        queryKey: ['equipment', effectiveDeptId],
        queryFn: () => storage.getEquipment(effectiveDeptId),
        enabled: !!viewer,
    });

    const { data: leaves = [] } = useQuery({
        queryKey: ['leaves', effectiveDeptId],
        queryFn: () => storage.getLeaves(effectiveDeptId),
        enabled: !!viewer,
    });

    const { data: assignments = [] } = useAssignments();
    const { data: shoots = [] } = useShoots();

    const { data: logs = [], isLoading: logsLoading } = useQuery({
        queryKey: ['user-logs', id],
        queryFn: () => storage.getLogsByUser(id, LOG_FETCH_LIMIT),
        enabled: !!id && tab === 'activity',
    });

    const { data: sessions = [], isLoading: sessionsLoading, refetch: refetchSessions } = useQuery<SessionRow[]>({
        queryKey: ['user-sessions', id],
        queryFn: () => storage.getUserSessions(id),
        enabled: !!id && tab === 'devices',
    });

    // Paging restarts when you switch member or tab, so a long scroll never
    // carries over to a list you have not looked at yet.
    useEffect(() => {
        setVisible({});
    }, [id, tab]);

    // Keep the edit form in step with the record whenever we are not editing.
    useEffect(() => {
        if (!member || isEditing) return;
        setForm({
            name: member.name || '',
            phone: userPhone(member),
            role: member.role,
            departmentId: member.departmentId || '',
            status: member.status,
        });
    }, [member, isEditing]);

    /** Passed to linked records so their Back link returns here, on this tab. */
    const returnHref = `/admin/users/${id}${tab === 'overview' ? '' : `?tab=${tab}`}`;
    const linkBack = (href: string) =>
        `${href}?returnTo=${encodeURIComponent(returnHref)}&returnLabel=${encodeURIComponent(member?.name ? `Back to ${member.name}` : 'Back')}`;

    const isSelf = viewer?.id === member?.id;
    const readOnly = !!member && member.role === 'SUPER_ADMIN' && !isSuperAdmin;

    const departmentName = (deptId?: string | null) =>
        !deptId ? 'No department' : (departments.find(d => d.id === deptId)?.name || 'Unknown');

    const openTransactions = useMemo(
        () => transactions.filter(t => t.status === 'OPEN'),
        [transactions]
    );

    const itemsInHand = useMemo(
        () => openTransactions.reduce((sum, t) => sum + (t.items?.length || 0), 0),
        [openTransactions]
    );

    const memberAssignments = useMemo(() => {
        const shootById = new Map(shoots.map(s => [s.id, s]));
        return assignments
            .filter(a => a.userId === id)
            .map(a => ({ assignment: a, shoot: shootById.get(a.shootId)! }))
            .filter(row => !!row.shoot)
            .sort((a, b) => new Date(b.shoot.startTime).getTime() - new Date(a.shoot.startTime).getTime());
    }, [assignments, shoots, id]);

    /** Upcoming and past are separate sections: that ordering is the hierarchy. */
    const { upcoming, past } = useMemo(() => {
        const now = Date.now();
        const up = memberAssignments
            .filter(r => new Date(r.shoot.startTime).getTime() >= now)
            .sort((a, b) => new Date(a.shoot.startTime).getTime() - new Date(b.shoot.startTime).getTime());
        const done = memberAssignments.filter(r => new Date(r.shoot.startTime).getTime() < now);
        return { upcoming: up, past: done };
    }, [memberAssignments]);

    const memberLeaves = useMemo(() => leaves.filter(l => l.userId === id), [leaves, id]);
    const pendingLeaveCount = memberLeaves.filter(l => l.status === 'PENDING').length;

    const equipmentName = (itemId: string) => equipment.find(e => e.id === itemId)?.name || itemId;

    const refreshAll = async () => {
        await Promise.all([refetchMember(), refetchTransactions()]);
        queryClient.invalidateQueries({ queryKey: ['user-logs', id] });
    };

    // --- Writes -------------------------------------------------------------

    const patch = async (body: Record<string, unknown>) => {
        const res = await fetch('/api/admin/users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...body }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Update failed');
        }
        await queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
        await refetchMember();
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving || !member) return;
        setIsSaving(true);
        try {
            const body: Record<string, unknown> = {
                name: form.name.trim(),
                phone: normalizePhoneInput(form.phone) || null,
            };
            if (form.role !== member.role) body.role = form.role;
            if (isSuperAdmin && (form.departmentId || '') !== (member.departmentId || '')) {
                body.departmentId = form.departmentId || null;
            }
            if (!isSelf && form.status !== member.status) body.status = form.status;

            await patch(body);
            setIsEditing(false);
            showToast('Profile saved', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not save the profile', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleFlag = async (key: string, next: boolean, label: string) => {
        if (savingFlag) return;
        setSavingFlag(key);
        try {
            await patch({ [key]: next });
            showToast(next ? `${label} turned on` : `${label} turned off`, 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not change that setting', 'error');
        } finally {
            setSavingFlag(null);
        }
    };

    const handleToggleStatus = async () => {
        if (!member || isSelf) return;
        const suspending = member.status === 'ACTIVE';
        if (suspending) {
            const ok = await confirm({
                title: `Suspend ${member.name}?`,
                message: 'They will be blocked from signing in until reactivated. Assignments and history are kept.',
                confirmLabel: 'Suspend',
                variant: 'danger',
            });
            if (!ok) return;
        }
        try {
            await patch({ status: suspending ? 'SUSPENDED' : 'ACTIVE' });
            showToast(suspending ? `${member.name} suspended` : `${member.name} activated`, 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not change status', 'error');
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword || isSaving) return;
        setIsSaving(true);
        try {
            await patch({ password: newPassword });
            setShowPasswordModal(false);
            setNewPassword('');
            showToast('Password changed', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not change the password', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const signOutEverywhere = async () => {
        if (!member) return;
        const ok = await confirm({
            title: `Sign ${member.name} out everywhere?`,
            message: 'Every device on this list loses its session and has to sign in again.',
            confirmLabel: 'Sign out all',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await storage.deleteAllUserSessions(member.id);
            await refetchSessions();
            showToast('Signed out on all devices', 'success');
        } catch {
            showToast('Could not clear the sessions', 'error');
        }
    };

    const copy = (value: string, key: string) => {
        navigator.clipboard.writeText(value);
        setCopied(key);
        setTimeout(() => setCopied(null), 1600);
    };

    // --- Loading / missing --------------------------------------------------

    if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-[1100px] space-y-4 pb-16">
                <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
                <div className="h-48 animate-pulse rounded-2xl bg-secondary" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />
                    ))}
                </div>
            </div>
        );
    }

    if (!member) {
        return (
            <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
                <p className="text-[17px] font-semibold text-foreground">That member is not here</p>
                <p className="mt-1.5 text-[14px] text-muted-foreground">
                    The account may have been merged or deleted.
                </p>
                <Button className="mt-6" onClick={() => router.push('/admin/users')}>Back to Users</Button>
            </div>
        );
    }

    const status = statusMeta(member.status);
    const phone = userPhone(member);

    const metrics = [
        { label: 'Open checkouts', value: openTransactions.length, tab: 'equipment' as TabKey },
        { label: 'Items in hand', value: itemsInHand, tab: 'equipment' as TabKey },
        { label: `Upcoming ${labels.workPluralLower}`, value: upcoming.length, tab: 'shoots' as TabKey },
        { label: 'Leave pending', value: pendingLeaveCount, tab: 'leave' as TabKey },
    ];

    const accessRows = [
        {
            key: 'canBeAssignedToShoots',
            title: `Appears in ${labels.workLower} assignment lists`,
            help: `Planners can put them on a ${labels.workLower}.`,
            value: member.canBeAssignedToShoots ?? member.role === 'CREW',
        },
        {
            key: 'canSelfEditProfile',
            title: 'Can edit their own profile',
            help: 'Lets them fix their own name and number on the profile screen.',
            value: member.canSelfEditProfile !== false,
        },
        {
            key: 'isPrimaryLeaveApprover',
            title: 'Approves leave requests',
            help: 'Leave requests from this department are routed to them.',
            value: !!member.isPrimaryLeaveApprover,
        },
        {
            key: 'canManageExpenses',
            title: `Manages ${labels.workLower} expenses`,
            help: `Can add and edit spend against a ${labels.workLower}.`,
            value: !!member.canManageExpenses,
        },
    ];

    const fieldInput = 'h-11 w-full rounded-xl border border-input bg-secondary px-3.5 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary';
    const fieldLabel = 'mb-1.5 block text-[13px] font-medium text-foreground';

    const assignmentRows = (
        rows: typeof memberAssignments,
        key: string,
        emptyText: string,
        upcomingSection: boolean
    ) => (
        <SectionCard
            title={upcomingSection ? 'Upcoming' : 'Past'}
            count={rows.length}
        >
            {rows.length === 0 ? (
                <EmptyRow icon={<CalendarOff className="h-7 w-7" />} text={emptyText} />
            ) : (
                <>
                    <div className="divide-y divide-border/60">
                        {rows.slice(0, shown(key)).map(({ assignment, shoot }) => (
                            <ListRow
                                key={assignment.id}
                                href={linkBack(`/shoots/${shoot.id}`)}
                                title={shoot.title}
                                meta={`${whenLabel(shoot.startTime)}${shoot.location ? ` · ${shoot.location}` : ''}`}
                                right={
                                    <span className="hidden shrink-0 text-[13px] text-muted-foreground sm:block">
                                        {assignment.role}
                                    </span>
                                }
                            />
                        ))}
                    </div>
                    <ShowMore shown={shown(key)} total={rows.length} onMore={() => showMore(key)} />
                </>
            )}
        </SectionCard>
    );

    return (
        <div className="mx-auto w-full max-w-[1100px] animate-fade-in pb-16">
            <Link
                href="/admin/users"
                className="mb-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Users
            </Link>

            <PullToRefresh onRefresh={refreshAll}>
                <div className="space-y-5">
                    {/* ── Identity ───────────────────────────────────────── */}
                    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                        {isEditing ? (
                            <form onSubmit={handleSave} className="space-y-5 p-5 sm:p-6">
                                <div className="flex items-start gap-4">
                                    <UserAvatar name={form.name || member.name} role={member.role} avatarUrl={member.avatarUrl} size="lg" />
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <label className={fieldLabel}>Full name</label>
                                            <input
                                                required
                                                value={form.name}
                                                onChange={e => setForm({ ...form, name: e.target.value })}
                                                className={fieldInput}
                                            />
                                        </div>
                                        <div>
                                            <label className={fieldLabel}>WhatsApp number</label>
                                            <input
                                                type="tel"
                                                value={form.phone}
                                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                                onBlur={e => setForm(prev => ({ ...prev, phone: normalizePhoneInput(e.target.value) }))}
                                                placeholder="+91 98765 43210"
                                                className={`${fieldInput} tabular-nums`}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div>
                                        <label className={fieldLabel}>Role</label>
                                        <select
                                            value={form.role}
                                            onChange={e => setForm({ ...form, role: e.target.value as Role })}
                                            disabled={readOnly || isSelf}
                                            className={`${fieldInput} disabled:opacity-50`}
                                        >
                                            {member.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
                                            {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                                        </select>
                                        {isSelf && <p className="mt-1.5 text-[12px] text-muted-foreground">You cannot change your own role.</p>}
                                    </div>

                                    <div>
                                        <label className={fieldLabel}>Department</label>
                                        <select
                                            value={form.departmentId}
                                            onChange={e => setForm({ ...form, departmentId: e.target.value })}
                                            disabled={!isSuperAdmin}
                                            className={`${fieldInput} disabled:opacity-50`}
                                        >
                                            <option value="">No department</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className={fieldLabel}>Status</label>
                                        <select
                                            value={form.status}
                                            onChange={e => setForm({ ...form, status: e.target.value as User['status'] })}
                                            disabled={isSelf}
                                            className={`${fieldInput} disabled:opacity-50`}
                                        >
                                            <option value="ACTIVE">Active</option>
                                            <option value="PENDING">Pending</option>
                                            <option value="SUSPENDED">Suspended</option>
                                        </select>
                                        {isSelf && <p className="mt-1.5 text-[12px] text-muted-foreground">You cannot change your own status.</p>}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
                                    <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                                    <Button type="submit" isLoading={isSaving}>Save changes</Button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                                    <div className="flex min-w-0 items-center gap-4">
                                        <UserAvatar name={member.name} role={member.role} avatarUrl={member.avatarUrl} size="xl" />
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h1 className="truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[28px]">
                                                    {member.name}
                                                </h1>
                                                {isSelf && (
                                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                                                        You
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(member.status)}`}>
                                                    {statusGlyph(member.status)} {member.status}
                                                </span>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${roleBadgeClass(member.role)}`}>
                                                    {roleLabel(member.role)}
                                                </span>
                                                <span className="text-[14px] text-muted-foreground">{departmentName(member.departmentId)}</span>
                                            </div>
                                            {member.status !== 'ACTIVE' && (
                                                <p className="mt-2.5 text-[13px] text-muted-foreground">{status.help}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        {phone && (
                                            <a
                                                href={whatsappHref(phone)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-secondary/60"
                                            >
                                                <MessageCircle className="h-4 w-4 text-[#25d366]" />
                                                WhatsApp
                                            </a>
                                        )}
                                        {!readOnly && (
                                            <Button variant="outline" className="gap-2" onClick={() => setIsEditing(true)}>
                                                <Pencil className="h-4 w-4" />
                                                Edit
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-5 border-t border-border/60 px-5 py-4 sm:grid-cols-3 sm:px-6">
                                    <Field label="Email">
                                        <button
                                            onClick={() => copy(member.email, 'email')}
                                            className="inline-flex max-w-full items-center gap-1.5 truncate text-left transition-colors hover:text-primary"
                                            title="Copy email"
                                        >
                                            <span className="truncate">{member.email}</span>
                                            {copied === 'email'
                                                ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                                                : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                                        </button>
                                    </Field>
                                    <Field label="Number">
                                        {phone
                                            ? <a href={`tel:${phone}`} className="tabular-nums transition-colors hover:text-primary">{formatPhone(phone)}</a>
                                            : <span className="text-muted-foreground">Not set</span>}
                                    </Field>
                                    <Field label="User ID">
                                        <button
                                            onClick={() => copy(member.id, 'id')}
                                            className="inline-flex max-w-full items-center gap-1.5 truncate text-left transition-colors hover:text-primary"
                                            title="Copy user ID"
                                        >
                                            <span className="truncate font-mono text-[13px]">{member.id.slice(0, 8)}…</span>
                                            {copied === 'id'
                                                ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                                                : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                                        </button>
                                    </Field>
                                </div>
                            </>
                        )}
                    </section>

                    {/* ── Metrics ────────────────────────────────────────── */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {metrics.map(m => (
                            <button
                                key={m.label}
                                onClick={() => setTab(m.tab)}
                                className="rounded-2xl border border-border/70 bg-card px-4 py-4 text-left transition-colors hover:bg-secondary/40"
                            >
                                <p className="text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
                                    {m.value}
                                </p>
                                <p className="mt-1.5 truncate text-[13px] text-muted-foreground">{m.label}</p>
                            </button>
                        ))}
                    </div>

                    {/* ── Tabs ───────────────────────────────────────────── */}
                    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                        <div role="tablist" className="flex gap-1.5 pb-0.5 sm:gap-2">
                            {TABS.map(t => (
                                <button
                                    key={t.key}
                                    role="tab"
                                    aria-selected={tab === t.key}
                                    onClick={() => setTab(t.key)}
                                    className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-medium transition-all duration-200 ${tab === t.key
                                        ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-black'
                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                        }`}
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    {t.key === 'shoots' ? labels.workPlural : t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Overview ───────────────────────────────────────── */}
                    {tab === 'overview' && (
                        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
                            <SectionCard title="What they can do">
                                {readOnly ? (
                                    <p className="px-5 py-6 text-[14px] text-muted-foreground">
                                        Only a super admin can change another super admin&apos;s access.
                                    </p>
                                ) : (
                                    <div className="divide-y divide-border/60">
                                        {accessRows.map(row => (
                                            <label key={row.key} className="flex cursor-pointer items-start gap-4 px-5 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={row.value}
                                                    disabled={savingFlag === row.key}
                                                    onChange={e => toggleFlag(row.key, e.target.checked, row.title)}
                                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary disabled:opacity-50"
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-medium text-foreground">{row.title}</p>
                                                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{row.help}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>

                            <div className="space-y-5">
                                <SectionCard title="Account">
                                    <div className="divide-y divide-border/60">
                                        {!readOnly && (
                                            <button
                                                onClick={() => { setNewPassword(''); setShowPasswordModal(true); }}
                                                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/40"
                                            >
                                                <span className="flex items-center gap-3">
                                                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-[14px] font-medium text-foreground">Change password</span>
                                                </span>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                                            </button>
                                        )}

                                        {!isSelf && !readOnly && (
                                            <button
                                                onClick={handleToggleStatus}
                                                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/40"
                                            >
                                                <span className="flex items-center gap-3">
                                                    {member.status === 'ACTIVE'
                                                        ? <UserX className="h-4 w-4 text-destructive" />
                                                        : <UserCheck className="h-4 w-4 text-success" />}
                                                    <span className={`text-[14px] font-medium ${member.status === 'ACTIVE' ? 'text-destructive' : 'text-success'}`}>
                                                        {member.status === 'ACTIVE' ? 'Suspend access' : 'Activate account'}
                                                    </span>
                                                </span>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                                            </button>
                                        )}

                                        {isSelf && !readOnly && (
                                            <p className="px-5 py-4 text-[13px] text-muted-foreground">
                                                This is your own account, so changing your role or suspending yourself is off the table.
                                            </p>
                                        )}

                                        {readOnly && (
                                            <p className="px-5 py-4 text-[13px] text-muted-foreground">
                                                Only a super admin can act on another super admin&apos;s account.
                                            </p>
                                        )}
                                    </div>
                                </SectionCard>

                                <SectionCard title="Record">
                                    <dl className="divide-y divide-border/60">
                                        {[
                                            ['Role', roleLabel(member.role)],
                                            ['Department', departmentName(member.departmentId)],
                                            ['Status', status.label],
                                            [`${labels.workSingular} list`, (member.canBeAssignedToShoots ?? member.role === 'CREW') ? 'Visible to planners' : 'Hidden'],
                                        ].map(([k, v]) => (
                                            <div key={k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                                                <dt className="text-[14px] text-muted-foreground">{k}</dt>
                                                <dd className="text-[14px] font-medium text-foreground">{v}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </SectionCard>
                            </div>
                        </div>
                    )}

                    {/* ── Activity ───────────────────────────────────────── */}
                    {tab === 'activity' && (
                        <SectionCard title="Activity" count={logs.length}>
                            {logsLoading ? (
                                <div className="space-y-2 p-5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="h-10 animate-pulse rounded-lg bg-secondary" />
                                    ))}
                                </div>
                            ) : logs.length === 0 ? (
                                <EmptyRow icon={<Activity className="h-7 w-7" />} text="Nothing logged for this account yet." />
                            ) : (
                                <>
                                    <ol className="divide-y divide-border/60">
                                        {logs.slice(0, shown('logs')).map(log => (
                                            <li key={log.id} className="flex items-start gap-4 px-5 py-3.5 sm:items-center">
                                                <span className="w-[76px] shrink-0">
                                                    <Badge variant={logActionVariant(log.action)} className="w-full justify-center text-[10px]">
                                                        {log.action}
                                                    </Badge>
                                                </span>
                                                <p
                                                    className="min-w-0 flex-1 text-[14px] leading-snug text-foreground sm:truncate"
                                                    title={log.details || undefined}
                                                >
                                                    {log.details || 'No details recorded'}
                                                </p>
                                                <time
                                                    className="shrink-0 text-[13px] text-muted-foreground"
                                                    title={whenLabel(log.timestamp)}
                                                >
                                                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                                                </time>
                                            </li>
                                        ))}
                                    </ol>
                                    <ShowMore shown={shown('logs')} total={logs.length} onMore={() => showMore('logs')} />
                                    {shown('logs') >= logs.length && logs.length >= LOG_FETCH_LIMIT && (
                                        <p className="border-t border-border/60 px-5 py-3.5 text-[13px] text-muted-foreground">
                                            Showing the {LOG_FETCH_LIMIT} most recent entries. Older activity lives in the{' '}
                                            <Link href="/admin/logs" className="font-medium text-primary">activity log</Link>.
                                        </p>
                                    )}
                                </>
                            )}
                        </SectionCard>
                    )}

                    {/* ── Equipment ──────────────────────────────────────── */}
                    {tab === 'equipment' && (
                        <div className="space-y-5">
                            <SectionCard title="Out now" count={openTransactions.length}>
                                {openTransactions.length === 0 ? (
                                    <EmptyRow icon={<Package className="h-7 w-7" />} text="Nothing checked out right now." />
                                ) : (
                                    <div className="divide-y divide-border/60">
                                        {openTransactions.map(t => (
                                            <ListRow
                                                key={t.id}
                                                href={linkBack(`/transactions/${t.id}`)}
                                                title={t.project || 'Untitled checkout'}
                                                meta={
                                                    <>
                                                        {whenLabel(t.timestampOut)} · {t.items?.length || 0} items
                                                        {(t.items?.length || 0) > 0 && (
                                                            <>
                                                                {' — '}
                                                                {t.items.slice(0, 3).map(equipmentName).join(', ')}
                                                                {t.items.length > 3 ? ` +${t.items.length - 3}` : ''}
                                                            </>
                                                        )}
                                                    </>
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </SectionCard>

                            <SectionCard title="Checkout history" count={transactions.length}>
                                {transactions.length === 0 ? (
                                    <EmptyRow icon={<Package className="h-7 w-7" />} text="No checkouts on record." />
                                ) : (
                                    <>
                                        <div className="divide-y divide-border/60">
                                            {transactions.slice(0, shown('history')).map(t => (
                                                <ListRow
                                                    key={t.id}
                                                    href={linkBack(`/transactions/${t.id}`)}
                                                    title={t.project || 'Untitled checkout'}
                                                    meta={`${format(new Date(t.timestampOut), 'd MMM yyyy')} · ${t.items?.length || 0} items`}
                                                    right={
                                                        <Badge variant={t.status === 'OPEN' ? 'orange' : 'success'} className="shrink-0 text-[11px]">
                                                            {t.status === 'OPEN' ? 'Out' : 'Returned'}
                                                        </Badge>
                                                    }
                                                />
                                            ))}
                                        </div>
                                        <ShowMore shown={shown('history')} total={transactions.length} onMore={() => showMore('history')} />
                                    </>
                                )}
                            </SectionCard>
                        </div>
                    )}

                    {/* ── Shoots ─────────────────────────────────────────── */}
                    {tab === 'shoots' && (
                        <div className="space-y-5">
                            {assignmentRows(upcoming, 'upcoming', `Not on any upcoming ${labels.workPluralLower}.`, true)}
                            {assignmentRows(past, 'past', `No past ${labels.workPluralLower}.`, false)}
                        </div>
                    )}

                    {/* ── Leave ──────────────────────────────────────────── */}
                    {tab === 'leave' && (
                        <SectionCard title="Leave requests" count={memberLeaves.length}>
                            {memberLeaves.length === 0 ? (
                                <EmptyRow icon={<Calendar className="h-7 w-7" />} text="No leave requested." />
                            ) : (
                                <>
                                    <div className="divide-y divide-border/60">
                                        {memberLeaves.slice(0, shown('leave')).map(l => (
                                            <ListRow
                                                key={l.id}
                                                title={`${format(new Date(l.startDate), 'd MMM')} – ${format(new Date(l.endDate), 'd MMM yyyy')}`}
                                                meta={l.reason || 'No reason given'}
                                                right={
                                                    <Badge
                                                        variant={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'destructive' : 'orange'}
                                                        className="shrink-0 text-[11px]"
                                                    >
                                                        {l.status.charAt(0) + l.status.slice(1).toLowerCase()}
                                                    </Badge>
                                                }
                                            />
                                        ))}
                                    </div>
                                    <ShowMore shown={shown('leave')} total={memberLeaves.length} onMore={() => showMore('leave')} />
                                </>
                            )}
                        </SectionCard>
                    )}

                    {/* ── Devices ────────────────────────────────────────── */}
                    {tab === 'devices' && (
                        <SectionCard
                            title="Signed-in devices"
                            action={sessions.length > 0 ? (
                                <button onClick={signOutEverywhere} className="text-[13px] font-medium text-destructive">
                                    Sign out all
                                </button>
                            ) : undefined}
                        >
                            {sessionsLoading ? (
                                <div className="space-y-2 p-5">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary" />
                                    ))}
                                </div>
                            ) : sessions.length === 0 ? (
                                <EmptyRow icon={<Laptop className="h-7 w-7" />} text="No device has signed in with this account." />
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {sessions.map(s => {
                                        const device = describeDevice(s.user_agent);
                                        return (
                                            <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                                                    {device.mobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[14px] font-medium text-foreground">{device.label}</p>
                                                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                                                        Active {formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    )}
                </div>
            </PullToRefresh>

            {/* ── Change password ───────────────────────────────────────── */}
            {showPasswordModal && (
                <div className="modal-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
                    <Card className="w-full max-w-sm rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl">
                        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                            <h2 className="text-[17px] font-semibold tracking-tight text-foreground">Change password</h2>
                            <button onClick={() => setShowPasswordModal(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="mb-4 text-[14px] text-muted-foreground">
                            Sets a new password for <span className="font-medium text-foreground">{member.name}</span>. Share it with them directly — nothing is emailed.
                        </p>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <input
                                type="text"
                                required
                                minLength={6}
                                autoFocus
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                className={`${fieldInput} font-mono`}
                            />
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => { setShowPasswordModal(false); setNewPassword(''); }}>Cancel</Button>
                                <Button type="submit" isLoading={isSaving}>Change password</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
