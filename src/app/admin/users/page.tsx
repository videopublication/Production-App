'use client';

import React, { useState, useEffect } from 'react';
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

export default function UserManagementPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'CREW' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Bulk Import State
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Lock for row actions
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (user && user.role !== 'ADMIN') {
            router.push('/dashboard');
            return;
        }
        if (user) {
            fetchUsers();
        }
    }, [user, router]);

    const fetchUsers = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Use storage service directly instead of API route
            const usersData = await storage.getUsers();
            setUsers(usersData.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error: any) {
            console.error('Error fetching users:', error);
            setError(error.message || 'Failed to fetch users');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
            });

            if (res.ok) {
                setShowAddModal(false);
                setNewUser({ name: '', email: '', password: '', role: 'CREW' });
                fetchUsers();

                // Log creation
                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'CREATE',
                        entityId: newUser.email, // Use email as identifier for new user
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Created user "${newUser.name}" (Role: ${newUser.role})`
                    });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to create user', 'error');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            showToast('Failed to create user', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (userId: string, currentStatus: string) => {
        if (user && userId === user.id) {
            showToast("You cannot change your own status", "error");
            return;
        }
        if (processingIds.has(userId)) return;

        setProcessingIds(prev => new Set(prev).add(userId));
        try {
            // Determine new status: 
            // If currently ACTIVE, suspend them.
            // If PENDING or SUSPENDED, activate them.
            const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
            const label = currentStatus === 'ACTIVE' ? 'suspended' : 'activated';

            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, status: newStatus }),
            });
            if (res.ok) {
                fetchUsers();
                showToast(`User ${label} successfully`, 'success');

                const targetUser = users.find(u => u.id === userId);
                if (user && targetUser) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: userId,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `${label === 'activated' ? 'Activated' : 'Suspended'} user "${targetUser.name}"`
                    });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to update user', 'error');
            }
        } catch (error) {
            console.error('Error updating user:', error);
            showToast('Failed to update user status', 'error');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (user && userId === user.id) {
            showToast("You cannot change your own role", "error");
            return;
        }
        if (processingIds.has(userId)) return;

        setProcessingIds(prev => new Set(prev).add(userId));
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, role: newRole }),
            });
            if (res.ok) {
                fetchUsers();
                showToast(`Role updated to ${newRole}`, 'success');

                const targetUser = users.find(u => u.id === userId);
                if (user && targetUser) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: userId,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Changed role of user "${targetUser.name}" to ${newRole}`
                    });
                }
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to update role', 'error');
            }
        } catch (error) {
            console.error('Error updating role:', error);
            showToast('Failed to update role', 'error');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || !newPassword || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedUser.id, password: newPassword }),
            });

            if (res.ok) {
                setShowPasswordModal(false);
                setNewPassword('');
                showToast('Password changed successfully', 'success');

                // Log password change
                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: selectedUser.id,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Changed password for user "${selectedUser.name}"`
                    });
                }

                setSelectedUser(null);
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to change password', 'error');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            showToast('Failed to change password', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openPasswordModal = (u: User) => {
        setSelectedUser(u);
        setNewPassword('');
        setShowPasswordModal(true);
    };

    const handleBulkImport = async () => {
        if (!importFile || isUploading) return;

        setIsUploading(true);
        try {
            const text = await importFile.text();
            // Basic CSV parsing (handles quotes and commas roughly, better use a library for robust parsing)
            // But for simple name,email,password,role it's okay.
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            const headers = lines[0].toLowerCase().split(',');

            // Validate headers roughly
            if (!headers.includes('email') || !headers.includes('password') || !headers.includes('name')) {
                showToast('CSV must contain name, email, and password columns', 'error');
                setIsUploading(false);
                return;
            }

            let successCount = 0;
            let failCount = 0;

            // Process line by line starting from index 1 (skip header)
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                // Handle splitting by comma but respecting quotes if simple implementation isn't enough, we assume simple CSV for now
                // Format: name,email,password,role,phone
                const values = line.split(',').map(v => v.trim());

                // Simple mapping based on expected order or header mapping could be done
                // Let's assume order: name,email,password,role,phone as per UI instruction
                // Or map by index if we want to be smarter
                const rowData: Record<string, string> = {};
                headers.forEach((h, index) => {
                    rowData[h] = values[index]?.replace(/^"|"$/g, '') || '';
                });

                if (!rowData.email || !rowData.password || !rowData.name) {
                    console.warn(`Skipping line ${i + 1}: Missing required fields`);
                    failCount++;
                    continue;
                }

                // Prepare user object
                const userPayload = {
                    name: rowData.name,
                    email: rowData.email,
                    password: rowData.password,
                    role: (rowData.role?.toUpperCase() || 'CREW'),
                    phone: rowData.phone || undefined
                };

                // Create User via API
                try {
                    const res = await fetch('/api/admin/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(userPayload),
                    });

                    if (res.ok) {
                        successCount++;
                    } else {
                        console.error(`Failed to create ${userPayload.email}`);
                        failCount++;
                    }
                } catch (err) {
                    console.error(err);
                    failCount++;
                }
            }

            if (successCount > 0) {
                showToast(`Successfully imported ${successCount} users`, 'success');
                if (failCount > 0) {
                    showToast(`${failCount} users failed to import`, 'warning');
                }

                // Log Bulk Import
                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'CREATE',
                        entityId: 'bulk_import',
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Bulk imported ${successCount} users`
                    });
                }

                fetchUsers();
                setShowBulkImportModal(false);
                setImportFile(null);
            } else {
                showToast('No users were imported. Check CSV format.', 'error');
            }

        } catch (error) {
            console.error('CSV Processing Error:', error);
            showToast('Failed to process CSV file', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center">Loading users...</div>;

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        Team Members
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{users.length} people in your organization</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => setShowBulkImportModal(true)}
                        className="flex-1 sm:flex-none px-5 py-2.5 bg-white dark:bg-[#1c1c1e] text-blue-600 dark:text-blue-400 font-semibold text-[15px] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <span className="whitespace-nowrap">Import CSV</span>
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-600 text-white font-semibold text-[15px] rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="whitespace-nowrap">Add Member</span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
                    <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
            )}

            <PullToRefresh onRefresh={fetchUsers}>
                {/* User List - Apple Style */}
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                    {users.length === 0 ? (
                        <div className="text-center py-16 px-6">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                </svg>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 font-medium">No team members yet</p>
                            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Add your first member to get started</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-800">
                            {users.map((u) => (
                                <div
                                    key={u.id}
                                    className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        {/* Avatar */}
                                        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white font-semibold text-lg sm:text-xl shrink-0 shadow-lg ${u.role === 'ADMIN' ? 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-500/30' :
                                            u.role === 'MANAGER' ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/30' :
                                                'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30'
                                            }`}>
                                            {u.name.charAt(0).toUpperCase()}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <h3 className="font-semibold text-[17px] text-gray-900 dark:text-white truncate">{u.name}</h3>
                                                {user?.id === u.id && (
                                                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-full">YOU</span>
                                                )}
                                            </div>
                                            <p className="text-[15px] text-gray-500 dark:text-gray-400 truncate mb-1">{u.email}</p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {/* Role Badge */}
                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${u.role === 'ADMIN' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                                                    u.role === 'MANAGER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                                        'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                                {/* Status Badge */}
                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${u.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                                    u.status === 'PENDING' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                                                        'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                    }`}>
                                                    {u.status === 'ACTIVE' ? '● Active' : u.status === 'PENDING' ? '○ Pending' : '● Suspended'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions - Desktop */}
                                        <div className="hidden sm:flex items-center gap-2 shrink-0">
                                            <select
                                                className={`bg-gray-100 dark:bg-gray-800 border-0 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer focus:ring-2 focus:ring-blue-500 ${u.role === 'ADMIN' ? 'text-purple-600 dark:text-purple-400' :
                                                    u.role === 'MANAGER' ? 'text-blue-600 dark:text-blue-400' :
                                                        'text-emerald-600 dark:text-emerald-400'
                                                    }`}
                                                value={u.role}
                                                disabled={user?.id === u.id}
                                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                            >
                                                <option value="CREW">Crew</option>
                                                <option value="MANAGER">Manager</option>
                                                <option value="ADMIN">Admin</option>
                                            </select>
                                            <button
                                                onClick={() => openPasswordModal(u)}
                                                className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                title="Change Password"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                                </svg>
                                            </button>
                                            {user?.id !== u.id && (
                                                <button
                                                    onClick={() => handleToggleStatus(u.id, u.status)}
                                                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${u.status === 'ACTIVE'
                                                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                                        : 'bg-green-50 text-green-600 hover:bg-green-100'
                                                        }`}
                                                >
                                                    {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                                </button>
                                            )}
                                        </div>

                                        {/* Mobile Menu Arrow */}
                                        <svg className="w-5 h-5 text-gray-300 dark:text-gray-600 sm:hidden shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                        </svg>
                                    </div>

                                    {/* Mobile Actions */}
                                    <div className="sm:hidden mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                                        <select
                                            className={`flex-1 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 ${u.role === 'ADMIN' ? 'text-purple-600 dark:text-purple-400' :
                                                u.role === 'MANAGER' ? 'text-blue-600 dark:text-blue-400' :
                                                    'text-emerald-600 dark:text-emerald-400'
                                                }`}
                                            value={u.role}
                                            disabled={user?.id === u.id}
                                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                        >
                                            <option value="CREW">Crew</option>
                                            <option value="MANAGER">Manager</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                        <button
                                            onClick={() => openPasswordModal(u)}
                                            className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                            </svg>
                                        </button>
                                        {user?.id !== u.id && (
                                            <button
                                                onClick={() => handleToggleStatus(u.id, u.status)}
                                                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all active:scale-95 ${u.status === 'ACTIVE'
                                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                                    : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                                                    }`}
                                            >
                                                {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                            </button>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                    <Card className="w-full max-w-md p-6 m-4 dark:bg-[#1c1c1e]">
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Add New User</h2>
                        <form onSubmit={handleAddUser} className="space-y-4">
                            <Input
                                label="Full Name"
                                required
                                value={newUser.name}
                                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                            />
                            <Input
                                label="Email"
                                type="email"
                                required
                                value={newUser.email}
                                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                            />
                            <Input
                                label="Password"
                                type="password"
                                required
                                value={newUser.password}
                                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                            />
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newUser.role}
                                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                >
                                    <option value="CREW">Crew</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" isLoading={isSubmitting}>
                                    Create User
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* Change Password Modal */}
            {showPasswordModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                    <Card className="w-full max-w-md p-6 m-4 dark:bg-[#1c1c1e]">
                        <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Change Password</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Changing password for: <span className="font-medium text-gray-900 dark:text-white">{selectedUser.name}</span> ({selectedUser.email})
                        </p>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <Input
                                label="New Password"
                                type="password"
                                required
                                minLength={6}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Enter new password (min 6 characters)"
                            />
                            <div className="flex justify-end gap-2 mt-6">
                                <Button type="button" variant="ghost" onClick={() => {
                                    setShowPasswordModal(false);
                                    setSelectedUser(null);
                                    setNewPassword('');
                                }}>
                                    Cancel
                                </Button>
                                <Button type="submit" isLoading={isSubmitting}>
                                    Change Password
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
            {/* Bulk Import Modal */}
            {showBulkImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                    <Card className="w-full max-w-md p-6 m-4 dark:bg-[#1c1c1e]">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bulk Import Users</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Upload a CSV file with user details</p>
                            </div>
                            <button onClick={() => setShowBulkImportModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                <div className="flex justify-between items-start">
                                    <p className="font-semibold mb-1">CSV Format Required:</p>
                                    <button
                                        onClick={() => {
                                            const csvContent = "name,email,password,role,phone\nJohn Doe,john@example.com,pass123,CREW,9876543210\nJane Manager,jane@example.com,secure456,MANAGER,";
                                            const blob = new Blob([csvContent], { type: 'text/csv' });
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'users_template.csv';
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            window.URL.revokeObjectURL(url);
                                        }}
                                        className="text-blue-600 dark:text-blue-400 underline text-xs font-semibold hover:text-blue-800 dark:hover:text-blue-300"
                                    >
                                        Download Sample
                                    </button>
                                </div>
                                <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border border-blue-200 dark:border-blue-800 block mt-2 overflow-x-auto whitespace-nowrap text-gray-800 dark:text-gray-200">
                                    name,email,password,role,phone
                                </code>
                                <p className="mt-2 text-xs opacity-80">
                                    * Role can be: CREW, MANAGER, ADMIN (Default: CREW)<br />
                                    * Phone is optional
                                </p>
                            </div>

                            <label className="block w-full">
                                <span className="sr-only">Choose file</span>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                    className="block w-full text-sm text-gray-500 dark:text-gray-400
                                    file:mr-4 file:py-2.5 file:px-4
                                    file:rounded-xl file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-blue-50 dark:file:bg-blue-900/20 file:text-blue-700 dark:file:text-blue-400
                                    hover:file:bg-blue-100 dark:hover:file:bg-blue-800/40
                                    transition-all cursor-pointer"
                                />
                            </label>

                            <div className="flex justify-end gap-2 mt-6">
                                <Button type="button" variant="ghost" onClick={() => setShowBulkImportModal(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleBulkImport}
                                    isLoading={isUploading}
                                    disabled={!importFile}
                                >
                                    Import Users
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

