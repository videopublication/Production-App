'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { Shoot, User, Assignment, Log } from '@/types';
import { formatWhatsAppMessage, openWhatsApp } from '@/lib/whatsapp';
import { isSameDay } from 'date-fns';
import { Button } from '@/components/Button';
import { APP_CONFIG } from '@/lib/config';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { ArrowLeft, Edit, XCircle, Plus, Trash2, IndianRupee, Receipt, Home, Plane, Video, Users, MoreHorizontal } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useConfirm } from '@/lib/dialog-context';
import { useToast } from '@/lib/toast-context';

import { useShoot, useSaveShoot } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';
import { useTransactions } from '@/hooks/useTransactions';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getGoogleProviderToken, deleteGoogleCalendarEvent, createGoogleCalendarEvent } from '@/lib/google-calendar';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function ShootDetailsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { showToast } = useToast();
    const params = useParams();
    const confirm = useConfirm();
    const id = params?.id as string;
    const queryClient = useQueryClient();

    // React Query Hooks
    const { data: shoot, isLoading: shootLoading } = useShoot(id);
    const { data: allAssignments = [], isLoading: assignmentsLoading } = useAssignments();
    const { data: users = [], isLoading: usersLoading } = useUsers();
    const { data: allTransactions = [], isLoading: transactionsLoading } = useTransactions();

    const [logs, setLogs] = useState<Log[]>([]);
    const { mutateAsync: saveShoot } = useSaveShoot();

    const loading = shootLoading || assignmentsLoading || usersLoading;
    const [isSyncing, setIsSyncing] = useState(false);
    
    const FIXED_EXPENSE_TYPES = ['Boarding', 'Travel', 'Equipment', 'Manpower', 'Other'] as const;
    const [expenseAmounts, setExpenseAmounts] = useState<Record<string, string>>({});
    const [isSavingExpense, setIsSavingExpense] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<string>('');

    // Initialize selected campaign from existing expenses if any
    useEffect(() => {
        if (shoot?.expenses && shoot.expenses.length > 0 && !selectedCampaign) {
            const existingCampaign = shoot.expenses.find(e => e.campaign)?.campaign;
            if (existingCampaign) {
                setSelectedCampaign(existingCampaign);
            }
        }
    }, [shoot?.expenses]);

    // Initialize amounts from shoot expenses
    useEffect(() => {
        if (shoot?.expenses) {
            const amounts: Record<string, string> = {};
            FIXED_EXPENSE_TYPES.forEach(type => {
                const existing = shoot.expenses!.find(e => e.type === type);
                amounts[type] = existing && existing.amount !== 0 ? String(existing.amount) : '';
            });
            setExpenseAmounts(amounts);
        } else {
            const amounts: Record<string, string> = {};
            FIXED_EXPENSE_TYPES.forEach(type => amounts[type] = '');
            setExpenseAmounts(amounts);
        }
    }, [shoot?.expenses]);

    // Derived State
    const assignments = shoot ? allAssignments.filter(a => a.shootId === shoot.id) : [];
    const linkedTransactions = shoot ? allTransactions.filter(t => t.shootId === shoot.id) : [];

    useEffect(() => {
        if (shoot?.id) {
            storage.getLogsByEntity(shoot.id).then(setLogs);
        }
    }, [shoot?.id]);

    const handleSaveFixedExpenses = async () => {
        if (!shoot) return;

        // Check if anything actually changed before making API calls
        const hasChanges = FIXED_EXPENSE_TYPES.some(type => {
            const existing = shoot.expenses?.find(e => e.type === type);
            const oldVal = existing?.amount || 0;
            const newVal = Number(expenseAmounts[type]) || 0;
            const oldCampaign = existing?.campaign || '';
            const newCampaign = selectedCampaign || '';
            // If the expense was never recorded, and new amount is 0, it's not a change
            if (!existing && newVal === 0 && newCampaign === '') return false;
            return oldVal !== newVal || oldCampaign !== newCampaign;
        });

        if (!hasChanges) return;

        setIsSavingExpense(true);
        try {
            const newExpenses = FIXED_EXPENSE_TYPES.map(type => {
                const existing = shoot.expenses?.find(e => e.type === type);
                return {
                    id: existing?.id || crypto.randomUUID(),
                    type,
                    amount: Number(expenseAmounts[type]) || 0,
                    campaign: selectedCampaign || undefined
                };
            });

            const updatedShoot = { ...shoot, expenses: newExpenses };
            
            const res = await fetch(`/api/shoots/${shoot.id}/expenses`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expenses: updatedShoot.expenses })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to update expenses in DB');
            }

            storage.getLogsByEntity(shoot.id).then(setLogs);

            queryClient.setQueryData(['shoots', id], updatedShoot);
            await queryClient.invalidateQueries({ queryKey: ['shoots'] });
        } catch (error) {
            console.error('Failed to save expenses:', error);
            showToast('Failed to save expenses', 'error');
        } finally {
            setIsSavingExpense(false);
        }
    };

    const handleCampaignChange = async (newCampaign: string) => {
        setSelectedCampaign(newCampaign);
        if (!shoot) return;
        
        // Auto-update all existing expenses
        const currentExpenses = shoot.expenses || [];
        if (currentExpenses.length > 0) {
            const hasChanges = currentExpenses.some(e => (e.campaign || '') !== newCampaign);
            if (!hasChanges) return;

            const updatedExpenses = currentExpenses.map(e => ({ ...e, campaign: newCampaign }));
            try {
                const res = await fetch(`/api/shoots/${shoot.id}/expenses`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expenses: updatedExpenses })
                });
                if (res.ok) {
                    storage.getLogsByEntity(shoot.id).then(setLogs);
                    queryClient.setQueryData(['shoots', id], { ...shoot, expenses: updatedExpenses });
                    await queryClient.invalidateQueries({ queryKey: ['shoots'] });
                    showToast('Campaign updated for all expenses', 'success');
                }
            } catch (error) {
                console.error('Failed to update campaign:', error);
            }
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

        let calendarError: string | null = null;

        try {
            // Check for Google Calendar Event presence
            if (shoot.googleEventId) {
                const tokens = await getGoogleProviderToken();

                if (tokens && tokens.accessToken) {
                    try {
                        await deleteGoogleCalendarEvent(shoot.googleEventId, tokens);
                    } catch (err: unknown) {
                        console.error('Calendar deletion failed:', err);
                        calendarError = err instanceof Error ? err.message : 'Unknown calendar error';
                        // Continue to cancel locally despite calendar error
                    }
                } else {
                    console.warn('Cannot delete Google Calendar event: No provider token found.');
                    calendarError = 'No Google Calendar connection found';
                }
            }

            // Mark as cancelled and CLEAR the Google ID
            const updatedShoot: Shoot = {
                ...shoot,
                status: 'CANCELLED',
                googleEventId: undefined
            };

            await saveShoot(updatedShoot);
            await queryClient.invalidateQueries({ queryKey: [['shoots', id], ['shoots'], ['shoots', shoot.id]] });

            // Log cancellation
            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: 'Cancelled shoot'
                });
                // update logs locally for immediate feedback
                storage.getLogsByEntity(shoot.id).then(setLogs);
            }

            // Show appropriate feedback
            const toast = document.createElement('div');
            if (calendarError) {
                toast.className = 'fixed bottom-4 right-4 bg-orange-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-2';
                toast.innerHTML = `
                    <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <div>
                        <p class="font-bold">Cancelled locally</p>
                        <p class="text-xs opacity-90">Could not remove from Calendar: ${calendarError}</p>
                    </div>
                `;
            } else {
                toast.className = 'fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-full font-medium z-50 animate-in fade-in slide-in-from-bottom-2';
                toast.textContent = 'Shoot cancelled successfully';
            }
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);

        } catch (error) {
            console.error('Failed to cancel shoot:', error);
            alert('Failed to cancel shoot. Please try again.');
        }
    };

    const handleSyncToCalendar = async () => {
        if (!shoot || isSyncing) return;

        setIsSyncing(true);
        try {
            const tokens = await getGoogleProviderToken();
            if (!tokens || !tokens.accessToken) {
                // If no tokens, they need to sign in with Google Calendar scope
                await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        scopes: 'https://www.googleapis.com/auth/calendar.events',
                        redirectTo: window.location.href,
                        queryParams: {
                            access_type: 'offline',
                        },
                    },
                });
                return;
            }

            const assignedCrew = users.filter(u => assignments.some(a => a.userId === u.id));
            const event = await createGoogleCalendarEvent(shoot, assignedCrew, tokens);

            if (event?.id) {
                // Update shoot with the new googleEventId
                await storage.saveShoot({
                    ...shoot,
                    googleEventId: event.id
                });

                // Invalidate query
                await queryClient.invalidateQueries({ queryKey: [['shoots', id], ['shoots'], ['shoots', shoot.id]] });

                // Success toast
                const toast = document.createElement('div');
                toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-2';
                toast.innerHTML = `
                    <div class="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 shadow-sm">
                        <svg class="h-5 w-5 fill-white" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        </svg>
                    </div>
                    <div>
                        <p class="font-bold">Successfully Synced!</p>
                        <p class="text-xs opacity-90">Invites sent to ${assignedCrew.filter(c => c.email).length} crew members.</p>
                    </div>
                `;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
            }
        } catch (error: unknown) {
            console.error('Failed to sync to calendar:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            alert('Wait! Something went wrong: ' + message);
        } finally {
            setIsSyncing(false);
        }
    };

    const getUserName = (userId?: string) => {
        if (!userId) return 'System';
        return users.find(u => u.id === userId)?.name || userId;
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

    // Access Control: CREW members can only view shoots they are assigned to
    if (user && user.role === 'CREW') {
        const isAssigned = assignments.some(a => a.userId === user.id);
        if (!isAssigned) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center animate-fade-in">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                        <XCircle size={32} className="text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
                    <p className="text-gray-500 max-w-md mb-6">
                        You are not assigned to this shoot. Only assigned crew members can view the details.
                    </p>
                    <Link href="/shoots">
                        <Button>Back to Shoots</Button>
                    </Link>
                </div>
            );
        }
    }

    return (
        <div className="max-w-[1400px] xl:max-w-[1600px] mx-auto w-full space-y-4 animate-fade-in pb-12 p-3 sm:p-5 sm:space-y-6">
            {/* Navigation & Header */}
            <div className="flex flex-col gap-4">
                {/* Title Section */}
                <div className="space-y-3 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                        {shoot.shootNumber && (
                            <span className="font-mono text-[11px] sm:text-sm font-bold text-muted-foreground bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded shrink-0">
                                #{shoot.shootNumber}
                            </span>
                        )}
                        <Badge
                            variant={shoot.status === 'CONFIRMED' ? 'success' : shoot.status === 'CANCELLED' ? 'destructive' : 'warning'}
                            className="px-2.5 py-0.5 text-[10px] sm:text-xs font-bold tracking-wide shrink-0"
                        >
                            {shoot.status}
                        </Badge>
                        {shoot.googleEventId && (
                            <a
                                href={`https://calendar.google.com/calendar/event?eid=${shoot.googleEventId}&ctz=Asia/Kolkata`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-medium text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-0.5 rounded-full transition-colors border border-primary/20 shrink-0"
                            >
                                <svg viewBox="0 0 24 24" className="w-3 h-3" aria-hidden="true">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                <span className="hidden xs:inline">Synced</span>
                            </a>
                        )}
                    </div>

                    <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight break-words">
                        {shoot.title}
                    </h1>

                    <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                        Added by <span className="font-semibold text-foreground">{getUserName(shoot.createdBy)}</span>
                    </p>
                </div>

                {/* Actions Toolbar */}
                {/* Actions Toolbar */}
                <div className="grid grid-cols-6 sm:flex sm:items-center gap-2 sm:gap-3 pt-4">
                    <button
                        onClick={() => {
                            const message = formatWhatsAppMessage(shoot, assignments, users);
                            openWhatsApp(message);
                        }}
                        className="col-span-2 flex items-center justify-center gap-1.5 sm:gap-2 px-2 py-2 sm:px-5 sm:py-2.5 rounded-xl font-bold transition-all shadow-sm hover:shadow-green-500/20 active:scale-95 bg-[#25D366] hover:bg-[#22bf5b] text-white text-xs sm:text-sm whitespace-nowrap lg:min-w-[140px]"
                        title="Share via WhatsApp"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="shrink-0 sm:w-[18px] sm:h-[18px]">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                        WhatsApp
                    </button>

                    <button
                        onClick={async (e) => {
                            const btn = e.currentTarget;
                            const originalContent = btn.innerHTML;
                            const message = formatWhatsAppMessage(shoot, assignments, users);
                            try {
                                await navigator.clipboard.writeText(message);
                                btn.innerHTML = `<svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg> Copied`;
                                btn.classList.add('bg-green-50', 'dark:bg-green-900/20', 'border-green-200', 'dark:border-green-800', 'text-green-700', 'dark:text-green-300');
                                setTimeout(() => {
                                    btn.innerHTML = originalContent;
                                    btn.classList.remove('bg-green-50', 'dark:bg-green-900/20', 'border-green-200', 'dark:border-green-800', 'text-green-700', 'dark:text-green-300');
                                }, 2000);
                            } catch (err) {
                                console.error('Failed to copy', err);
                            }
                        }}
                        className="col-span-2 flex items-center justify-center gap-1.5 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2.5 rounded-xl font-medium transition-all shadow-sm hover:shadow active:scale-95 bg-white dark:bg-zinc-800/50 dark:hover:bg-zinc-800 dark:backdrop-blur-md border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 text-xs sm:text-sm whitespace-nowrap"
                    >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 00-2 2z" />
                        </svg>
                        <span className="sm:hidden">Copy</span>
                        <span className="hidden sm:inline">Copy Info</span>
                    </button>

                    {shoot.jiraTicketId && (
                        <a
                            href={`https://${APP_CONFIG.jiraDomain}/browse/${shoot.jiraTicketId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="col-span-2 flex items-center justify-center gap-1.5 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2.5 rounded-xl font-medium transition-all shadow-sm hover:shadow active:scale-95 bg-[#0052CC] hover:bg-[#0047b3] text-white text-xs sm:text-sm whitespace-nowrap"
                            title="Open Jira Ticket"
                        >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M11.53 16.32v-6.5l-4.75 3.25-4.75-3.25v6.5c0 .35.08.68.21.99.14.31.33.59.57.82.23.24.51.43.82.57.31.13.63.2.98.2h5.84c.35 0 .68-.07.99-.2.31-.14.59-.33.82-.57.24-.23.43-.51.57-.82.13-.31.2-.64.2-.99 0-.35-.07-.68-.2-.99a2.58 2.58 0 0 0-.8-1.5zm6.5 2.5a2.6 2.6 0 0 0 .5-2.5v-6.5l-4.75 3.25-2.27-1.56v7.38c0 .35.07.68.2.99.14.31.33.59.57.82.23.24.51.43.82.57.31.13.64.2.99.2h2.24c.35 0 .68-.07.99-.2.31-.14.59-.33.82-.57.24-.23.43-.51.57-.82.13-.31.2-.64.2-.99 0 0 0 0 0 0zM12 2l-4.75 3.25 4.75 3.25L16.75 5.25 12 2zm6.27 4.15l-3.32 2.22 3.32 2.25 3.32-2.25-3.32-2.22z" />
                            </svg>
                            Jira
                        </a>
                    )}

                    {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                        <>
                            <Link href={`/shoots/${shoot.id}/edit`} className="col-span-3 sm:col-span-auto sm:w-auto">
                                <Button variant="outline" className="w-full gap-1.5 sm:gap-2 bg-white dark:bg-zinc-800/50 dark:hover:bg-zinc-800 dark:backdrop-blur-md h-[36px] sm:h-[42px] px-2 sm:px-5 rounded-xl font-medium border-gray-200 dark:border-zinc-700 text-xs sm:text-sm text-gray-700 dark:text-gray-200">
                                    <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Edit
                                </Button>
                            </Link>

                            {shoot.status !== 'CANCELLED' && (
                                <button
                                    onClick={handleCancelShoot}
                                    className="col-span-3 sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 h-[36px] sm:h-[42px] px-2 sm:px-5 rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30 transition-all shadow-sm active:scale-95"
                                >
                                    <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Cancel
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Calendar Banner - Moved below header */}
            {!shoot.googleEventId && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && shoot.status !== 'CANCELLED' && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                            <AlertCircle size={20} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Sync with Google Calendar</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Automatically invite crew and track this shoot.</p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        onClick={handleSyncToCalendar}
                        disabled={isSyncing}
                        className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-9 px-4 rounded-xl shadow-lg shadow-primary/20"
                    >
                        {isSyncing ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fillOpacity={0.5} />
                            </svg>
                        )}
                        Sync to Calendar
                    </Button>
                </div>
            )}

            {/* Quick Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Date & Time */}
                <Card className="border-none rounded-[24px] shadow-sm hover:shadow-lg transition-all duration-300 bg-white dark:bg-[#1c1c1e] group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 transition-opacity opacity-0 group-hover:opacity-100"></div>
                    <div className="flex items-start sm:items-center justify-between p-4 sm:p-5 relative z-10 gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-[#86868b] dark:text-gray-500 uppercase tracking-widest mb-1.5">Date & Time</p>
                            <p className="font-bold text-[15px] sm:text-[17px] text-[#1d1d1f] dark:text-white leading-tight">
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
                            <p className="text-[13px] text-[#86868b] dark:text-gray-400 mt-1">
                                {(() => {
                                    if (!shoot.startTime) return 'Time not set';
                                    const start = format(parseISO(shoot.startTime), 'h:mm a');
                                    const end = shoot.endTime ? format(parseISO(shoot.endTime), 'h:mm a') : '';
                                    return end ? `${start} - ${end}` : start;
                                })()}
                            </p>
                        </div>
                        <div className="shrink-0">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Location */}
                <Card className="border-none rounded-[24px] shadow-sm hover:shadow-lg transition-all duration-300 bg-white dark:bg-[#1c1c1e] group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-opacity opacity-0 group-hover:opacity-100"></div>
                    <div className="flex items-start sm:items-center justify-between p-4 sm:p-5 relative z-10 gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-[#86868b] dark:text-gray-500 uppercase tracking-widest mb-1.5">Location</p>
                            <p className="font-bold text-[15px] sm:text-[17px] text-[#1d1d1f] dark:text-white leading-tight break-words line-clamp-2" title={shoot.location}>{shoot.location || 'No Location'}</p>
                            <p className="text-[13px] text-[#86868b] dark:text-gray-400 mt-1">Site / Venue</p>
                        </div>
                        <div className="shrink-0">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-500 dark:text-purple-400">
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Point of Contact */}
                <Card className="border-none rounded-[24px] shadow-sm hover:shadow-lg transition-all duration-300 bg-white dark:bg-[#1c1c1e] group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-opacity opacity-0 group-hover:opacity-100"></div>
                    <div className="flex items-start sm:items-center justify-between p-4 sm:p-5 relative z-10 gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-[#86868b] dark:text-gray-500 uppercase tracking-widest mb-1.5">Point of Contact</p>
                            <p className="font-bold text-[15px] sm:text-[17px] text-[#1d1d1f] dark:text-white leading-tight break-words line-clamp-2">{shoot.pocName || 'No POC'}</p>
                            <p className="text-[13px] text-[#86868b] dark:text-gray-400 mt-1 break-all line-clamp-1">{shoot.pocContact || 'No contact info'}</p>
                        </div>
                        <div className="shrink-0">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Description (if exists) */}
            {
                shoot.description && (
                    <div className="rounded-xl p-5 shadow-sm bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#3a3a3c]">
                        <h3 className="text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2 text-gray-900 dark:text-white">
                            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            About this Shoot
                        </h3>
                        <p className="leading-relaxed max-w-4xl text-[15px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                            {shoot.description}
                        </p>
                    </div>
                )
            }

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content Column */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Crew List - Main Content */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1 mb-4">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Crew Assignments</h2>
                            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{assignments.length} Members</span>
                        </div>

                        <div className="space-y-3">
                            {assignments.length === 0 ? (
                                <div className="text-center py-12 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-700">
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-gray-200 dark:bg-gray-700">
                                        <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </div>
                                    <p className="font-medium text-gray-700 dark:text-gray-300">No crew assigned yet</p>
                                    <p className="text-sm mb-4 text-gray-500 dark:text-gray-400">Add members to organize this shoot</p>
                                    {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                                        <Link href={`/shoots/${id}/edit`}>
                                            <Button size="sm">Add Crew Member</Button>
                                        </Link>
                                    )}
                                </div>
                            ) : (
                                assignments.map((assignment) => {
                                    const assignedUser = users.find(u => u.id === assignment.userId);
                                    if (!assignedUser) return null;
                                    const isIncharge = assignment.role === 'Incharge';

                                    const getRoleClasses = (role: string) => {
                                        switch (role) {
                                            case 'ADMIN': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700';
                                            case 'SUPER_ADMIN': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
                                            case 'MANAGER': return 'bg-primary/20 text-primary border-primary/30';
                                            default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
                                        }
                                    };

                                    const roleClass = isIncharge
                                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
                                        : getRoleClasses(assignedUser.role);

                                    return (
                                        <div
                                            key={assignment.id}
                                            className="flex items-center justify-between p-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#3a3a3c]"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="relative">
                                                    <div
                                                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm ${isIncharge
                                                            ? 'bg-gradient-to-br from-primary to-primary/80 text-white'
                                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                            }`}
                                                    >
                                                        {assignedUser.name.charAt(0)}
                                                    </div>
                                                    {isIncharge && (
                                                        <div
                                                            className="absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm bg-yellow-400 text-yellow-900 border-2 border-white dark:border-gray-900"
                                                        >
                                                            LEAD
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-[15px] text-gray-900 dark:text-white">{assignedUser.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span
                                                            className={`text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wide border ${roleClass}`}
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

                    {/* Expenses Section */}
                    {((user?.role && ['ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user.role)) || user?.canManageExpenses) && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-1 mb-4 gap-3">
                            <div className="flex items-center gap-4 flex-wrap">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Receipt className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                    Project Expenses
                                </h2>
                                <div className="relative inline-flex items-center group">
                                    {/* The visible custom Badge/Button */}
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold tracking-wider shadow-sm transition-all group-hover:shadow-md ${
                                        selectedCampaign === 'SGEx' ? 'bg-[#c95434] border-[#b04529] text-white' :
                                        selectedCampaign === 'Isha Tamil' ? 'bg-amber-500 border-amber-600 text-white' :
                                        selectedCampaign === 'SG Reach' ? 'bg-primary border-primary text-primary-foreground' :
                                        selectedCampaign === 'Events' ? 'bg-purple-500 border-purple-600 text-white' :
                                        selectedCampaign === 'Campaign' ? 'bg-indigo-500 border-indigo-600 text-white' :
                                        selectedCampaign ? 'bg-gray-500 border-gray-600 text-white' :
                                        'bg-white dark:bg-[#1c1c1e] border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 group-hover:bg-gray-50 dark:group-hover:bg-gray-800'
                                    }`}>
                                        <span className={selectedCampaign ? 'uppercase text-[10px]' : ''}>
                                            {selectedCampaign || 'Select Category'}
                                        </span>
                                        <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                                        </svg>
                                    </div>

                                    {/* The invisible select that catches clicks */}
                                    <select
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        value={selectedCampaign || ""}
                                        onChange={(e) => handleCampaignChange(e.target.value)}
                                        title="Select Category"
                                    >
                                        <option value="">None (Clear)</option>
                                        <option value="SGEx">SGEx</option>
                                        <option value="Isha Tamil">Isha Tamil</option>
                                        <option value="SG Reach">SG Reach</option>
                                        <option value="Events">Events</option>
                                        <option value="Campaign">Campaign</option>
                                        <option value="Others">Others</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant="default" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50">
                                    Total: ₹{FIXED_EXPENSE_TYPES.reduce((sum, type) => sum + (Number(expenseAmounts[type]) || 0), 0).toLocaleString('en-IN')}
                                </Badge>
                                {isSavingExpense && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {FIXED_EXPENSE_TYPES.map((type) => (
                                <div key={type} className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#3a3a3c] shadow-sm hover:border-primary/30 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 relative">
                                            {type === 'Boarding' ? <Home className="w-5 h-5" /> : 
                                             type === 'Travel' ? <Plane className="w-5 h-5" /> :
                                             type === 'Equipment' ? <Video className="w-5 h-5" /> :
                                             type === 'Manpower' ? <Users className="w-5 h-5" /> :
                                             <MoreHorizontal className="w-5 h-5" />}
                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-[1.5px] border-white dark:border-[#2c2c2e] text-white">
                                                <IndianRupee className="w-2.5 h-2.5 stroke-[3]" />
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900 dark:text-white text-[15px]">{type}</h4>
                                        </div>
                                    </div>
                                    <div className="relative max-w-[150px]">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={expenseAmounts[type] || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val && Number(val) < 0) return; // Prevent negative values
                                                setExpenseAmounts(prev => ({ ...prev, [type]: val }));
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === '-') {
                                                    e.preventDefault();
                                                }
                                            }}
                                            onBlur={handleSaveFixedExpenses}
                                            className="w-full pl-7 pr-3 py-1.5 bg-gray-50 dark:bg-[#1c1c1e] border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-semibold text-right"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    )}

                    {/* Linked Transactions Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1 mb-4">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Linked Transactions</h2>
                            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{linkedTransactions.length} Checkouts</span>
                        </div>

                        <div className="space-y-3">
                            {linkedTransactions.length === 0 ? (
                                <div className="text-center py-8 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-700">
                                    <p className="font-medium text-gray-700 dark:text-gray-300">No transactions linked</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Equipment checkouts linked to this shoot will appear here.</p>
                                </div>
                            ) : (
                                linkedTransactions.map((txn) => {
                                    const primaryUser = users.find(u => u.id === txn.userId);
                                    return (
                                        <Link key={txn.id} href={`/transactions/${txn.id}`} className="block">
                                            <div
                                                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 bg-white dark:bg-[#2c2c2e] border border-gray-200 dark:border-[#3a3a3c] group hover:border-primary/50 gap-3 sm:gap-4"
                                            >
                                                <div className="flex items-start gap-3 sm:gap-4 w-full sm:w-auto">
                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                            <h4 className="font-bold text-[14px] sm:text-[15px] text-gray-900 dark:text-white group-hover:text-primary transition-colors truncate">
                                                                {txn.project || 'Unspecified Project'}
                                                            </h4>
                                                            <span className="text-[10px] sm:text-xs font-mono text-gray-400">#{txn.id}</span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                                            <span className="whitespace-nowrap">{txn.items.length} items</span>
                                                            <span className="hidden sm:inline">•</span>
                                                            <span className="truncate max-w-[100px] sm:max-w-none">{primaryUser?.name || primaryUser?.email || 'Unknown User'}</span>
                                                            <span className="hidden sm:inline">•</span>
                                                            <span className="whitespace-nowrap">{format(parseISO(txn.timestampOut), 'MMM d, h:mm a')}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between w-full sm:w-auto sm:justify-end gap-3 pl-[52px] sm:pl-0">
                                                    <Badge variant={txn.status === 'OPEN' ? 'success' : 'default'} className="px-2 py-0.5 text-[10px] sm:text-xs font-bold">
                                                        {txn.status}
                                                    </Badge>
                                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar - Activity Log */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white px-1">Recent Activity</h2>
                    <Card className="p-0 overflow-hidden border border-border bg-white dark:bg-[#2c2c2e] border-gray-200 dark:border-[#3a3a3c]">
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
