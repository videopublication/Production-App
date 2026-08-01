'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { User } from '@/types';
import { storage } from '@/lib/storage';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { useDepartment } from '@/lib/department-context';
import { getRoleLabel } from '@/lib/roles';

type StatusFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED';
type SortKey = 'name' | 'role' | 'status' | 'department';
type SortDir = 'asc' | 'desc';

export default function UserManagementPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { department } = useDepartment();
    const [users, setUsers] = useState<User[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        password: '',
        role: 'CREW',
        departmentId: '',
        canBeAssignedToShoots: true,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Bulk Import State
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importDepartmentId, setImportDepartmentId] = useState<string>('');
    const [isUploading, setIsUploading] = useState(false);

    // Merge State
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [mergeDuplicateEmail, setMergeDuplicateEmail] = useState('');
    const [mergePrimaryEmail, setMergePrimaryEmail] = useState('');
    const [isMerging, setIsMerging] = useState(false);

    // Search, Filter, Sort
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    // Lock for row actions
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.push('/dashboard');
            return;
        }
        if (user) {
            fetchUsers();
            if (user.role !== 'SUPER_ADMIN') {
                setNewUser(prev => ({ ...prev, departmentId: user.departmentId || '' }));
                setImportDepartmentId(user.departmentId || '');
            }
        }
    }, [user, router]);

    const fetchUsers = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // For regular Admins, only fetch their department's users from the server
            // For Super Admins, if a department is selected, filter by that. If not, fetch all.
            const filterDeptId = user?.role === 'SUPER_ADMIN' ? department?.id : user?.departmentId;
            let usersData = await storage.getUsers(filterDeptId);
            setUsers(usersData);
        } catch (error: any) {
            console.error('Error fetching users:', error);
            setError(error.message || 'Failed to fetch users');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDepartments = async () => {
        try {
            if (user?.role === 'SUPER_ADMIN') {
                const res = await fetch('/api/admin/departments');
                if (res.ok) {
                    const data = await res.json();
                    setDepartments(data);
                    return;
                }
            }
            // Try storage first
            const data = await storage.getDepartments();
            if (data && data.length > 0) {
                setDepartments(data);
            } else {
                // Fallback: use public API to get department names
                const res = await fetch('/api/departments');
                if (res.ok) {
                    const pubData = await res.json();
                    if (Array.isArray(pubData)) setDepartments(pubData);
                }
            }
        } catch (error) {
            console.error('Error fetching departments:', error);
            // Last resort fallback
            try {
                const res = await fetch('/api/departments');
                if (res.ok) {
                    const pubData = await res.json();
                    if (Array.isArray(pubData)) setDepartments(pubData);
                }
            } catch { }
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    // Department name helper
    const getDeptName = (deptId: string | null | undefined) => {
        if (!deptId) return 'Global';
        const dept = departments.find(d => d.id === deptId);
        return dept?.name || 'Unknown';
    };

    // Filtered and sorted users
    const filteredUsers = useMemo(() => {
        let result = [...users];

        // Department filter
        // Super Admins: filter by selected department context (if any)
        // Regular Admins: always filter by their own department and hide SUPER_ADMINs
        if (user?.role === 'SUPER_ADMIN') {
            if (department) {
                result = result.filter(u => u.departmentId === department.id);
            }
        } else if (user?.role === 'ADMIN' && user.departmentId) {
            // Regular Admin: only show non-super-admin users from their own department
            result = result.filter(u => u.departmentId === user.departmentId && u.role !== 'SUPER_ADMIN');
        } else {
            // Fallback for any other non-super-admin viewing the list
            result = result.filter(u => u.role !== 'SUPER_ADMIN');
        }

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(u =>
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                getRoleLabel(u.role).toLowerCase().includes(q) ||
                getDeptName(u.departmentId).toLowerCase().includes(q)
            );
        }

        // Status filter
        if (statusFilter !== 'ALL') {
            result = result.filter(u => u.status === statusFilter);
        }

        // Sort
        result.sort((a, b) => {
            let aVal = '';
            let bVal = '';
            switch (sortKey) {
                case 'name': aVal = a.name; bVal = b.name; break;
                case 'role': aVal = a.role; bVal = b.role; break;
                case 'status': aVal = a.status; bVal = b.status; break;
                case 'department': aVal = getDeptName(a.departmentId); bVal = getDeptName(b.departmentId); break;
            }
            const cmp = aVal.localeCompare(bVal);
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [users, search, statusFilter, sortKey, sortDir, department, departments, user]);

    // Status counts
    const statusCounts = useMemo(() => {
        let base = [...users];
        // Apply same department filtering as the main list
        if (user?.role === 'SUPER_ADMIN') {
            if (department) {
                base = base.filter(u => u.departmentId === department.id);
            }
        } else if (user?.role === 'ADMIN' && user.departmentId) {
            base = base.filter(u => u.departmentId === user.departmentId && u.role !== 'SUPER_ADMIN');
        } else {
            base = base.filter(u => u.role !== 'SUPER_ADMIN');
        }
        return {
            ALL: base.length,
            ACTIVE: base.filter(u => u.status === 'ACTIVE').length,
            PENDING: base.filter(u => u.status === 'PENDING').length,
            SUSPENDED: base.filter(u => u.status === 'SUSPENDED').length,
        };
    }, [users, department, user]);

    const canAssignToShoots = (targetUser: User) => targetUser.canBeAssignedToShoots ?? targetUser.role === 'CREW';

    const parseCsvBoolean = (value?: string) => {
        if (!value) return undefined;
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
        return undefined;
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => (
        <svg className={`w-3.5 h-3.5 ${active ? 'text-primary' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
    );

    // --- Action Handlers (unchanged logic) ---
    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const payload = { ...newUser, departmentId: newUser.departmentId || null };
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setShowAddModal(false);
                setNewUser({ name: '', email: '', password: '', role: 'CREW', departmentId: '', canBeAssignedToShoots: true });
                fetchUsers();
                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'CREATE',
                        entityId: newUser.email,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Created user "${newUser.name}" (Role: ${getRoleLabel(newUser.role)})`,
                        departmentId: user.departmentId
                    });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to create user', 'error');
            }
        } catch (error) {
            showToast('Failed to create user', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (userId: string, currentStatus: string) => {
        if (user && userId === user.id) { showToast("You cannot change your own status", "error"); return; }
        if (processingIds.has(userId)) return;
        setProcessingIds(prev => new Set(prev).add(userId));
        try {
            const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
            const label = currentStatus === 'ACTIVE' ? 'suspended' : 'activated';
            const res = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: userId, status: newStatus }) });
            if (res.ok) {
                fetchUsers();
                showToast(`User ${label} successfully`, 'success');
                const targetUser = users.find(u => u.id === userId);
                if (user && targetUser) {
                    await storage.addLog({ id: crypto.randomUUID(), action: 'EDIT', entityId: userId, userId: user.id, timestamp: new Date().toISOString(), details: `${label === 'activated' ? 'Activated' : 'Suspended'} user "${targetUser.name}"` });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to update user', 'error');
            }
        } catch { showToast('Failed to update user status', 'error'); }
        finally { setProcessingIds(prev => { const next = new Set(prev); next.delete(userId); return next; }); }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (user && userId === user.id) { showToast("You cannot change your own role", "error"); return; }
        if (processingIds.has(userId)) return;
        setProcessingIds(prev => new Set(prev).add(userId));
        try {
            const res = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: userId, role: newRole }) });
            if (res.ok) {
                fetchUsers();
                showToast(`Role updated to ${getRoleLabel(newRole)}`, 'success');
                const targetUser = users.find(u => u.id === userId);
                if (user && targetUser) {
                    await storage.addLog({ id: crypto.randomUUID(), action: 'EDIT', entityId: userId, userId: user.id, timestamp: new Date().toISOString(), details: `Changed role of user "${targetUser.name}" to ${getRoleLabel(newRole)}` });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to update role', 'error');
            }
        } catch { showToast('Failed to update role', 'error'); }
        finally { setProcessingIds(prev => { const next = new Set(prev); next.delete(userId); return next; }); }
    };

    const handlePrimaryApproverChange = async (userId: string, isApprover: boolean) => {
        if (processingIds.has(userId)) return;
        setProcessingIds(prev => new Set(prev).add(userId));
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, isPrimaryLeaveApprover: isApprover })
            });
            if (res.ok) {
                fetchUsers();
                showToast(`Primary leave approver updated`, 'success');
                const targetUser = users.find(u => u.id === userId);
                if (user && targetUser) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: userId,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Set user "${targetUser.name}" as ${isApprover ? 'primary' : 'non-primary'} leave approver`
                    });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to update leave approver status', 'error');
            }
        } catch { showToast('Failed to update leave approver status', 'error'); }
        finally { setProcessingIds(prev => { const next = new Set(prev); next.delete(userId); return next; }); }
    };

    const handleShootAssignmentEligibilityChange = async (userId: string, canBeAssignedToShoots: boolean) => {
        if (processingIds.has(userId)) return;
        setProcessingIds(prev => new Set(prev).add(userId));
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, canBeAssignedToShoots })
            });
            if (res.ok) {
                fetchUsers();
                showToast(canBeAssignedToShoots ? 'User can be assigned to shoots' : 'User hidden from shoot assignment lists', 'success');
                const targetUser = users.find(u => u.id === userId);
                if (user && targetUser) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: userId,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `${canBeAssignedToShoots ? 'Enabled' : 'Disabled'} shoot assignment eligibility for "${targetUser.name}"`
                    });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to update shoot assignment setting', 'error');
            }
        } catch { showToast('Failed to update shoot assignment setting', 'error'); }
        finally { setProcessingIds(prev => { const next = new Set(prev); next.delete(userId); return next; }); }
    };

    const handleDepartmentChange = async (userId: string, newDeptId: string) => {
        if (processingIds.has(userId)) return;
        setProcessingIds(prev => new Set(prev).add(userId));
        try {
            const res = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: userId, departmentId: newDeptId || null }) });
            if (res.ok) { fetchUsers(); showToast('Department updated', 'success'); }
            else { const error = await res.json(); showToast(error.error || 'Failed to update department', 'error'); }
        } catch { showToast('Failed to update department', 'error'); }
        finally { setProcessingIds(prev => { const next = new Set(prev); next.delete(userId); return next; }); }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || !newPassword || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedUser.id, password: newPassword }) });
            if (res.ok) {
                setShowPasswordModal(false); setNewPassword(''); showToast('Password changed successfully', 'success');
                if (user) { await storage.addLog({ id: crypto.randomUUID(), action: 'EDIT', entityId: selectedUser.id, userId: user.id, timestamp: new Date().toISOString(), details: `Changed password for user "${selectedUser.name}"` }); }
                setSelectedUser(null);
            } else { const error = await res.json(); showToast(error.error || 'Failed to change password', 'error'); }
        } catch { showToast('Failed to change password', 'error'); }
        finally { setIsSubmitting(false); }
    };

    const openPasswordModal = (u: User) => { setSelectedUser(u); setNewPassword(''); setShowPasswordModal(true); };

    const handleBulkImport = async () => {
        if (!importFile || isUploading) return;
        setIsUploading(true);
        try {
            const text = await importFile.text();
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            const headers = lines[0].toLowerCase().split(',');
            if (!headers.includes('email') || !headers.includes('password') || !headers.includes('name')) {
                showToast('CSV must contain name, email, and password columns', 'error'); setIsUploading(false); return;
            }
            let successCount = 0, failCount = 0;
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const rowData: Record<string, string> = {};
                headers.forEach((h, index) => { rowData[h] = values[index]?.replace(/^"|"$/g, '') || ''; });
                if (!rowData.email || !rowData.password || !rowData.name) { failCount++; continue; }
                const canBeAssignedToShoots = parseCsvBoolean(
                    rowData.can_be_assigned_to_shoots || rowData.canbeassignedtoshoots || rowData.assignable || rowData.planner
                );
                try {
                    const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: rowData.name, email: rowData.email, password: rowData.password, role: rowData.role?.toUpperCase() || 'CREW', phone: rowData.phone || undefined, departmentId: importDepartmentId || null, canBeAssignedToShoots }) });
                    if (res.ok) successCount++; else failCount++;
                } catch { failCount++; }
            }
            if (successCount > 0) {
                showToast(`Successfully imported ${successCount} users`, 'success');
                if (failCount > 0) showToast(`${failCount} users failed to import`, 'warning');
                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'CREATE',
                        entityId: 'bulk_import',
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Bulk imported ${successCount} users`,
                        departmentId: user.departmentId
                    });
                }
                fetchUsers(); setShowBulkImportModal(false); setImportFile(null);
            } else { showToast('No users were imported. Check CSV format.', 'error'); }
        } catch { showToast('Failed to process CSV file', 'error'); }
        finally { setIsUploading(false); }
    };

    const handleMergeUsers = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mergeDuplicateEmail || !mergePrimaryEmail || isMerging) return;
        
        if (mergeDuplicateEmail === mergePrimaryEmail) {
            showToast('Emails cannot be the same', 'error');
            return;
        }

        const confirmed = await confirm({
            title: 'Confirm Merge',
            message: `Are you absolutely sure you want to merge ${mergeDuplicateEmail} into ${mergePrimaryEmail}? This will move all data and CANNOT be undone.`,
            confirmLabel: 'Merge Data',
            variant: 'danger'
        });

        if (!confirmed) return;

        setIsMerging(true);
        try {
            const res = await fetch('/api/admin/users/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duplicateEmail: mergeDuplicateEmail.trim(),
                    primaryEmail: mergePrimaryEmail.trim()
                }),
            });

            if (res.ok) {
                showToast('Users merged successfully', 'success');
                setShowMergeModal(false);
                setMergeDuplicateEmail('');
                setMergePrimaryEmail('');
                fetchUsers();
                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: 'system',
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Merged duplicate user ${mergeDuplicateEmail} into ${mergePrimaryEmail}`,
                        departmentId: user.departmentId
                    });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to merge users', 'error');
            }
        } catch {
            showToast('Failed to merge users. Ensure you have run the merge_users.sql migration.', 'error');
        } finally {
            setIsMerging(false);
        }
    };

    // --- Role / Status badge helpers ---
    const roleBadge = (role: string) => {
        const styles: Record<string, string> = {
            SUPER_ADMIN: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
            ADMIN: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
            FINANCE_MANAGER: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
            MANAGER: 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary',
            CREW: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
        };
        const showGlobalMarker = user?.role === 'SUPER_ADMIN' && role === 'SUPER_ADMIN';

        return (
            <span className="inline-flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${styles[role] || styles.CREW}`}>
                    {getRoleLabel(role)}
                </span>
                {showGlobalMarker && (
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Global
                    </span>
                )}
            </span>
        );
    };

    const statusBadge = (status: string) => {
        const styles: Record<string, string> = {
            ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
            PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
            SUSPENDED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
        };
        const icons: Record<string, string> = { ACTIVE: '●', PENDING: '○', SUSPENDED: '●' };
        return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${styles[status] || ''}`}>{icons[status]} {status}</span>;
    };

    const avatarGradient = (role: string) => {
        const map: Record<string, string> = {
            SUPER_ADMIN: 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-500/30',
            ADMIN: 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-500/30',
            FINANCE_MANAGER: 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-500/30',
            MANAGER: 'bg-gradient-to-br from-primary to-primary shadow-primary/',
            CREW: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30',
        };
        return map[role] || map.CREW;
    };

    // --- Loading ---
    if (isLoading) return (
        <div className="max-w-[1400px] xl:max-w-[1600px] mx-auto p-8">
            <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-xl w-48" />
                <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-xl" />
                {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />)}
            </div>
        </div>
    );

    return (
        <div className="max-w-[1400px] xl:max-w-[1600px] mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        Team Members
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {filteredUsers.length} of {statusCounts.ALL} people
                        {department ? ` in ${department.name}` : ''}
                    </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setShowBulkImportModal(true)}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-[#1c1c1e] text-primary dark:text-primary font-semibold text-sm rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        Import CSV
                    </button>
                    {user?.role === 'SUPER_ADMIN' && (
                        <button
                            onClick={() => setShowMergeModal(true)}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-[#1c1c1e] text-red-600 dark:text-red-500 font-semibold text-sm rounded-xl shadow-sm border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            Merge Duplicate
                        </button>
                    )}
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-primary text-white font-semibold text-sm rounded-xl shadow-lg shadow-primary/ hover:bg-primary active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Member
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-red-600 dark:text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Search & Filters */}
            <div className="mb-4 space-y-3">
                {/* Search Bar */}
                <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by name, email, role, or department..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Status Filter Tabs */}
                <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl overflow-x-auto">
                    {(['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED'] as StatusFilter[]).map(status => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`flex-1 min-w-fit px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${statusFilter === status
                                ? status === 'ALL' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : status === 'ACTIVE' ? 'bg-green-500 text-white shadow-sm'
                                        : status === 'PENDING' ? 'bg-amber-500 text-white shadow-sm'
                                            : 'bg-red-500 text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            {status === 'ALL' ? `All (${statusCounts.ALL})` :
                                status === 'ACTIVE' ? `Active (${statusCounts.ACTIVE})` :
                                    status === 'PENDING' ? `Pending (${statusCounts.PENDING})` :
                                        `Suspended (${statusCounts.SUSPENDED})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* User List */}
            <PullToRefresh onRefresh={fetchUsers}>
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                    {/* Sort Header (desktop) */}
                    <div className="hidden lg:grid items-center gap-4 px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/30 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400" style={{ gridTemplateColumns: 'minmax(280px,1.45fr) 150px 120px minmax(150px,0.75fr) minmax(560px,1.25fr)' }}>
                        <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left" onClick={() => handleSort('name')}>
                            Name <SortIcon active={sortKey === 'name'} dir={sortKey === 'name' ? sortDir : 'asc'} />
                        </button>
                        <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left" onClick={() => handleSort('role')}>
                            Role <SortIcon active={sortKey === 'role'} dir={sortKey === 'role' ? sortDir : 'asc'} />
                        </button>
                        <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left" onClick={() => handleSort('status')}>
                            Status <SortIcon active={sortKey === 'status'} dir={sortKey === 'status' ? sortDir : 'asc'} />
                        </button>
                        <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left" onClick={() => handleSort('department')}>
                            Department <SortIcon active={sortKey === 'department'} dir={sortKey === 'department' ? sortDir : 'asc'} />
                        </button>
                        <div className="text-right pr-1">
                            Manage
                        </div>
                    </div>

                    {filteredUsers.length === 0 ? (
                        <div className="text-center py-16 px-6">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                </svg>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 font-medium">
                                {search ? `No results for "${search}"` : statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} users` : 'No team members yet'}
                            </p>
                            {search && <button onClick={() => setSearch('')} className="text-primary text-sm mt-2 hover:underline">Clear search</button>}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {filteredUsers.map((u) => (
                                <div
                                    key={u.id}
                                    className={`p-4 sm:px-5 sm:py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${processingIds.has(u.id) ? 'opacity-60 pointer-events-none' : ''}`}
                                >
                                    {/* Desktop Layout */}
                                    <div className="hidden lg:grid items-center gap-4" style={{ gridTemplateColumns: 'minmax(280px,1.45fr) 150px 120px minmax(150px,0.75fr) minmax(560px,1.25fr)' }}>
                                        {/* Name + Avatar */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-md ${avatarGradient(u.role)}`}>
                                                {u.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{u.name}</span>
                                                    {user?.id === u.id && <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[9px] font-bold rounded-full shrink-0">YOU</span>}
                                                </div>
                                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center min-w-0">{roleBadge(u.role)}</div>
                                        <div className="flex items-center min-w-0">{statusBadge(u.status)}</div>
                                        <div className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate">
                                            {getDeptName(u.departmentId)}
                                        </div>

                                        {/* Actions Row */}
                                        <div className="flex items-center justify-end gap-2 min-w-0">
                                            {user?.id !== u.id ? (
                                                <>
                                                    <select
                                                        className="h-9 w-[140px] min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-900 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    >
                                                        <option value="CREW">Crew</option>
                                                        <option value="MANAGER">Manager</option>
                                                        <option value="FINANCE_MANAGER">Finance Manager</option>
                                                        <option value="ADMIN">Admin</option>
                                                    </select>

                                                    {user?.role === 'SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' && (
                                                        <select
                                                            className="h-9 w-[170px] min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-900 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                            value={u.departmentId || ''}
                                                            onChange={(e) => handleDepartmentChange(u.id, e.target.value)}
                                                        >
                                                            <option value="">No Department</option>
                                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                        </select>
                                                    )}

                                                    <button
                                                        onClick={() => handleShootAssignmentEligibilityChange(u.id, !canAssignToShoots(u))}
                                                        className={`h-9 w-[112px] rounded-xl px-3 text-xs font-bold transition-all active:scale-95 ${canAssignToShoots(u)
                                                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                                            }`}
                                                        title={canAssignToShoots(u) ? 'Hide from shoot assignment lists' : 'Show in shoot assignment lists'}
                                                    >
                                                        {canAssignToShoots(u) ? 'Planner On' : 'Hidden'}
                                                    </button>

                                                    {['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(u.role) && (
                                                        <button
                                                            onClick={() => handlePrimaryApproverChange(u.id, !u.isPrimaryLeaveApprover)}
                                                            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${u.isPrimaryLeaveApprover ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-yellow-500 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
                                                            title={u.isPrimaryLeaveApprover ? "Remove Primary Approver" : "Make Primary Approver"}
                                                        >
                                                            <svg className="w-4 h-4" fill={u.isPrimaryLeaveApprover ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                                            </svg>
                                                        </button>
                                                    )}

                                                    <button onClick={() => openPasswordModal(u)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-white" title="Change Password">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                                        </svg>
                                                    </button>

                                                    <button
                                                        onClick={() => handleToggleStatus(u.id, u.status)}
                                                        className={`h-9 rounded-xl px-3 text-xs font-bold transition-all active:scale-95 ${u.status === 'ACTIVE'
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
                                                    <button onClick={() => openPasswordModal(u)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-white" title="Change Password">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Mobile Layout */}
                                    <div className="lg:hidden space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-md ${avatarGradient(u.role)}`}>
                                                {u.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="font-semibold text-[15px] text-gray-900 dark:text-white truncate">{u.name}</span>
                                                    {user?.id === u.id && <span className="px-1.5 py-0.5 bg-primary/10 dark:bg-primary/20 text-primary text-[9px] font-bold rounded-full shrink-0">YOU</span>}
                                                </div>
                                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    {roleBadge(u.role)}
                                                    {statusBadge(u.status)}
                                                    <span className="text-[10px] text-gray-400">{getDeptName(u.departmentId)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {user?.id !== u.id && (
                                            <div className="flex flex-col gap-2 mt-2">
                                                <div className="flex items-center gap-1.5">
                                                    <select
                                                        className="flex-1 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl px-3 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100"
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    >
                                                        <option value="CREW">Crew</option>
                                                        <option value="MANAGER">Manager</option>
                                                        <option value="FINANCE_MANAGER">Finance Manager</option>
                                                        <option value="ADMIN">Admin</option>
                                                    </select>

                                                    {user?.role === 'SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' && (
                                                        <select
                                                            className="flex-1 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl px-3 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100"
                                                            value={u.departmentId || ''}
                                                            onChange={(e) => handleDepartmentChange(u.id, e.target.value)}
                                                        >
                                                            <option value="">Global</option>
                                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                        </select>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => handleShootAssignmentEligibilityChange(u.id, !canAssignToShoots(u))}
                                                    className={`w-full rounded-xl px-3 py-2.5 text-xs font-bold transition-all active:scale-95 ${canAssignToShoots(u)
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                        }`}
                                                >
                                                    {canAssignToShoots(u) ? 'Can be assigned to shoots' : 'Hidden from shoot assignment lists'}
                                                </button>

                                                <div className="flex items-center gap-2">
                                                    {/* Primary Approver Toggle (Only for Admin/Manager) */}
                                                    {['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(u.role) && (
                                                        <button
                                                            onClick={() => handlePrimaryApproverChange(u.id, !u.isPrimaryLeaveApprover)}
                                                            className={`p-2.5 rounded-xl transition-colors flex-1 flex justify-center items-center ${u.isPrimaryLeaveApprover ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-yellow-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                                            title={u.isPrimaryLeaveApprover ? "Remove Primary Approver" : "Make Primary Approver"}
                                                        >
                                                            <svg className="w-4 h-4" fill={u.isPrimaryLeaveApprover ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                                            </svg>
                                                        </button>
                                                    )}

                                                    <button onClick={() => openPasswordModal(u)} className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-primary flex-1 flex justify-center items-center">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                                        </svg>
                                                    </button>

                                                    <button
                                                        onClick={() => handleToggleStatus(u.id, u.status)}
                                                        className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 flex-[2] text-center ${u.status === 'ACTIVE'
                                                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600'
                                                            : 'bg-green-50 dark:bg-green-900/20 text-green-600'
                                                            }`}
                                                    >
                                                        {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PullToRefresh>

            {/* Add User Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-overlay-in">
                    <Card className="w-full max-w-md p-6 m-4 dark:bg-[#1c1c1e]">
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Add New User</h2>
                        <form onSubmit={handleAddUser} className="space-y-4">
                            <Input label="Full Name" required value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
                            <Input label="Email" type="email" required value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                            <Input label="Password" type="password" required value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    value={newUser.role}
                                    onChange={e => {
                                        const role = e.target.value;
                                        setNewUser({ ...newUser, role, canBeAssignedToShoots: role === 'CREW' });
                                    }}
                                >
                                    <option value="CREW">Crew</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="FINANCE_MANAGER">Finance Manager</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
                                <input
                                    type="checkbox"
                                    checked={newUser.canBeAssignedToShoots}
                                    onChange={e => setNewUser({ ...newUser, canBeAssignedToShoots: e.target.checked })}
                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary dark:border-gray-600"
                                />
                                <span>
                                    <span className="block font-semibold text-gray-900 dark:text-white">Can be assigned to shoots</span>
                                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                                        Shows this person in planner crew lists and assignment dropdowns.
                                    </span>
                                </span>
                            </label>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                                {user?.role === 'SUPER_ADMIN' ? (
                                    <select className="flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={newUser.departmentId} onChange={e => setNewUser({ ...newUser, departmentId: e.target.value })}>
                                        <option value="">Select Department</option>
                                        {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                                    </select>
                                ) : (
                                    <div className="flex h-10 w-full items-center rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-white px-3 text-sm">
                                        {getDeptName(user?.departmentId)}
                                        <span className="ml-auto text-xs text-gray-400">Auto-assigned</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
                                <Button type="submit" isLoading={isSubmitting}>Create User</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* Merge Users Modal */}
            {showMergeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-overlay-in">
                    <Card className="w-full max-w-md p-6 m-4 dark:bg-[#1c1c1e]">
                        <div className="mb-4">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Merge Duplicate Account</h2>
                            <p className="text-sm text-gray-500 mt-1">Move all data from the duplicate account to the primary account, then delete the duplicate.</p>
                        </div>
                        <form onSubmit={handleMergeUsers} className="space-y-4">
                            <Input 
                                label="Duplicate Email (will be deleted)" 
                                type="email" 
                                required 
                                value={mergeDuplicateEmail} 
                                onChange={e => setMergeDuplicateEmail(e.target.value)} 
                                placeholder="old@example.com"
                            />
                            <div className="flex justify-center py-2">
                                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                                </svg>
                            </div>
                            <Input 
                                label="Primary Email (will be kept)" 
                                type="email" 
                                required 
                                value={mergePrimaryEmail} 
                                onChange={e => setMergePrimaryEmail(e.target.value)} 
                                placeholder="primary@example.com"
                            />
                            
                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <Button type="button" variant="ghost" onClick={() => {
                                    setShowMergeModal(false);
                                    setMergeDuplicateEmail('');
                                    setMergePrimaryEmail('');
                                }}>Cancel</Button>
                                <Button type="submit" variant="danger" isLoading={isMerging}>Merge Users</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* Change Password Modal */}
            {showPasswordModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-overlay-in">
                    <Card className="w-full max-w-md p-6 m-4 dark:bg-[#1c1c1e]">
                        <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Change Password</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            For: <span className="font-medium text-gray-900 dark:text-white">{selectedUser.name}</span> ({selectedUser.email})
                        </p>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <Input label="New Password" type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
                            <div className="flex justify-end gap-2 mt-6">
                                <Button type="button" variant="ghost" onClick={() => { setShowPasswordModal(false); setSelectedUser(null); setNewPassword(''); }}>Cancel</Button>
                                <Button type="submit" isLoading={isSubmitting}>Change Password</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* Bulk Import Modal */}
            {showBulkImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-overlay-in">
                    <Card className="w-full max-w-md p-6 m-4 dark:bg-[#1c1c1e]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bulk Import Users</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Upload a CSV file with user details</p>
                            </div>
                            <button onClick={() => setShowBulkImportModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-primary/10 dark:bg-primary/20 p-4 rounded-xl text-sm text-primary dark:text-primary border border-primary dark:border-primary">
                                <p className="font-semibold mb-1">CSV Format (last column optional):</p>
                                <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border block mt-1 text-xs">name,email,password,role,phone,can_be_assigned_to_shoots</code>
                            </div>
                            <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary cursor-pointer" />
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assign to Department</label>
                                {user?.role === 'SUPER_ADMIN' ? (
                                    <select className="flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm" value={importDepartmentId} onChange={e => setImportDepartmentId(e.target.value)}>
                                        <option value="">Select Department</option>
                                        {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                                    </select>
                                ) : (
                                    <div className="flex h-10 w-full items-center rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-white px-3 text-sm">
                                        {getDeptName(user?.departmentId)}
                                        <span className="ml-auto text-xs text-gray-400">Auto-assigned</span>
                                    </div>
                                )}
                                {user?.role !== 'SUPER_ADMIN' && (
                                    <p className="text-xs text-gray-500">All imported users will be added to your department.</p>
                                )}
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
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
