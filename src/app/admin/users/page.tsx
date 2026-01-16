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
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (user && userId === user.id) {
            showToast("You cannot change your own role", "error");
            return;
        }
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
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || !newPassword) return;

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

    if (isLoading) return <div className="p-8 text-center">Loading users...</div>;

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#1d1d1f]">
                        Team Members
                    </h1>
                    <p className="text-sm text-[#86868b] mt-1">{users.length} people in your organization</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-[#007aff] text-white font-semibold text-[15px] rounded-xl shadow-lg shadow-[#007aff]/20 hover:bg-[#0071e3] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Member
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl">
                    <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
            )}

            <PullToRefresh onRefresh={fetchUsers}>
                {/* User List - Apple Style */}
                <div className="bg-white rounded-2xl shadow-sm border border-[#e5e5ea] overflow-hidden">
                    {users.length === 0 ? (
                        <div className="text-center py-16 px-6">
                            <div className="w-16 h-16 bg-[#f5f5f7] rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                </svg>
                            </div>
                            <p className="text-[#86868b] font-medium">No team members yet</p>
                            <p className="text-[#86868b] text-sm mt-1">Add your first member to get started</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-[#e5e5ea]">
                            {users.map((u) => (
                                <div
                                    key={u.id}
                                    className="p-4 sm:p-5 hover:bg-[#f5f5f7]/50 transition-colors"
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
                                                <h3 className="font-semibold text-[17px] text-[#1d1d1f] truncate">{u.name}</h3>
                                                {user?.id === u.id && (
                                                    <span className="px-2 py-0.5 bg-[#007aff]/10 text-[#007aff] text-[10px] font-bold rounded-full">YOU</span>
                                                )}
                                            </div>
                                            <p className="text-[15px] text-[#86868b] truncate mb-1">{u.email}</p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {/* Role Badge */}
                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                                                        u.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                                {/* Status Badge */}
                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                                                        u.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-red-100 text-red-700'
                                                    }`}>
                                                    {u.status === 'ACTIVE' ? '● Active' : u.status === 'PENDING' ? '○ Pending' : '● Suspended'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions - Desktop */}
                                        <div className="hidden sm:flex items-center gap-2 shrink-0">
                                            <select
                                                className={`bg-[#f5f5f7] border-0 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer focus:ring-2 focus:ring-[#007aff] ${u.role === 'ADMIN' ? 'text-purple-600' :
                                                        u.role === 'MANAGER' ? 'text-blue-600' :
                                                            'text-emerald-600'
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
                                                className="p-2.5 rounded-xl bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#e8e8ed] transition-colors"
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
                                        <svg className="w-5 h-5 text-[#c7c7cc] sm:hidden shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                        </svg>
                                    </div>

                                    {/* Mobile Actions */}
                                    <div className="sm:hidden mt-4 pt-4 border-t border-[#f2f2f7] flex gap-2">
                                        <select
                                            className={`flex-1 bg-[#f5f5f7] border-0 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-[#007aff] ${u.role === 'ADMIN' ? 'text-purple-600' :
                                                    u.role === 'MANAGER' ? 'text-blue-600' :
                                                        'text-emerald-600'
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
                                            className="p-3 rounded-xl bg-[#f5f5f7] text-[#007aff]"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                            </svg>
                                        </button>
                                        {user?.id !== u.id && (
                                            <button
                                                onClick={() => handleToggleStatus(u.id, u.status)}
                                                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all active:scale-95 ${u.status === 'ACTIVE'
                                                        ? 'bg-red-50 text-red-600'
                                                        : 'bg-green-50 text-green-600'
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
                    <Card className="w-full max-w-md p-6 m-4">
                        <h2 className="text-xl font-bold mb-4">Add New User</h2>
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
                                <label className="text-sm font-medium text-muted-foreground">Role</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                    <Card className="w-full max-w-md p-6 m-4">
                        <h2 className="text-xl font-bold mb-2">Change Password</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                            Changing password for: <span className="font-medium text-foreground">{selectedUser.name}</span> ({selectedUser.email})
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
        </div>
    );
}

