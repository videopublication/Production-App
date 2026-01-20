'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { Shoot, User, Assignment, Log } from '@/types';
import { formatWhatsAppMessage, openWhatsApp } from '@/lib/whatsapp';
import { isSameDay } from 'date-fns';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { ArrowLeft, Edit, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useConfirm } from '@/lib/dialog-context';

export default function ShootDetailsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const params = useParams();
    const confirm = useConfirm();
    const id = params?.id as string;

    const [shoot, setShoot] = useState<Shoot | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            loadData();
        }
    }, [id]);

    const loadData = async () => {
        try {
            const [allShoots, allAssignments, allUsers, shootLogs] = await Promise.all([
                storage.getShoots(),
                storage.getAssignments(),
                storage.getUsers(),
                storage.getLogsByEntity(id)
            ]);

            const foundShoot = allShoots.find(s => s.id === id);
            if (foundShoot) {
                setShoot(foundShoot);
                setAssignments(allAssignments.filter(a => a.shootId === id));
                setUsers(allUsers);
                setLogs(shootLogs);
            } else {
                router.push('/admin/shoots');
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelShoot = async () => {
        if (!shoot) return;

        const isConfirmed = await confirm({
            title: 'Cancel Shoot?',
            message: 'Are you sure you want to cancel this shoot? This action cannot be undone.',
            confirmLabel: 'Yes, Cancel',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        try {
            const updatedShoot: Shoot = { ...shoot, status: 'CANCELLED' };
            await storage.saveShoot(updatedShoot);

            // Log cancellation
            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: 'Cancelled shoot'
                });
            }

            // Reload data to reflect changes
            await loadData();
        } catch (error) {
            console.error('Failed to cancel shoot:', error);
        }
    };

    const getUserName = (userId?: string) => {
        if (!userId) return 'System';
        return users.find(u => u.id === userId)?.name || 'Unknown';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading shoot details...</p>
                </div>
            </div>
        );
    }

    if (!shoot) return null;

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12 p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                    <Link href="/admin/shoots">
                        <button
                            className="h-10 w-10 rounded-full flex items-center justify-center bg-white border border-gray-300 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-all"
                            style={{ color: '#1f2937' }}
                        >
                            <ArrowLeft size={20} strokeWidth={2.5} />
                        </button>
                    </Link>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#1d1d1f]">
                                {shoot.title}
                            </h1>
                            <Badge variant={shoot.status === 'CONFIRMED' ? 'success' : shoot.status === 'CANCELLED' ? 'destructive' : 'warning'}
                                className="px-2.5 py-0.5 text-xs font-bold tracking-wide">
                                {shoot.status}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Added by <span className="font-medium text-foreground">{shoot.createdBy || 'Admin'}</span>
                        </p>
                    </div>
                </div>


                <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0">
                    <button
                        onClick={() => {
                            const message = formatWhatsAppMessage(shoot, assignments, users);
                            openWhatsApp(message);
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all shadow-sm hover:shadow-md active:scale-95 bg-[#25D366] hover:bg-[#128C7E] text-white text-sm sm:text-base border border-transparent"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="shrink-0">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                        WhatsApp
                    </button>

                    <button
                        onClick={async () => {
                            const message = formatWhatsAppMessage(shoot, assignments, users);
                            try {
                                await navigator.clipboard.writeText(message);
                                const toast = document.createElement('div');
                                toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm font-medium z-50 animate-in fade-in slide-in-from-bottom-2';
                                toast.textContent = 'Copied to clipboard';
                                document.body.appendChild(toast);
                                setTimeout(() => toast.remove(), 2000);
                            } catch (err) {
                                console.error('Failed to copy', err);
                            }
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all shadow-sm hover:shadow-md active:scale-95 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm sm:text-base"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                    </button>

                    <Link href={`/admin/shoots/${id}/edit`} className="w-full sm:w-auto">
                        <Button variant="outline" className="w-full gap-2 bg-white hover:bg-gray-50 h-[42px] rounded-xl font-semibold border-gray-200">
                            <Edit size={16} /> Edit
                        </Button>
                    </Link>

                    {shoot.status !== 'CANCELLED' && (
                        <Button variant="danger" onClick={handleCancelShoot} className="w-full sm:w-auto gap-2 h-[42px] rounded-xl font-semibold">
                            <XCircle size={16} /> Cancel
                        </Button>
                    )}
                </div>
            </div>

            {/* Quick Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-5 flex flex-col justify-center min-h-[100px] border-l-4 border-l-blue-500 shadow-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-3 opacity-100">
                        <svg className="w-16 h-16 text-blue-100 dark:text-blue-900/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Date & Time</p>
                    <p className="font-semibold text-lg text-foreground">
                        {(() => {
                            if (!shoot.startTime) return 'Not Set';
                            const startDate = parseISO(shoot.startTime);
                            const endDate = shoot.endTime ? parseISO(shoot.endTime) : null;
                            if (endDate && !isSameDay(startDate, endDate)) {
                                return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
                            }
                            return format(startDate, 'MMM d, yyyy');
                        })()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {(() => {
                            if (!shoot.startTime) return 'Time not set';
                            const start = format(parseISO(shoot.startTime), 'h:mm a');
                            const end = shoot.endTime ? format(parseISO(shoot.endTime), 'h:mm a') : '';
                            return end ? `${start} - ${end}` : start;
                        })()}
                    </p>
                </Card>

                <Card className="p-5 flex flex-col justify-center min-h-[100px] border-l-4 border-l-purple-500 shadow-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-3 opacity-100">
                        <svg className="w-16 h-16 text-purple-100 dark:text-purple-900/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Location</p>
                    <p className="font-semibold text-lg text-foreground truncate" title={shoot.location}>{shoot.location || 'No Location'}</p>
                    <p className="text-sm text-muted-foreground">Site / Venue</p>
                </Card>

                <Card className="p-5 flex flex-col justify-center min-h-[100px] border-l-4 border-l-green-500 shadow-sm relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-3 opacity-100">
                        <svg className="w-16 h-16 text-green-100 dark:text-green-900/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Point of Contact</p>
                    <p className="font-semibold text-lg text-foreground truncate">{shoot.pocName || 'No POC'}</p>
                    <p className="text-sm text-muted-foreground truncate">{shoot.pocContact || 'No contact info'}</p>
                </Card>
            </div>

            {/* Description (if exists) */}
            {
                shoot.description && (
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }} className="rounded-xl p-5 shadow-sm">
                        <h3 className="text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: '#111827' }}>
                            <svg className="w-4 h-4" style={{ color: '#4b5563' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            About this Shoot
                        </h3>
                        <p className="leading-relaxed max-w-4xl text-[15px]" style={{ color: '#1f2937' }}>
                            {shoot.description}
                        </p>
                    </div>
                )
            }

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Crew List - Main Content */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between px-1 mb-4">
                        <h2 style={{ color: '#111827' }} className="text-lg font-bold">Crew Assignments</h2>
                        <span style={{ backgroundColor: '#f3f4f6', color: '#374151' }} className="px-3 py-1 rounded-full text-sm font-semibold">{assignments.length} Members</span>
                    </div>

                    <div className="space-y-3">
                        {assignments.length === 0 ? (
                            <div style={{ backgroundColor: '#f9fafb', border: '2px dashed #d1d5db' }} className="text-center py-12 rounded-2xl">
                                <div style={{ backgroundColor: '#e5e7eb' }} className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <svg style={{ color: '#6b7280' }} className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <p style={{ color: '#374151' }} className="font-medium">No crew assigned yet</p>
                                <p style={{ color: '#6b7280' }} className="text-sm mb-4">Add members to organize this shoot</p>
                                <Link href={`/admin/shoots/${id}/edit`}>
                                    <Button size="sm">Add Crew Member</Button>
                                </Link>
                            </div>
                        ) : (
                            assignments.map((assignment) => {
                                const assignedUser = users.find(u => u.id === assignment.userId);
                                if (!assignedUser) return null;
                                const isIncharge = assignment.role === 'Incharge';

                                // Role-based colors
                                const roleColors: Record<string, { bg: string; text: string; border: string }> = {
                                    'ADMIN': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
                                    'MANAGER': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
                                    'CREW': { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
                                };
                                const roleStyle = isIncharge
                                    ? { bg: '#c7d2fe', text: '#3730a3', border: '#a5b4fc' }
                                    : (roleColors[assignedUser.role] || roleColors['CREW']);

                                return (
                                    <div
                                        key={assignment.id}
                                        style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                                        className="flex items-center justify-between p-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <div
                                                    style={{
                                                        background: isIncharge ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : '#e5e7eb',
                                                        color: isIncharge ? '#ffffff' : '#374151'
                                                    }}
                                                    className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm"
                                                >
                                                    {assignedUser.name.charAt(0)}
                                                </div>
                                                {isIncharge && (
                                                    <div
                                                        style={{ backgroundColor: '#facc15', color: '#713f12', border: '2px solid #ffffff' }}
                                                        className="absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm"
                                                    >
                                                        LEAD
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <h4 style={{ color: '#111827' }} className="font-bold text-[15px]">{assignedUser.name}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span
                                                        style={{
                                                            backgroundColor: roleStyle.bg,
                                                            color: roleStyle.text,
                                                            border: `1px solid ${roleStyle.border}`
                                                        }}
                                                        className="text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wide"
                                                    >
                                                        {isIncharge ? 'Shoot Incharge' : assignedUser.role.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Sidebar - Activity Log */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-[#1d1d1f] px-1">Recent Activity</h2>
                    <Card className="p-0 overflow-hidden border border-border bg-gray-50/50 dark:bg-gray-900/20">
                        <div className="max-h-[500px] overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
                            {logs.length === 0 ? (
                                <p className="text-gray-500 italic text-sm text-center py-4">No activity yet</p>
                            ) : (
                                logs.map((log, index) => (
                                    <div key={log.id} className="relative pl-6 pb-2 last:pb-0">
                                        {index !== logs.length - 1 && (
                                            <div className="absolute left-[9px] top-6 bottom-[-24px] w-0.5 bg-gray-200 dark:bg-gray-800"></div>
                                        )}
                                        <div className="absolute left-0 top-1.5 w-[19px] h-[19px] rounded-full bg-white dark:bg-gray-900 border-4 border-gray-200 dark:border-gray-700 z-10"></div>

                                        <div>
                                            <p className="text-sm font-medium text-foreground">
                                                {getUserName(log.userId)}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                                {log.details}
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide font-medium">
                                                {format(parseISO(log.timestamp), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div >
    );
}
