import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/Button';
import { User } from '@/types';
import { X, Search, ChevronDown, Check } from 'lucide-react';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';

interface AdminLeaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { userId: string; startDate: string; endDate: string; reason: string }) => Promise<void>;
    users: User[];
    prefilledUserId?: string;
    prefilledDate?: string;
}

function getInitials(name?: string | null, email?: string | null) {
    if (name) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return parts[0].slice(0, 2).toUpperCase();
    }
    return (email || '??').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
    'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
];
function avatarColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function AdminLeaveModal({ isOpen, onClose, onSubmit, users, prefilledUserId, prefilledDate }: AdminLeaveModalProps) {
    const { department } = useDepartment();
    const labels = getDepartmentLabels(department);
    const [userId, setUserId] = useState(prefilledUserId || '');
    const [startDate, setStartDate] = useState(prefilledDate || '');
    const [endDate, setEndDate] = useState(prefilledDate || '');
    const [reason, setReason] = useState('Emergency / Admin Recorded');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setUserId(prefilledUserId || '');
            setStartDate(prefilledDate || '');
            setEndDate(prefilledDate || '');
            setReason('Emergency / Admin Recorded');
            setIsDropdownOpen(false);
            setUserSearch('');
        }
    }, [isOpen, prefilledUserId, prefilledDate]);

    // Focus search when dropdown opens
    useEffect(() => {
        if (isDropdownOpen) {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
    }, [isDropdownOpen]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (!isOpen) return null;

    const selectedUser = users.find(u => u.id === userId);
    const filteredUsers = users
        .filter(u => (u.name || u.email || '').toLowerCase().includes(userSearch.toLowerCase()))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId || !startDate || !endDate || !reason) return;
        setIsSubmitting(true);
        try {
            await onSubmit({ userId, startDate, endDate, reason });
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-[#1c1c1e] w-full max-w-md rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Record Absence</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Searchable user picker */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{labels.teamSingular}</label>
                        <div className="relative" ref={dropdownRef}>
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen(v => !v)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                    isDropdownOpen
                                        ? 'border-primary ring-2 ring-primary/20'
                                        : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                                } bg-white dark:bg-gray-900`}
                            >
                                {selectedUser ? (
                                    <>
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(selectedUser.id)}`}>
                                            {getInitials(selectedUser.name, selectedUser.email)}
                                        </div>
                                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {selectedUser.name || selectedUser.email}
                                        </span>
                                    </>
                                ) : (
                                    <span className="flex-1 text-sm text-gray-400 dark:text-gray-500">Select a {labels.teamLower} member</span>
                                )}
                                <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden">
                                    {/* Search */}
                                    <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            <input
                                                ref={searchRef}
                                                type="text"
                                                value={userSearch}
                                                onChange={e => setUserSearch(e.target.value)}
                                                placeholder="Search by name..."
                                                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg border-none focus:ring-1 focus:ring-primary text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                                                onClick={e => e.stopPropagation()}
                                            />
                                        </div>
                                    </div>

                                    {/* User list */}
                                    <div className="max-h-52 overflow-y-auto py-1">
                                        {filteredUsers.length === 0 ? (
                                            <div className="px-4 py-3 text-sm text-center text-gray-400">No {labels.teamPluralLower} members found</div>
                                        ) : (
                                            filteredUsers.map(u => (
                                                <button
                                                    key={u.id}
                                                    type="button"
                                                    onClick={() => { setUserId(u.id); setIsDropdownOpen(false); setUserSearch(''); }}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                                                        userId === u.id
                                                            ? 'bg-primary/10 dark:bg-primary/20'
                                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                                    }`}
                                                >
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarColor(u.id)}`}>
                                                        {getInitials(u.name, u.email)}
                                                    </div>
                                                    <span className={`flex-1 text-left truncate ${userId === u.id ? 'text-primary font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                                                        {u.name || u.email}
                                                    </span>
                                                    {userId === u.id && <Check size={14} className="text-primary shrink-0" />}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Date range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Start Date</label>
                            <input
                                type="date"
                                required
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">End Date</label>
                            <input
                                type="date"
                                required
                                min={startDate}
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                            />
                        </div>
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reason / Note</label>
                        <textarea
                            required
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm resize-none"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                        <Button variant="primary" type="submit" disabled={isSubmitting || !userId}>
                            {isSubmitting ? 'Saving...' : 'Save Absence'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
