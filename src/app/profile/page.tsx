'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { ActiveSessions } from '@/components/ActiveSessions';
import { UserAvatar } from '@/components/UserAvatar';

import { APP_CONFIG } from '@/lib/config';
import { useToast } from '@/lib/toast-context';
import { getRoleLabel } from '@/lib/roles';
import { roleBadgeClass, TEXT_WHATSAPP, whatsappTag } from '@/lib/user-display';
import { useDepartment } from '@/lib/department-context';
import { storage } from '@/lib/storage';
import { JiraIcon } from '@/components/icons/JiraIcon';
import {
    Check,
    CheckCircle2,
    ChevronRight,
    Copy,
    ExternalLink,
    Eye,
    EyeOff,
    Key,
    Loader2,
    Lock,
    LogOut,
    MessageSquare,
    ScrollText,
    Sliders,
    Users,
} from 'lucide-react';

/** Section shell shared by every block on this page. */
const Section = ({
    title,
    action,
    children,
}: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) => (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <header className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
            {action}
        </header>
        <div className="border-t border-border/60">{children}</div>
    </section>
);

const Row = ({
    label,
    value,
    onClick,
    hint,
}: {
    label: string;
    value: React.ReactNode;
    onClick?: () => void;
    hint?: string;
}) => {
    const body = (
        <>
            <span className="min-w-0">
                <span className="block text-[14px] text-foreground">{label}</span>
                {hint && <span className="mt-0.5 block text-[13px] text-muted-foreground">{hint}</span>}
            </span>
            <span className="shrink-0 text-[14px] text-muted-foreground">{value}</span>
        </>
    );
    const shell = 'flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left';
    return onClick ? (
        <button onClick={onClick} className={`${shell} transition-colors hover:bg-secondary/40`}>{body}</button>
    ) : (
        <div className={shell}>{body}</div>
    );
};

const FIELD = 'h-11 w-full rounded-xl border border-input bg-secondary px-3.5 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60';
const LABEL = 'mb-1.5 block text-[13px] font-medium text-foreground';

export default function ProfilePage() {
    const router = useRouter();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const { department, allDepartments, switchDepartment } = useDepartment();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    // Profile Edit State
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Jira PAT State
    const [jiraPat, setJiraPat] = useState('');
    const [showJiraPat, setShowJiraPat] = useState(false);
    const [isTestingJira, setIsTestingJira] = useState(false);
    const [isSavingJira, setIsSavingJira] = useState(false);
    const [jiraVerifiedUser, setJiraVerifiedUser] = useState<{ displayName: string; emailAddress?: string } | null>(null);

    useEffect(() => {
        if (user) {
            setPhone(user.phone || user.whatsappNumber || '');
            setName(user.name || '');
            setJiraPat(user.jiraToken || '');
        }
    }, [user]);

    if (!user) return null;

    const canEdit = user.canSelfEditProfile !== false || ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

    const copyValue = (value: string, key: string, message: string) => {
        navigator.clipboard.writeText(value);
        setCopied(key);
        showToast(message, 'success');
        setTimeout(() => setCopied(null), 1600);
    };

    const handleSaveProfile = async () => {
        if (!canEdit) {
            showToast('Profile editing is locked by your administrator', 'error');
            return;
        }

        setIsSaving(true);
        try {
            // Clean phone string (keep digits)
            let cleanedPhone = phone.replace(/[^\d+]/g, '');
            if (cleanedPhone && !cleanedPhone.startsWith('+') && cleanedPhone.length === 10) {
                cleanedPhone = `+91${cleanedPhone}`;
            }

            await storage.updateUser(user.id, {
                name: name.trim(),
                phone: cleanedPhone,
                whatsappNumber: cleanedPhone
            });

            showToast('Profile updated successfully!', 'success');
        } catch (err) {
            console.error('Failed to update profile:', err);
            showToast(err instanceof Error ? err.message : 'Failed to update profile', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestJiraToken = async () => {
        if (!jiraPat.trim()) {
            showToast('Please enter a Jira Personal Access Token first', 'error');
            return;
        }

        setIsTestingJira(true);
        try {
            const res = await fetch('/api/jira/verify-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: jiraPat.trim() })
            });

            const data = await res.json();
            if (res.ok && data.valid) {
                setJiraVerifiedUser({ displayName: data.displayName, emailAddress: data.emailAddress });
                showToast(`Token valid! Verified as ${data.displayName}`, 'success');
            } else {
                setJiraVerifiedUser(null);
                showToast(data.error || 'Invalid Jira token. Please check permissions.', 'error');
            }
        } catch (err) {
            console.error('Jira token test failed:', err);
            showToast('Failed to connect to Jira server', 'error');
        } finally {
            setIsTestingJira(false);
        }
    };

    const handleSaveJiraToken = async () => {
        setIsSavingJira(true);
        try {
            const cleanedToken = jiraPat.trim() || null;
            await storage.updateUser(user.id, {
                jiraToken: cleanedToken
            });

            if (cleanedToken) {
                showToast('Personal Jira token saved! Your actions will now be attributed to your Jira account.', 'success');
            } else {
                showToast('Personal token cleared. The app will now use the default system account (video.support).', 'success');
            }
        } catch (err) {
            console.error('Failed to save Jira token:', err);
            showToast(err instanceof Error ? err.message : 'Failed to save Jira token', 'error');
        } finally {
            setIsSavingJira(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    const handleCopyDebugInfo = () => {
        const info = [
            `App: ${APP_CONFIG.name}`,
            `Version: ${APP_CONFIG.version}`,
            `Environment: ${APP_CONFIG.build}`,
            `User ID: ${user.id}`,
            `Email: ${user.email}`,
            `Phone: ${phone}`,
            `Role: ${getRoleLabel(user.role)}`,
            `User Agent: ${navigator.userAgent}`,
        ].join('\n');

        navigator.clipboard.writeText(info);
        showToast('Debug info copied to clipboard', 'success');
    };

    const menuItems = [
        { label: 'User Management', path: '/admin/users', roles: ['ADMIN', 'SUPER_ADMIN'], icon: <Users className="h-4 w-4" /> },
        { label: 'WhatsApp Hub', path: '/admin/whatsapp', roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER'], icon: <MessageSquare className={`h-4 w-4 ${TEXT_WHATSAPP}`} /> },
        { label: 'Activity Logs', path: '/admin/logs', roles: ['ADMIN', 'SUPER_ADMIN'], icon: <ScrollText className="h-4 w-4" /> },
    ];

    const visibleMenuItems = menuItems.filter(item => item.roles.includes(user.role));
    const tag = whatsappTag(phone);

    return (
        <div className="mx-auto w-full max-w-6xl animate-fade-in pb-16">
            <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Desktop puts identity in a sticky rail, so the settings column is not a
                narrow ribbon stranded in the middle of a wide screen. */}
            <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">

                {/* ── Identity rail ──────────────────────────────────────── */}
                <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
                    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                        <div className="flex flex-col items-center px-5 py-6 text-center">
                            <UserAvatar name={user.name} role={user.role} avatarUrl={user.avatarUrl} size="xl" />
                            <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                                {user.name}
                            </h1>
                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${roleBadgeClass(user.role)}`}>
                                    {getRoleLabel(user.role)}
                                </span>
                                {department && (
                                    <span className="text-[13px] text-muted-foreground">{department.name}</span>
                                )}
                            </div>
                            {tag && (
                                <p className={`mt-3 text-[13px] font-medium tabular-nums ${TEXT_WHATSAPP}`}>{tag}</p>
                            )}
                        </div>

                        <div className="divide-y divide-border/60 border-t border-border/60">
                            <Row
                                label="Email"
                                value={
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="max-w-[150px] truncate">{user.email || 'Not set'}</span>
                                        {copied === 'email'
                                            ? <Check className="h-3.5 w-3.5 text-primary" />
                                            : <Copy className="h-3.5 w-3.5 text-muted-foreground/60" />}
                                    </span>
                                }
                                onClick={() => copyValue(user.email || '', 'email', 'Email copied')}
                            />
                            <Row
                                label="User ID"
                                value={
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="font-mono text-[13px]">{user.id.substring(0, 8)}…</span>
                                        {copied === 'id'
                                            ? <Check className="h-3.5 w-3.5 text-primary" />
                                            : <Copy className="h-3.5 w-3.5 text-muted-foreground/60" />}
                                    </span>
                                }
                                onClick={() => copyValue(user.id, 'id', 'User ID copied')}
                            />
                        </div>
                    </section>

                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card py-3.5 text-[15px] font-medium text-destructive transition-colors hover:bg-destructive/5"
                    >
                        <LogOut className="h-4 w-4" />
                        Sign out
                    </button>
                </aside>

                {/* ── Settings column ────────────────────────────────────── */}
                <div className="min-w-0 space-y-5">

                    <Section
                        title="Personal details"
                        action={!canEdit ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/25 px-2.5 py-0.5 text-[11px] font-semibold text-[#8a6d00] dark:text-[var(--warning)]">
                                <Lock className="h-3 w-3" />
                                Locked by admin
                            </span>
                        ) : undefined}
                    >
                        <div className="grid gap-4 p-5 sm:grid-cols-2">
                            <div>
                                <label className={LABEL}>Full name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="Enter your name"
                                    className={FIELD}
                                />
                            </div>

                            <div>
                                <label className={LABEL}>WhatsApp number</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="+91 98765 43210"
                                    className={`${FIELD} tabular-nums`}
                                />
                            </div>

                            <p className="text-[13px] text-muted-foreground sm:col-span-2">
                                Your number is used for call-sheet tagging and group WhatsApp notifications.
                            </p>

                            {canEdit && (
                                <div className="sm:col-span-2">
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={isSaving}
                                        className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving…' : 'Save changes'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </Section>

                    <Section
                        title="Jira integration"
                        action={user.jiraToken ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#248a3d] dark:text-[#34c759]">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                Personal token active
                            </span>
                        ) : (
                            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                System account
                            </span>
                        )}
                    >
                        <div className="space-y-4 p-5">
                            <div className="flex items-start gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#0052CC]/20 bg-[#0052CC]/10 text-[#0052CC] dark:text-[#4c9aff]">
                                    <JiraIcon size={20} />
                                </span>
                                <p className="text-[13px] leading-relaxed text-muted-foreground">
                                    Add your personal access token so status changes and comments are recorded under
                                    your Jira account. Left blank, the app posts as the shared system account.
                                </p>
                            </div>

                            <div>
                                <label className={LABEL}>Personal access token</label>
                                <div className="relative">
                                    <input
                                        type={showJiraPat ? 'text' : 'password'}
                                        value={jiraPat}
                                        onChange={(e) => {
                                            setJiraPat(e.target.value);
                                            setJiraVerifiedUser(null);
                                        }}
                                        placeholder="Paste your token"
                                        className={`${FIELD} pr-11 font-mono`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowJiraPat(!showJiraPat)}
                                        aria-label={showJiraPat ? 'Hide token' : 'Show token'}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {showJiraPat ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>

                                {jiraVerifiedUser && (
                                    <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-success/12 px-3 py-2.5 text-[13px] text-[#248a3d] dark:text-[#34c759]">
                                        <CheckCircle2 size={15} className="shrink-0" />
                                        <span>
                                            Verified as <strong className="font-semibold">{jiraVerifiedUser.displayName}</strong>
                                            {jiraVerifiedUser.emailAddress ? ` (${jiraVerifiedUser.emailAddress})` : ''}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleTestJiraToken}
                                    disabled={!jiraPat.trim() || isTestingJira}
                                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border bg-secondary px-4 text-[14px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                >
                                    {isTestingJira ? <Loader2 size={15} className="animate-spin" /> : <Key size={15} />}
                                    Test connection
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSaveJiraToken}
                                    disabled={isSavingJira}
                                    className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0052CC] px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                >
                                    {isSavingJira ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                                    {jiraPat.trim() ? 'Save token' : 'Use system account'}
                                </button>

                                <a
                                    href="https://servicedesk.isha.in/secure/ViewProfile.jspa"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-primary"
                                >
                                    Create a token
                                    <ExternalLink size={13} />
                                </a>
                            </div>
                        </div>
                    </Section>

                    <div className="grid gap-5 xl:grid-cols-2">
                        <Section title="Account">
                            <div className="divide-y divide-border/60">
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-secondary/40"
                                >
                                    <span className="flex items-center gap-3">
                                        <Sliders className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-[14px] text-foreground">App appearance</span>
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                                </button>
                                <Row label="Role" value={getRoleLabel(user.role)} />
                                <Row
                                    label="Version"
                                    value={APP_CONFIG.version}
                                    hint="Tap to copy diagnostics"
                                    onClick={handleCopyDebugInfo}
                                />
                                <Row
                                    label="Environment"
                                    value={
                                        <span className="inline-flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${APP_CONFIG.build === 'Production' ? 'bg-success' : 'bg-[var(--orange)]'}`} />
                                            {APP_CONFIG.build}
                                        </span>
                                    }
                                />
                            </div>
                        </Section>

                        <div className="space-y-5">
                            {user.role === 'SUPER_ADMIN' && switchDepartment && (
                                <Section title="Preferences">
                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="min-w-0">
                                            <p className="text-[14px] text-foreground">Default department</p>
                                            <p className="mt-0.5 text-[13px] text-muted-foreground">Loads on app start</p>
                                        </div>
                                        <select
                                            value={department?.id || ''}
                                            onChange={(e) => {
                                                switchDepartment(e.target.value || null);
                                                showToast(
                                                    e.target.value
                                                        ? `Default set to ${allDepartments.find(d => d.id === e.target.value)?.name || 'department'}`
                                                        : 'Default set to Global view',
                                                    'success'
                                                );
                                            }}
                                            className="h-10 max-w-[55%] shrink-0 rounded-xl border border-input bg-secondary px-3 text-[14px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="">Global (all departments)</option>
                                            {allDepartments.map(dept => (
                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </Section>
                            )}

                            {visibleMenuItems.length > 0 && (
                                <Section title="Management">
                                    <div className="divide-y divide-border/60">
                                        {visibleMenuItems.map((item) => (
                                            <button
                                                key={item.path}
                                                onClick={() => router.push(item.path)}
                                                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-secondary/40"
                                            >
                                                <span className="flex items-center gap-3">
                                                    <span className="text-muted-foreground">{item.icon}</span>
                                                    <span className="text-[14px] text-foreground">{item.label}</span>
                                                </span>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                                            </button>
                                        ))}
                                    </div>
                                </Section>
                            )}
                        </div>
                    </div>

                    <ActiveSessions />
                </div>
            </div>
        </div>
    );
}
