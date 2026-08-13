'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { User, Role } from '@/types';
import { storage } from '@/lib/storage';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { UserAvatar } from '@/components/UserAvatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useUsers, USER_KEYS } from '@/hooks/useUsers';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import {
    ASSIGNABLE_ROLES,
    ROLE_ORDER,
    formatPhone,
    isShootAssignable,
    normalizePhoneInput,
    phoneDigits,
    roleBadgeClass,
    roleLabel,
    statusBadgeClass,
    statusGlyph,
    TEXT_WHATSAPP,
    userPhone,
    whatsappTag,
} from '@/lib/user-display';

type StatusFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED';
type SortKey = 'name' | 'role' | 'status' | 'department';
type SortDir = 'asc' | 'desc';

/** Column track shared by the sort header and every desktop row. */
const GRID_COLS = 'minmax(280px,1.45fr) 150px 120px minmax(150px,0.75fr) minmax(560px,1.25fr)';

const randomPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    const bytes = new Uint32Array(12);
    crypto.getRandomValues(bytes);
    bytes.forEach(b => { out += alphabet[b % alphabet.length]; });
    return out;
};

export default function TeamMembersPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { department } = useDepartment();
    const labels = getDepartmentLabels(department);
    const queryClient = useQueryClient();

    const { data: users = [], isLoading, refetch } = useUsers();
    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => storage.getDepartments(),
        staleTime: 5 * 60 * 1000,
    });

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    const [showAddModal, setShowAddModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);

    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'CREW' as Role,
        departmentId: '',
        canBeAssignedToShoots: true,
        canSelfEditProfile: true,
    });

    const [importFile, setImportFile] = useState<File | null>(null);
    const [importDepartmentId, setImportDepartmentId] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const [mergeDuplicateEmail, setMergeDuplicateEmail] = useState('');
    const [mergePrimaryEmail, setMergePrimaryEmail] = useState('');
    const [isMerging, setIsMerging] = useState(false);

    const isSuperAdmin = user?.role === 'SUPER_ADMIN';

    useEffect(() => {
        if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.push('/dashboard');
        }
    }, [user, router]);

    useEffect(() => {
        if (user && !isSuperAdmin) {
            setNewUser(prev => ({ ...prev, departmentId: user.departmentId || '' }));
            setImportDepartmentId(user.departmentId || '');
        }
    }, [user, isSuperAdmin]);

    const getDeptName = useCallback((deptId?: string | null) => {
        if (!deptId) return 'No Department';
        return departments.find(d => d.id === deptId)?.name || 'Unknown';
    }, [departments]);

    const refresh = () => queryClient.invalidateQueries({ queryKey: USER_KEYS.all });

    /** Everyone this admin may see, before search / tabs / sorting. */
    const scopedUsers = useMemo(() => {
        if (user?.role === 'SUPER_ADMIN') {
            return department ? users.filter(u => u.departmentId === department.id) : users;
        }
        if (user?.role === 'ADMIN' && user.departmentId) {
            return users.filter(u => u.departmentId === user.departmentId && u.role !== 'SUPER_ADMIN');
        }
        return users.filter(u => u.role !== 'SUPER_ADMIN');
    }, [users, department, user]);

    const statusCounts = useMemo(() => ({
        ALL: scopedUsers.length,
        ACTIVE: scopedUsers.filter(u => u.status === 'ACTIVE').length,
        PENDING: scopedUsers.filter(u => u.status === 'PENDING').length,
        SUSPENDED: scopedUsers.filter(u => u.status === 'SUSPENDED').length,
    }), [scopedUsers]);

    const filteredUsers = useMemo(() => {
        let list = [...scopedUsers];

        if (statusFilter !== 'ALL') list = list.filter(u => u.status === statusFilter);

        const q = search.trim().toLowerCase();
        if (q) {
            const qDigits = q.replace(/[^\d]/g, '');
            list = list.filter(u =>
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                (qDigits.length >= 3 && phoneDigits(userPhone(u)).includes(qDigits)) ||
                roleLabel(u.role).toLowerCase().includes(q) ||
                getDeptName(u.departmentId).toLowerCase().includes(q)
            );
        }

        const weight = (u: User) => {
            switch (sortKey) {
                case 'role': return String(ROLE_ORDER.indexOf(u.role)).padStart(2, '0');
                case 'status': return u.status;
                case 'department': return getDeptName(u.departmentId).toLowerCase();
                default: return u.name.toLowerCase();
            }
        };

        list.sort((a, b) => {
            const va = weight(a);
            const vb = weight(b);
            if (va === vb) return a.name.localeCompare(b.name);
            return sortDir === 'asc' ? (va < vb ? -1 : 1) : (va < vb ? 1 : -1);
        });

        return list;
    }, [scopedUsers, statusFilter, search, sortKey, sortDir, getDeptName]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir('asc'); }
    };

    const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => (
        <svg className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
    );

    const roleBadge = (role: string) => {
        const showGlobalMarker = isSuperAdmin && role === 'SUPER_ADMIN';
        return (
            <span className="inline-flex items-center gap-1.5">
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${roleBadgeClass(role)}`}>
                    {roleLabel(role)}
                </span>
                {showGlobalMarker && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Global
                    </span>
                )}
            </span>
        );
    };

    const statusBadge = (status: string) => (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(status)}`}>
            {statusGlyph(status)} {status}
        </span>
    );

    // --- Row actions --------------------------------------------------------

    const patchUser = async (id: string, body: Record<string, unknown>) => {
        const res = await fetch('/api/admin/users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...body }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Update failed');
        }
    };

    const logEdit = async (entityId: string, details: string) => {
        if (!user) return;
        try {
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details,
                departmentId: user.departmentId,
            });
        } catch {
            // A missing audit line must never block the change the admin just made.
        }
    };

    const withRowLock = async (id: string, run: () => Promise<void>) => {
        if (processingIds.has(id)) return;
        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await run();
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleRoleChange = (target: User, newRole: string) => withRowLock(target.id, async () => {
        if (user && target.id === user.id) {
            showToast('You cannot change your own role', 'error');
            return;
        }
        try {
            await patchUser(target.id, { role: newRole });
            await refresh();
            showToast(`Role updated to ${roleLabel(newRole)}`, 'success');
            await logEdit(target.id, `Changed role of user "${target.name}" to ${roleLabel(newRole)}`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update role', 'error');
        }
    });

    const handleDepartmentChange = (target: User, newDeptId: string) => withRowLock(target.id, async () => {
        try {
            await patchUser(target.id, { departmentId: newDeptId || null });
            await refresh();
            showToast('Department updated', 'success');
            await logEdit(target.id, `Moved user "${target.name}" to ${newDeptId ? getDeptName(newDeptId) : 'no department'}`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update department', 'error');
        }
    });

    const handlePlannerChange = (target: User, next: boolean) => withRowLock(target.id, async () => {
        try {
            await patchUser(target.id, { canBeAssignedToShoots: next });
            await refresh();
            showToast(
                next
                    ? `${target.name} can be assigned to ${labels.workPluralLower}`
                    : `${target.name} hidden from ${labels.workLower} assignment lists`,
                'success'
            );
            await logEdit(target.id, `${next ? 'Enabled' : 'Disabled'} ${labels.workLower} assignment eligibility for "${target.name}"`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update planner visibility', 'error');
        }
    });

    const handlePrimaryApproverChange = (target: User, next: boolean) => withRowLock(target.id, async () => {
        try {
            await patchUser(target.id, { isPrimaryLeaveApprover: next });
            await refresh();
            showToast(next ? `${target.name} is now the primary leave approver` : `${target.name} is no longer a primary leave approver`, 'success');
            await logEdit(target.id, `Set user "${target.name}" as ${next ? 'primary' : 'non-primary'} leave approver`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update leave approver', 'error');
        }
    });

    const handleToggleStatus = (target: User) => withRowLock(target.id, async () => {
        if (user && target.id === user.id) {
            showToast('You cannot change your own status', 'error');
            return;
        }
        const suspending = target.status === 'ACTIVE';
        if (suspending) {
            const ok = await confirm({
                title: `Suspend ${target.name}?`,
                message: 'They will be blocked from signing in until reactivated. History and assignments are kept.',
                confirmLabel: 'Suspend',
                variant: 'danger',
            });
            if (!ok) return;
        }
        try {
            await patchUser(target.id, { status: suspending ? 'SUSPENDED' : 'ACTIVE' });
            await refresh();
            showToast(suspending ? `${target.name} suspended` : `${target.name} activated`, 'success');
            await logEdit(target.id, `${suspending ? 'Suspended' : 'Activated'} user "${target.name}"`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update status', 'error');
        }
    });

    const openPasswordModal = (u: User) => {
        setSelectedUser(u);
        setNewPassword('');
        setShowPasswordModal(true);
    };

    // --- Create / password / import / merge / export -------------------------

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newUser,
                    phone: normalizePhoneInput(newUser.phone) || null,
                    departmentId: newUser.departmentId || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showToast(err.error || 'Failed to create user', 'error');
                return;
            }
            setShowAddModal(false);
            setNewUser({
                name: '', email: '', password: '', phone: '', role: 'CREW',
                departmentId: isSuperAdmin ? '' : (user?.departmentId || ''),
                canBeAssignedToShoots: true, canSelfEditProfile: true,
            });
            await refresh();
            showToast(`${labels.teamSingular} added`, 'success');
        } catch {
            showToast('Failed to create user', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || !newPassword || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await patchUser(selectedUser.id, { password: newPassword });
            setShowPasswordModal(false);
            showToast('Password changed successfully', 'success');
            await logEdit(selectedUser.id, `Changed password for user "${selectedUser.name}"`);
            setSelectedUser(null);
            setNewPassword('');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to change password', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkImport = async () => {
        if (!importFile || isUploading) return;
        setIsUploading(true);
        try {
            const text = await importFile.text();
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            if (lines.length < 2) {
                showToast('That file has a header but no rows', 'error');
                return;
            }

            let ok = 0;
            let failed = 0;
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',').map(p => p.trim());
                if (parts.length < 4) { failed++; continue; }
                try {
                    const res = await fetch('/api/admin/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: parts[0],
                            email: parts[1],
                            password: parts[2],
                            role: (parts[3] || 'CREW').toUpperCase(),
                            phone: normalizePhoneInput(parts[4]) || null,
                            departmentId: importDepartmentId || null,
                            canBeAssignedToShoots: true,
                        }),
                    });
                    if (res.ok) ok++; else failed++;
                } catch {
                    failed++;
                }
            }

            setShowBulkImportModal(false);
            setImportFile(null);
            await refresh();
            if (ok > 0) {
                showToast(`Successfully imported ${ok} users`, 'success');
                if (failed > 0) showToast(`${failed} users failed to import`, 'warning');
                await logEdit('bulk_import', `Bulk imported ${ok} users`);
            } else {
                showToast('No users were imported. Check CSV format.', 'error');
            }
        } catch {
            showToast('Failed to process CSV file', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleMergeUsers = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mergeDuplicateEmail || !mergePrimaryEmail || isMerging) return;
        if (mergeDuplicateEmail === mergePrimaryEmail) {
            showToast('Emails cannot be the same', 'error');
            return;
        }
        const ok = await confirm({
            title: 'Confirm Merge',
            message: `Merge ${mergeDuplicateEmail} into ${mergePrimaryEmail}? This moves all data and cannot be undone.`,
            confirmLabel: 'Merge Data',
            variant: 'danger',
        });
        if (!ok) return;

        setIsMerging(true);
        try {
            const res = await fetch('/api/admin/users/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duplicateEmail: mergeDuplicateEmail.trim(),
                    primaryEmail: mergePrimaryEmail.trim(),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showToast(data.error || 'Failed to merge users', 'error');
                return;
            }
            showToast('Users merged successfully', 'success');
            await logEdit('system', `Merged duplicate user ${mergeDuplicateEmail} into ${mergePrimaryEmail}`);
            setShowMergeModal(false);
            setMergeDuplicateEmail('');
            setMergePrimaryEmail('');
            await refresh();
        } catch {
            showToast('Failed to merge users', 'error');
        } finally {
            setIsMerging(false);
        }
    };

    const exportCsv = () => {
        const rows = [
            ['Name', 'Email', 'Phone', 'WhatsApp Tag', 'Role', 'Department', 'Status', 'Planner'],
            ...filteredUsers.map(u => [
                u.name,
                u.email,
                userPhone(u) || '',
                whatsappTag(userPhone(u)),
                roleLabel(u.role),
                getDeptName(u.departmentId),
                u.status,
                isShootAssignable(u) ? 'On' : 'Hidden',
            ]),
        ];
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `team-members-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast(`Exported ${filteredUsers.length} people`, 'success');
    };

    // --- Loading ------------------------------------------------------------

    if (isLoading) return (
        <div className="mx-auto max-w-[1400px] p-8 xl:max-w-[1600px]">
            <div className="animate-pulse space-y-4">
                <div className="h-8 w-48 rounded-xl bg-gray-200 dark:bg-gray-800" />
                <div className="h-12 rounded-xl bg-gray-200 dark:bg-gray-800" />
                {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl bg-gray-200 dark:bg-gray-800" />)}
            </div>
        </div>
    );

    const headerButton = 'flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-[#1c1c1e] font-semibold text-sm rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-2';
    const pillButton = 'h-9 rounded-xl px-3 text-[12.5px] font-semibold transition-all active:scale-95';
    const iconButton = 'flex h-9 w-9 items-center justify-center rounded-xl transition-colors';

    return (
        <div className="mx-auto max-w-[1400px] animate-fade-in xl:max-w-[1600px]">
            {/* Header */}
            <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
                        Team Members
                    </h1>
                    <p className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">
                        {filteredUsers.length} of {statusCounts.ALL} people
                        {department ? ` in ${department.name}` : ''}
                    </p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                    <button onClick={exportCsv} className={`${headerButton} text-gray-700 dark:text-gray-200`} title="Download the people currently listed">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Export CSV
                    </button>
                    <button onClick={() => setShowBulkImportModal(true)} className={`${headerButton} text-primary`}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Import CSV
                    </button>
                    {isSuperAdmin && (
                        <button
                            onClick={() => setShowMergeModal(true)}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 shadow-sm transition-all hover:bg-red-50 active:scale-95 sm:flex-none dark:border-red-900/50 dark:bg-[#1c1c1e] dark:text-red-500 dark:hover:bg-red-950/30"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            Merge Duplicate
                        </button>
                    )}
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:opacity-90 active:scale-95 sm:flex-none"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Member
                    </button>
                </div>
            </div>

            {/* Search & status tabs */}
            <div className="mb-4 space-y-3">
                <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by name, email, number, role, or department..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-10 text-[14px] text-gray-900 placeholder-gray-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary dark:border-gray-800 dark:bg-[#1c1c1e] dark:text-white"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear search">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="flex gap-1.5 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800/50">
                    {(['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED'] as StatusFilter[]).map(status => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`min-w-fit flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all ${statusFilter === status
                                ? status === 'ALL' ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                                    : status === 'ACTIVE' ? 'bg-green-500 text-white shadow-sm'
                                        : status === 'PENDING' ? 'bg-amber-500 text-white shadow-sm'
                                            : 'bg-red-500 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                        >
                            {status === 'ALL' ? `All (${statusCounts.ALL})` : `${status.charAt(0)}${status.slice(1).toLowerCase()} (${statusCounts[status]})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <PullToRefresh onRefresh={async () => { await refetch(); }}>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1c1c1e]">
                    {/* Sort header (desktop) */}
                    <div
                        className="hidden items-center gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 lg:grid dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                        style={{ gridTemplateColumns: GRID_COLS }}
                    >
                        <button className="flex items-center gap-1 text-left transition-colors hover:text-gray-700 dark:hover:text-gray-200" onClick={() => handleSort('name')}>
                            Name <SortIcon active={sortKey === 'name'} dir={sortKey === 'name' ? sortDir : 'asc'} />
                        </button>
                        <button className="flex items-center gap-1 text-left transition-colors hover:text-gray-700 dark:hover:text-gray-200" onClick={() => handleSort('role')}>
                            Role <SortIcon active={sortKey === 'role'} dir={sortKey === 'role' ? sortDir : 'asc'} />
                        </button>
                        <button className="flex items-center gap-1 text-left transition-colors hover:text-gray-700 dark:hover:text-gray-200" onClick={() => handleSort('status')}>
                            Status <SortIcon active={sortKey === 'status'} dir={sortKey === 'status' ? sortDir : 'asc'} />
                        </button>
                        <button className="flex items-center gap-1 text-left transition-colors hover:text-gray-700 dark:hover:text-gray-200" onClick={() => handleSort('department')}>
                            Department <SortIcon active={sortKey === 'department'} dir={sortKey === 'department' ? sortDir : 'asc'} />
                        </button>
                        <div className="pr-1 text-right">Manage</div>
                    </div>

                    {filteredUsers.length === 0 ? (
                        <div className="px-6 py-16 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                                <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                </svg>
                            </div>
                            <p className="font-medium text-gray-500 dark:text-gray-400">
                                {search ? `No results for "${search}"` : statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} users` : 'No team members yet'}
                            </p>
                            {search && <button onClick={() => setSearch('')} className="mt-2 text-sm text-primary hover:underline">Clear search</button>}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredUsers.map(u => {
                                const isSelf = user?.id === u.id;
                                const phone = userPhone(u);
                                const planner = isShootAssignable(u);
                                const canShowApprover = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(u.role);

                                return (
                                    <div
                                        key={u.id}
                                        className={`p-4 transition-colors hover:bg-gray-50 sm:px-5 sm:py-4 dark:hover:bg-gray-800/50 ${processingIds.has(u.id) ? 'pointer-events-none opacity-60' : ''}`}
                                    >
                                        {/* Desktop */}
                                        <div className="hidden items-center gap-4 lg:grid" style={{ gridTemplateColumns: GRID_COLS }}>
                                            {/* Name + avatar + number */}
                                            <div className="flex min-w-0 items-center gap-3">
                                                <UserAvatar name={u.name} role={u.role} avatarUrl={u.avatarUrl} size="sm" />
                                                <div className="min-w-0 space-y-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <Link
                                                            href={`/admin/users/${u.id}`}
                                                            className="truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] text-gray-900 transition-colors hover:text-primary dark:text-white"
                                                            title={`Open ${u.name}'s profile`}
                                                        >
                                                            {u.name}
                                                        </Link>
                                                        {isSelf && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">You</span>}
                                                    </div>
                                                    <p className="truncate text-[13px] leading-snug text-gray-500 dark:text-gray-400">{u.email}</p>
                                                    {phone && (
                                                        <p className={`truncate text-[13px] font-medium leading-snug tabular-nums ${TEXT_WHATSAPP}`}>
                                                            {formatPhone(phone)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex min-w-0 items-center">{roleBadge(u.role)}</div>
                                            <div className="flex min-w-0 items-center">{statusBadge(u.status)}</div>
                                            <div className="truncate text-[13px] text-gray-600 dark:text-gray-300">
                                                {getDeptName(u.departmentId)}
                                            </div>

                                            {/* Manage */}
                                            <div className="flex min-w-0 items-center justify-end gap-2">
                                                {!isSelf ? (
                                                    <>
                                                        <select
                                                            className="h-9 w-[140px] min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                            value={u.role}
                                                            onChange={e => handleRoleChange(u, e.target.value)}
                                                            aria-label={`Role for ${u.name}`}
                                                        >
                                                            {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                                                        </select>

                                                        {isSuperAdmin && u.role !== 'SUPER_ADMIN' && (
                                                            <select
                                                                className="h-9 w-[170px] min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                                value={u.departmentId || ''}
                                                                onChange={e => handleDepartmentChange(u, e.target.value)}
                                                                aria-label={`Department for ${u.name}`}
                                                            >
                                                                <option value="">No Department</option>
                                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        )}

                                                        <button
                                                            onClick={() => handlePlannerChange(u, !planner)}
                                                            className={`${pillButton} w-[112px] ${planner
                                                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                                                }`}
                                                            title={planner
                                                                ? `Hide from ${labels.workLower} assignment lists`
                                                                : `Show in ${labels.workLower} assignment lists`}
                                                        >
                                                            {planner ? 'Planner On' : 'Hidden'}
                                                        </button>

                                                        {canShowApprover && (
                                                            <button
                                                                onClick={() => handlePrimaryApproverChange(u, !u.isPrimaryLeaveApprover)}
                                                                className={`${iconButton} ${u.isPrimaryLeaveApprover
                                                                    ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-yellow-500 dark:bg-slate-800 dark:hover:bg-slate-700'
                                                                    }`}
                                                                title={u.isPrimaryLeaveApprover ? 'Remove primary leave approver' : 'Make primary leave approver'}
                                                            >
                                                                <svg className="h-4 w-4" fill={u.isPrimaryLeaveApprover ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                                                </svg>
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => openPasswordModal(u)}
                                                            className={`${iconButton} bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-white`}
                                                            title="Change password"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                                            </svg>
                                                        </button>

                                                        <button
                                                            onClick={() => handleToggleStatus(u)}
                                                            className={`${pillButton} ${u.status === 'ACTIVE'
                                                                ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400'
                                                                : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-950/30 dark:text-green-400'
                                                                }`}
                                                        >
                                                            {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                            Current account
                                                        </span>
                                                        <button
                                                            onClick={() => openPasswordModal(u)}
                                                            className={`${iconButton} bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-white`}
                                                            title="Change password"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Mobile */}
                                        <div className="space-y-3 lg:hidden">
                                            <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3">
                                                <UserAvatar name={u.name} role={u.role} avatarUrl={u.avatarUrl} size="md" />
                                                <div className="min-w-0 flex-1 space-y-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-gray-900 dark:text-white">{u.name}</span>
                                                        {isSelf && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary dark:bg-primary/20">You</span>}
                                                    </div>
                                                    <p className="truncate text-[13px] leading-snug text-gray-500 dark:text-gray-400">{u.email}</p>
                                                    {phone && (
                                                        <p className={`truncate text-[13px] font-medium leading-snug tabular-nums ${TEXT_WHATSAPP}`}>{formatPhone(phone)}</p>
                                                    )}
                                                    <div className="mt-1 flex items-center gap-1.5">
                                                        {roleBadge(u.role)}
                                                        {statusBadge(u.status)}
                                                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{getDeptName(u.departmentId)}</span>
                                                    </div>
                                                </div>
                                                <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </Link>

                                            {!isSelf && (
                                                <div className="mt-2 flex flex-col gap-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <select
                                                            className="flex-1 rounded-xl border-0 bg-gray-100 px-3 py-2.5 text-[13px] font-medium text-gray-900 focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
                                                            value={u.role}
                                                            onChange={e => handleRoleChange(u, e.target.value)}
                                                            aria-label={`Role for ${u.name}`}
                                                        >
                                                            {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                                                        </select>

                                                        {isSuperAdmin && u.role !== 'SUPER_ADMIN' && (
                                                            <select
                                                                className="flex-1 rounded-xl border-0 bg-gray-100 px-3 py-2.5 text-[13px] font-medium text-gray-900 focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
                                                                value={u.departmentId || ''}
                                                                onChange={e => handleDepartmentChange(u, e.target.value)}
                                                                aria-label={`Department for ${u.name}`}
                                                            >
                                                                <option value="">Global</option>
                                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                            </select>
                                                        )}
                                                    </div>

                                                    <button
                                                        onClick={() => handlePlannerChange(u, !planner)}
                                                        className={`w-full rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition-all active:scale-95 ${planner
                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                            }`}
                                                    >
                                                        {planner
                                                            ? `Can be assigned to ${labels.workPluralLower}`
                                                            : `Hidden from ${labels.workLower} assignment lists`}
                                                    </button>

                                                    <div className="flex items-center gap-2">
                                                        {canShowApprover && (
                                                            <button
                                                                onClick={() => handlePrimaryApproverChange(u, !u.isPrimaryLeaveApprover)}
                                                                className={`flex flex-1 items-center justify-center rounded-xl p-2.5 transition-colors ${u.isPrimaryLeaveApprover
                                                                    ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-yellow-500 dark:bg-gray-800 dark:hover:bg-gray-700'
                                                                    }`}
                                                                title={u.isPrimaryLeaveApprover ? 'Remove primary leave approver' : 'Make primary leave approver'}
                                                            >
                                                                <svg className="h-4 w-4" fill={u.isPrimaryLeaveApprover ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                                                </svg>
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => openPasswordModal(u)}
                                                            className="flex flex-1 items-center justify-center rounded-xl bg-gray-100 p-2.5 text-primary dark:bg-gray-800"
                                                            title="Change password"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                                            </svg>
                                                        </button>

                                                        <button
                                                            onClick={() => handleToggleStatus(u)}
                                                            className={`flex-[2] rounded-xl px-3 py-2.5 text-center text-[12.5px] font-semibold transition-all active:scale-95 ${u.status === 'ACTIVE'
                                                                ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
                                                                : 'bg-green-50 text-green-600 dark:bg-green-900/20'
                                                                }`}
                                                        >
                                                            {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </PullToRefresh>

            {/* ── Add member ─────────────────────────────────────────────── */}
            {showAddModal && (
                <div className="modal-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
                    <Card className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl">
                        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                            <h2 className="text-[17px] font-semibold text-foreground">Add {labels.teamSingular}</h2>
                            <button onClick={() => setShowAddModal(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <form onSubmit={handleAddUser} className="space-y-4">
                            <div>
                                <label className="mb-2 block text-[13px] font-medium text-foreground">Full Name</label>
                                <input
                                    required
                                    value={newUser.name}
                                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3.5 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[13px] font-medium text-foreground">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={newUser.email}
                                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3.5 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-[13px] font-medium text-foreground">Temporary Password</label>
                                    <button
                                        type="button"
                                        onClick={() => setNewUser(prev => ({ ...prev, password: randomPassword() }))}
                                        className="text-[12px] font-semibold text-primary hover:underline"
                                    >
                                        Generate
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    required
                                    minLength={6}
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    placeholder="At least 6 characters"
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3.5 font-mono text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-[13px] font-medium text-foreground">WhatsApp Number</label>
                                <input
                                    type="tel"
                                    value={newUser.phone}
                                    onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
                                    onBlur={e => setNewUser(prev => ({ ...prev, phone: normalizePhoneInput(e.target.value) }))}
                                    placeholder="+91 98765 43210"
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3.5 font-mono text-[14px] tabular-nums text-foreground outline-none focus:ring-2 focus:ring-primary"
                                />
                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                    Used to tag them in WhatsApp notifications as{' '}
                                    <span className={`font-mono ${TEXT_WHATSAPP}`}>{whatsappTag(newUser.phone) || '@91…'}</span>
                                </p>
                            </div>

                            <div>
                                <label className="mb-2 block text-[13px] font-medium text-foreground">Role</label>
                                <select
                                    value={newUser.role}
                                    onChange={e => {
                                        const role = e.target.value as Role;
                                        setNewUser({ ...newUser, role, canBeAssignedToShoots: role === 'CREW' });
                                    }}
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3 text-[14px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
                                >
                                    {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                                </select>
                            </div>

                            {isSuperAdmin && (
                                <div>
                                    <label className="mb-2 block text-[13px] font-medium text-foreground">Department</label>
                                    <select
                                        value={newUser.departmentId}
                                        onChange={e => setNewUser({ ...newUser, departmentId: e.target.value })}
                                        className="h-11 w-full rounded-xl border border-input bg-secondary px-3 text-[14px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="">No Department (Global)</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                                {[
                                    {
                                        key: 'canBeAssignedToShoots' as const,
                                        title: `Can be assigned to ${labels.workPluralLower}`,
                                        help: `Planners see them when staffing a ${labels.workLower}.`,
                                    },
                                    {
                                        key: 'canSelfEditProfile' as const,
                                        title: 'Can edit their own profile',
                                        help: 'Lets them fix their own name and number.',
                                    },
                                ].map(row => (
                                    <label key={row.key} className="flex cursor-pointer items-start gap-3 p-3">
                                        <input
                                            type="checkbox"
                                            checked={newUser[row.key]}
                                            onChange={e => setNewUser(prev => ({ ...prev, [row.key]: e.target.checked }))}
                                            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                                        />
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-medium text-foreground">{row.title}</p>
                                            <p className="mt-0.5 text-[11px] text-muted-foreground">{row.help}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                                <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
                                <Button type="submit" isLoading={isSubmitting}>Add {labels.teamSingular}</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* ── Change password ───────────────────────────────────────── */}
            {showPasswordModal && selectedUser && (
                <div className="modal-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
                    <Card className="w-full max-w-sm rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl">
                        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                            <h2 className="text-[17px] font-semibold text-foreground">Change Password</h2>
                            <button onClick={() => { setShowPasswordModal(false); setSelectedUser(null); }} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                            <UserAvatar name={selectedUser.name} role={selectedUser.role} avatarUrl={selectedUser.avatarUrl} size="sm" />
                            <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-foreground">{selectedUser.name}</p>
                                <p className="truncate text-[12px] text-muted-foreground">{selectedUser.email}</p>
                            </div>
                        </div>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-[13px] font-medium text-foreground">New Password</label>
                                    <button type="button" onClick={() => setNewPassword(randomPassword())} className="text-[12px] font-semibold text-primary hover:underline">
                                        Generate
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    required
                                    minLength={6}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="At least 6 characters"
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3.5 font-mono text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary"
                                />
                                <p className="mt-1.5 text-[11px] text-muted-foreground">Share it with them directly — nothing is emailed.</p>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => { setShowPasswordModal(false); setSelectedUser(null); setNewPassword(''); }}>Cancel</Button>
                                <Button type="submit" isLoading={isSubmitting}>Change Password</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* ── Merge duplicate ───────────────────────────────────────── */}
            {showMergeModal && (
                <div className="modal-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
                    <Card className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl">
                        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                            <h2 className="text-[17px] font-semibold text-foreground">Merge Duplicate</h2>
                            <button onClick={() => setShowMergeModal(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                            History from the duplicate account moves to the primary account, then the duplicate is deleted. This cannot be undone.
                        </p>
                        <form onSubmit={handleMergeUsers} className="space-y-4">
                            <div>
                                <label className="mb-2 block text-[13px] font-medium text-foreground">Duplicate Email (deleted)</label>
                                <input
                                    type="email"
                                    required
                                    value={mergeDuplicateEmail}
                                    onChange={e => setMergeDuplicateEmail(e.target.value)}
                                    placeholder="old@example.com"
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3.5 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[13px] font-medium text-foreground">Primary Email (kept)</label>
                                <input
                                    type="email"
                                    required
                                    value={mergePrimaryEmail}
                                    onChange={e => setMergePrimaryEmail(e.target.value)}
                                    placeholder="primary@example.com"
                                    className="h-11 w-full rounded-xl border border-input bg-secondary px-3.5 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div className="flex justify-end gap-2 border-t border-border pt-4">
                                <Button type="button" variant="ghost" onClick={() => { setShowMergeModal(false); setMergeDuplicateEmail(''); setMergePrimaryEmail(''); }}>Cancel</Button>
                                <Button type="submit" variant="danger" isLoading={isMerging}>Merge Data</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* ── Import CSV ────────────────────────────────────────────── */}
            {showBulkImportModal && (
                <div className="modal-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
                    <Card className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl">
                        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                            <h2 className="text-[17px] font-semibold text-foreground">Import CSV</h2>
                            <button onClick={() => setShowBulkImportModal(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border bg-secondary/30 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">First row must be</p>
                                <code className="mt-1.5 block overflow-x-auto whitespace-nowrap font-mono text-[12px] text-foreground">
                                    name,email,password,role,phone
                                </code>
                            </div>

                            {isSuperAdmin && (
                                <div>
                                    <label className="mb-2 block text-[13px] font-medium text-foreground">Add Everyone To</label>
                                    <select
                                        value={importDepartmentId}
                                        onChange={e => setImportDepartmentId(e.target.value)}
                                        className="h-11 w-full rounded-xl border border-input bg-secondary px-3 text-[14px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="">No Department (Global)</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <input
                                type="file"
                                accept=".csv"
                                onChange={e => setImportFile(e.target.files?.[0] || null)}
                                className="block w-full cursor-pointer text-[13px] text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-primary/10 file:px-4 file:py-2.5 file:text-[13px] file:font-semibold file:text-primary"
                            />

                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => setShowBulkImportModal(false)}>Cancel</Button>
                                <Button onClick={handleBulkImport} isLoading={isUploading} disabled={!importFile}>Import Users</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
