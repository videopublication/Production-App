'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { Shoot, ShootStatus, User, Assignment, Log, PlannerDraftAssignment, Leave } from '@/types';
import { formatWhatsAppMessage, openWhatsApp, generateShootWhatsAppPayload } from '@/lib/whatsapp';
import { WhatsAppDispatchModal } from '@/components/WhatsAppDispatchModal';
import { isSameDay } from 'date-fns';
import { Button } from '@/components/Button';
import { APP_CONFIG } from '@/lib/config';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { ArrowLeft, Edit, XCircle, Plus, Trash2, IndianRupee, Receipt, Home, Plane, Video, Users, MoreHorizontal, ChevronDown, ExternalLink, Calendar, MapPin, User as UserIcon, FileText, Globe, Layers, MessageSquare, Clock, Send, RefreshCw, Check, X, Pencil, Search, AlertTriangle, CheckCircle, Info, ShieldCheck, Filter, Wrench, Package, Star, Sparkles, UserCheck, Lock, Pin, PinOff, ArrowUpDown, Share2, Bold, Italic, List, Link2, Quote, History } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useToast } from '@/lib/toast-context';

import { useShoot, useShoots, useSaveShoot } from '@/hooks/useShoots';
import { useLeaves } from '@/hooks/useLeaves';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';
import { useTransactions } from '@/hooks/useTransactions';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getGoogleProviderToken, deleteGoogleCalendarEvent, createGoogleCalendarEvent } from '@/lib/google-calendar';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { getRoleLabel } from '@/lib/roles';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import { JiraTicket, JiraComment, JiraHistoryItem } from '@/lib/jira';
import { JiraIcon } from '@/components/icons/JiraIcon';
import { jiraStatusToAppStatus } from '@/lib/jira-utils';
import { CrewAssignmentModal } from '@/components/CrewAssignmentModal';

const STATUS_OPTIONS: { key: ShootStatus; label: string; bg: string; text: string; border: string; description: string }[] = [
    { key: 'OPEN', label: 'Open', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc', description: 'Newly submitted or ready for review' },
    { key: 'WAITING_FOR_REQUESTER', label: 'Waiting for Requester', bg: '#f1f5f9', text: '#334155', border: '#cbd5e1', description: 'Awaiting response or assets' },
    { key: 'PENDING_PRODUCTION_SETUP', label: 'Pending Setup', bg: '#ffedd5', text: '#c2410c', border: '#fdba74', description: 'Gear & logistics being prepped' },
    { key: 'READY_FOR_SHOOT', label: 'Ready for Shoot', bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', description: 'Confirmed & crew assigned' },
    { key: 'CONFIRMED', label: 'Confirmed', bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', description: 'Shoot confirmed & scheduled' },
    { key: 'SHOOT_IN_PROGRESS', label: 'In Progress', bg: '#dcfce7', text: '#15803d', border: '#86efac', description: 'Active shoot underway' },
    { key: 'ON_HOLD', label: 'On Hold', bg: '#fef3c7', text: '#b45309', border: '#fcd34d', description: 'Temporarily paused or delayed' },
    { key: 'CLOSED', label: 'Closed / Completed', bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe', description: 'Shoot completed & footage saved' },
    { key: 'CANCELLED', label: 'Cancelled', bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', description: 'Cancel shoot with a reason' },
];

export default function ShootDetailsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { department, allDepartments } = useDepartment();
    const { showToast } = useToast();
    const params = useParams();
    const searchParams = useSearchParams();
    const id = params?.id as string;
    const returnTo = searchParams.get('returnTo');
    const safeReturnTo = returnTo?.startsWith('/') ? returnTo : null;
    const customReturnLabel = searchParams.get('returnLabel');
    const withReturnTo = (href: string) =>
        safeReturnTo ? `${href}?returnTo=${encodeURIComponent(safeReturnTo)}` : href;
    const queryClient = useQueryClient();

    // React Query Hooks
    const { data: shoot, isLoading: shootLoading } = useShoot(id);
    const { data: allShoots = [] } = useShoots();
    const { leaves: allLeaves = [] } = useLeaves();
    const { data: allAssignments = [], isLoading: assignmentsLoading } = useAssignments();
    const { data: users = [], isLoading: usersLoading } = useUsers();
    const { data: allTransactions = [], isLoading: transactionsLoading } = useTransactions();
    const pageDepartment = allDepartments.find(dept => dept.id === shoot?.departmentId) || department;
    const labels = getDepartmentLabels(pageDepartment);

    const [logs, setLogs] = useState<Log[]>([]);
    const [shootDraftAssignments, setShootDraftAssignments] = useState<PlannerDraftAssignment[]>([]);
    const { mutateAsync: saveShoot } = useSaveShoot();

    const loading = shootLoading || assignmentsLoading || usersLoading;
    const [isSyncing, setIsSyncing] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    // Status Dropdown & Jira States
    const statusMenuRef = React.useRef<HTMLDivElement>(null);
    const actionStatusMenuRef = React.useRef<HTMLDivElement>(null);
    const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
    const [isActionStatusMenuOpen, setIsActionStatusMenuOpen] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [jiraDetails, setJiraDetails] = useState<JiraTicket | null>(null);
    const [isJiraLoading, setIsJiraLoading] = useState(false);

    // Close status dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
                setIsStatusMenuOpen(false);
            }
            if (actionStatusMenuRef.current && !actionStatusMenuRef.current.contains(e.target as Node)) {
                setIsActionStatusMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch rich Jira details when shoot has a Jira ticket & auto-reconcile all fields
    const refreshJiraDetails = useCallback(() => {
        if (!shoot?.jiraTicketId) return;
        setIsJiraLoading(true);
        fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}`, { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(async (data) => {
                if (data && !('error' in data)) {
                    setJiraDetails(data);
                    
                    let shouldUpdateShoot = false;
                    const updatedShoot = { ...shoot };

                    // 1. Status auto-reconcile
                    if (data.status) {
                        const liveAppStatus = jiraStatusToAppStatus(data.status);
                        if (liveAppStatus && liveAppStatus !== shoot.status) {
                            updatedShoot.status = liveAppStatus;
                            shouldUpdateShoot = true;
                        }
                    }

                    // 2. Requester Notes & Requirements auto-reconcile
                    if (data.description !== undefined && data.description !== (shoot.description || '')) {
                        updatedShoot.description = data.description;
                        shouldUpdateShoot = true;
                    }

                    // 3. Location (Event Location & Event Venue) auto-reconcile
                    if (data.location && data.location !== (shoot.location || '')) {
                        updatedShoot.location = data.location;
                        shouldUpdateShoot = true;
                    }

                    // 4. Schedule (Start Time & End Time) auto-reconcile
                    if (data.startTime) {
                        const jiraStart = new Date(data.startTime).getTime();
                        const currentStart = shoot.startTime ? new Date(shoot.startTime).getTime() : 0;
                        if (jiraStart && jiraStart !== currentStart) {
                            updatedShoot.startTime = data.startTime;
                            shouldUpdateShoot = true;
                        }
                    }
                    if (data.endTime) {
                        const jiraEnd = new Date(data.endTime).getTime();
                        const currentEnd = shoot.endTime ? new Date(shoot.endTime).getTime() : 0;
                        if (jiraEnd && jiraEnd !== currentEnd) {
                            updatedShoot.endTime = data.endTime;
                            shouldUpdateShoot = true;
                        }
                    }

                    // 5. Title auto-reconcile
                    if (data.title && data.title !== (shoot.title || '')) {
                        updatedShoot.title = data.title;
                        shouldUpdateShoot = true;
                    }

                    // 6. POC auto-reconcile
                    if (data.pocName && data.pocName !== (shoot.pocName || '')) {
                        updatedShoot.pocName = data.pocName;
                        shouldUpdateShoot = true;
                    }
                    if (data.pocContact && data.pocContact !== (shoot.pocContact || '')) {
                        updatedShoot.pocContact = data.pocContact;
                        shouldUpdateShoot = true;
                    }

                    if (shouldUpdateShoot) {
                        try {
                            await saveShoot(updatedShoot);
                            queryClient.setQueryData(['shoot', shoot.id], updatedShoot);
                            queryClient.invalidateQueries({ queryKey: ['shoot', shoot.id] });
                            queryClient.invalidateQueries({ queryKey: ['shoots'] });
                        } catch (e) {
                            console.error('Failed to auto-reconcile Jira details:', e);
                        }
                    }
                }
            })
            .catch(err => console.debug('[Jira fetch error]:', err))
            .finally(() => setIsJiraLoading(false));
    }, [shoot?.jiraTicketId, shoot?.status, shoot?.description, shoot?.location, shoot?.startTime, shoot?.endTime, shoot?.title, shoot?.pocName, shoot?.pocContact, shoot, saveShoot, queryClient]);

    // Jira Comments State
    const [jiraComments, setJiraComments] = useState<JiraComment[]>([]);
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [newCommentText, setNewCommentText] = useState('');
    const [isPostingComment, setIsPostingComment] = useState(false);
    const [commentSortOrder, setCommentSortOrder] = useState<'NEWEST_FIRST' | 'OLDEST_FIRST'>('NEWEST_FIRST');
    const [pinnedCommentIds, setPinnedCommentIds] = useState<string[]>([]);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState('');
    const [isSavingCommentEdit, setIsSavingCommentEdit] = useState(false);
    const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
    const [activityTab, setActivityTab] = useState<'COMMENTS' | 'JIRA_HISTORY' | 'APP_LOGS' | 'ALL'>('COMMENTS');
    const [jiraHistory, setJiraHistory] = useState<JiraHistoryItem[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Load pinned comments from localStorage
    useEffect(() => {
        if (!shoot?.id) return;
        try {
            const saved = localStorage.getItem(`pinned_jira_comments_${shoot.id}`);
            if (saved) setPinnedCommentIds(JSON.parse(saved));
        } catch {}
    }, [shoot?.id]);

    const togglePinComment = (commentId: string) => {
        if (!shoot?.id) return;
        setPinnedCommentIds(prev => {
            const next = prev.includes(commentId)
                ? prev.filter(id => id !== commentId)
                : [commentId, ...prev].slice(0, 5); // Max 5 pinned comments
            try {
                localStorage.setItem(`pinned_jira_comments_${shoot.id}`, JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    const fetchJiraComments = useCallback(() => {
        if (!shoot?.jiraTicketId) return;
        setIsLoadingComments(true);
        fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}/comments`, { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && Array.isArray(data.comments)) {
                    setJiraComments(data.comments);
                }
            })
            .catch(err => console.debug('[Jira comments fetch error]:', err))
            .finally(() => setIsLoadingComments(false));
    }, [shoot?.jiraTicketId]);

    const fetchJiraHistory = useCallback(() => {
        if (!shoot?.jiraTicketId) return;
        setIsLoadingHistory(true);
        fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}/changelog`, { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && Array.isArray(data.histories)) {
                    setJiraHistory(data.histories);
                }
            })
            .catch(err => console.debug('[Jira history fetch error]:', err))
            .finally(() => setIsLoadingHistory(false));
    }, [shoot?.jiraTicketId]);

    const insertFormatting = (prefix: string, suffix = '') => {
        const textarea = document.getElementById('jira-comment-textarea') as HTMLTextAreaElement | null;
        if (!textarea) return;
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const selected = newCommentText.substring(start, end);
        const replacement = `${prefix}${selected || 'text'}${suffix}`;
        const nextValue = newCommentText.substring(0, start) + replacement + newCommentText.substring(end);
        setNewCommentText(nextValue);
        setTimeout(() => {
            textarea.focus();
            const cursorPos = start + prefix.length;
            const selLen = selected ? selected.length : 4;
            textarea.setSelectionRange(cursorPos, cursorPos + selLen);
        }, 0);
    };

    const handlePostComment = async (isInternal = false) => {
        if (!shoot?.jiraTicketId || !newCommentText.trim()) return;
        setIsPostingComment(true);
        try {
            const res = await fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: newCommentText.trim(), isInternal }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setNewCommentText('');
                fetchJiraComments();
                showToast(
                    data.dryRun
                        ? (isInternal ? 'Internal note simulated (Dry Run)' : 'Public reply simulated (Dry Run)')
                        : (isInternal ? 'Internal note added to Jira!' : 'Public comment shared to Jira!'),
                    'success'
                );
            } else {
                showToast(data.error || 'Failed to post comment to Jira', 'error');
            }
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Error posting comment', 'error');
        } finally {
            setIsPostingComment(false);
        }
    };

    const handleStartEditComment = (comment: JiraComment) => {
        setEditingCommentId(comment.id);
        const cleaned = comment.body.replace(/^\[Production App • [^\]]+\]\s*/i, '');
        setEditingCommentText(cleaned);
    };

    const handleSaveEditComment = async (commentId: string) => {
        if (!shoot?.jiraTicketId || !editingCommentText.trim()) return;
        setIsSavingCommentEdit(true);
        try {
            const res = await fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}/comments/${encodeURIComponent(commentId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: editingCommentText.trim() }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setEditingCommentId(null);
                setEditingCommentText('');
                fetchJiraComments();
                showToast(data.dryRun ? 'Comment edit simulated (Dry Run)' : 'Comment updated in Jira!', 'success');
            } else {
                showToast(data.error || 'Failed to update comment in Jira', 'error');
            }
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Error updating comment', 'error');
        } finally {
            setIsSavingCommentEdit(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!shoot?.jiraTicketId) return;
        if (!confirm('Are you sure you want to delete this comment from Jira?')) return;
        setDeletingCommentId(commentId);
        try {
            const res = await fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}/comments/${encodeURIComponent(commentId)}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setPinnedCommentIds(prev => {
                    const next = prev.filter(id => id !== commentId);
                    try {
                        localStorage.setItem(`pinned_jira_comments_${shoot.id}`, JSON.stringify(next));
                    } catch {}
                    return next;
                });
                fetchJiraComments();
                showToast(data.dryRun ? 'Comment delete simulated (Dry Run)' : 'Comment deleted from Jira!', 'success');
            } else {
                showToast(data.error || 'Failed to delete comment from Jira', 'error');
            }
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Error deleting comment', 'error');
        } finally {
            setDeletingCommentId(null);
        }
    };

    // Organized comments with Pin support & Sort toggle
    const organizedComments = useMemo(() => {
        const sorted = [...jiraComments].sort((a, b) => {
            const timeA = new Date(a.created).getTime();
            const timeB = new Date(b.created).getTime();
            return commentSortOrder === 'NEWEST_FIRST' ? timeB - timeA : timeA - timeB;
        });

        const pinned = sorted.filter(c => pinnedCommentIds.includes(c.id));
        const unpinned = sorted.filter(c => !pinnedCommentIds.includes(c.id));
        return [...pinned, ...unpinned];
    }, [jiraComments, commentSortOrder, pinnedCommentIds]);

    // Organized Jira History
    const organizedHistory = useMemo(() => {
        return [...jiraHistory].sort((a, b) => {
            const timeA = new Date(a.created).getTime();
            const timeB = new Date(b.created).getTime();
            return commentSortOrder === 'NEWEST_FIRST' ? timeB - timeA : timeA - timeB;
        });
    }, [jiraHistory, commentSortOrder]);

    // Merged Activity timeline combining Comments, Jira Changelog, and Local App Logs
    const mergedActivityTimeline = useMemo(() => {
        type TimelineItem =
            | { type: 'COMMENT'; id: string; timestamp: string; comment: JiraComment }
            | { type: 'JIRA_HISTORY'; id: string; timestamp: string; history: JiraHistoryItem }
            | { type: 'APP_LOG'; id: string; timestamp: string; log: Log };

        const items: TimelineItem[] = [];

        jiraComments.forEach(c => {
            if (c.created) items.push({ type: 'COMMENT', id: `c-${c.id}`, timestamp: c.created, comment: c });
        });

        jiraHistory.forEach(h => {
            if (h.created) items.push({ type: 'JIRA_HISTORY', id: `h-${h.id}`, timestamp: h.created, history: h });
        });

        logs.forEach(l => {
            if (l.timestamp) items.push({ type: 'APP_LOG', id: `l-${l.id}`, timestamp: l.timestamp, log: l });
        });

        return items.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return commentSortOrder === 'NEWEST_FIRST' ? timeB - timeA : timeA - timeB;
        });
    }, [jiraComments, jiraHistory, logs, commentSortOrder]);

    useEffect(() => {
        refreshJiraDetails();
        fetchJiraComments();
        fetchJiraHistory();
        // Auto-refresh when user switches tabs back to this page
        const handleFocus = () => {
            refreshJiraDetails();
            fetchJiraComments();
            fetchJiraHistory();
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [refreshJiraDetails, fetchJiraComments, fetchJiraHistory]);
    
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

    // In-Place Inline Editing State
    const [editingSection, setEditingSection] = useState<'title' | 'schedule' | 'location' | 'poc' | 'description' | null>(null);
    const [isSavingField, setIsSavingField] = useState(false);
    const [isQuickEditModalOpen, setIsQuickEditModalOpen] = useState(false);

    // Event Location Presets matching Jira Service Desk
    const EVENT_LOCATION_OPTIONS = [
        'Inside Ashram',
        'Outside Ashram - India',
        'Outside Ashram - Overseas',
    ] as const;

    // Form Buffer State for In-Place Editing
    const [formTitle, setFormTitle] = useState('');
    const [formStartDate, setFormStartDate] = useState('');
    const [formStartTime, setFormStartTime] = useState('');
    const [formEndDate, setFormEndDate] = useState('');
    const [formEndTime, setFormEndTime] = useState('');
    const [formEventLocation, setFormEventLocation] = useState<string>('Inside Ashram');
    const [formEventVenue, setFormEventVenue] = useState<string>('');
    const [formPocName, setFormPocName] = useState('');
    const [formPocContact, setFormPocContact] = useState('');
    const [formDescription, setFormDescription] = useState('');

    const parseLocationString = (locStr?: string, defaultJiraLoc?: string, defaultJiraVenue?: string) => {
        const raw = (locStr || '').trim();
        if (!raw) {
            return {
                eventLocation: defaultJiraLoc || 'Inside Ashram',
                eventVenue: defaultJiraVenue || ''
            };
        }
        if (raw.includes('•')) {
            const parts = raw.split('•').map(p => p.trim());
            const matchedOpt = EVENT_LOCATION_OPTIONS.find(o => o.toLowerCase() === parts[0].toLowerCase());
            return {
                eventLocation: matchedOpt || parts[0] || 'Inside Ashram',
                eventVenue: parts.slice(1).join(' • ').trim()
            };
        }
        const matchedOpt = EVENT_LOCATION_OPTIONS.find(o => o.toLowerCase() === raw.toLowerCase());
        if (matchedOpt) {
            return { eventLocation: matchedOpt, eventVenue: defaultJiraVenue || '' };
        }
        return {
            eventLocation: defaultJiraLoc || 'Inside Ashram',
            eventVenue: raw
        };
    };

    const syncFieldToJira = async (ticketId: string, updates: { description?: string; location?: string; venue?: string; startTime?: string; endTime?: string; title?: string }) => {
        try {
            const res = await fetch(`/api/jira/ticket/${encodeURIComponent(ticketId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.warn('[Jira Sync Warning]:', err);
            }
        } catch (err) {
            console.warn('[Jira Sync Network Error]:', err);
        }
    };

    // Scope Options for Crew Assignment (Compact and Full labels)
    const CREW_SCOPE_OPTIONS = [
        { value: 'Full Shoot', label: 'Full', fullLabel: 'Full Shoot', icon: '🎬', description: 'Assigned for full shoot duration' },
        { value: 'Setup Only', label: 'Setup', fullLabel: 'Setup Only', icon: '🛠️', description: 'Pre-shoot equipment prep & setup only' },
        { value: 'Windup Only', label: 'Windup', fullLabel: 'Windup Only', icon: '📦', description: 'Post-shoot wrap-up & return only' },
        { value: 'Incharge', label: 'Incharge', fullLabel: 'Incharge', icon: '⭐', description: 'Designated shoot incharge & primary coordinator' },
    ];

    // In-Place Crew Assignment Modal State
    const [isCrewModalOpen, setIsCrewModalOpen] = useState(false);
    const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
    const [selectedCrewRoles, setSelectedCrewRoles] = useState<Record<string, string>>({});
    const [selectedInchargeId, setSelectedInchargeId] = useState<string>('');
    const [crewSearch, setCrewSearch] = useState('');
    const [crewAvailabilityFilter, setCrewAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'BUSY' | 'ON_LEAVE'>('ALL');
    const [isSavingCrew, setIsSavingCrew] = useState(false);

    // Derived State
    const liveAssignments = shoot ? allAssignments.filter(a => a.shootId === shoot.id) : [];
    const assignments = shoot?.status === 'DRAFT' ? shootDraftAssignments : liveAssignments;
    const assignmentsForMessage: Assignment[] = assignments.map(a => (
        'status' in a ? a : {
            id: a.id,
            shootId: a.shootId,
            userId: a.userId,
            role: a.role,
            status: 'ACCEPTED'
        }
    ));
    const linkedTransactions = shoot ? allTransactions.filter(t => t.shootId === shoot.id) : [];

    const canEdit = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '');
    const canEditStatus = canEdit;

    // Filter out suspended / inactive and non-assignable accounts
    const assignableUsers = useMemo(() => {
        return users.filter(u => {
            if (u.status === 'SUSPENDED' || u.active === false) return false;
            if (u.canBeAssignedToShoots === false) return false;
            return true;
        });
    }, [users]);

    // High-Performance Memoized Availability & Conflict Index (0 recalculation lag)
    const availabilityMap = useMemo(() => {
        const map = new Map<string, {
            status: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE';
            label: string;
            details: string;
            shortDetails: string;
        }>();

        if (!shoot || !shoot.startTime) {
            for (const u of assignableUsers) {
                map.set(u.id, {
                    status: 'AVAILABLE',
                    label: 'Available',
                    details: 'No schedule conflicts',
                    shortDetails: 'Available'
                });
            }
            return map;
        }

        const shootStart = new Date(shoot.startTime).getTime();
        const shootEnd = shoot.endTime ? new Date(shoot.endTime).getTime() : shootStart + 4 * 3600000;

        // Pre-parse approved leaves once
        const approvedLeaves = (allLeaves || [])
            .filter((l: Leave) => l.status === 'APPROVED')
            .map((l: Leave) => {
                const lStart = new Date(l.startDate);
                lStart.setHours(0, 0, 0, 0);
                const lEnd = new Date(l.endDate);
                lEnd.setHours(23, 59, 59, 999);
                return {
                    userId: l.userId,
                    startMs: lStart.getTime(),
                    endMs: lEnd.getTime(),
                    startDate: l.startDate,
                    endDate: l.endDate,
                    reason: l.reason
                };
            });

        // Pre-parse active other shoots once
        const otherActiveShoots = (allShoots || []).filter(s => s.id !== shoot.id && s.status !== 'CANCELLED' && s.status !== 'CLOSED' && s.startTime);
        const shootTimeMap = new Map<string, { startMs: number; endMs: number; title: string; shootNumber?: number; startTime: string; endTime?: string }>();
        for (const s of otherActiveShoots) {
            const sStart = new Date(s.startTime).getTime();
            const sEnd = s.endTime ? new Date(s.endTime).getTime() : sStart + 4 * 3600000;
            shootTimeMap.set(s.id, {
                startMs: sStart,
                endMs: sEnd,
                title: s.title,
                shootNumber: s.shootNumber,
                startTime: s.startTime,
                endTime: s.endTime
            });
        }

        // Pre-group other assignments by userId
        const otherAssignmentsByUser = new Map<string, string[]>();
        for (const a of allAssignments) {
            if (a.shootId && a.shootId !== shoot.id) {
                const list = otherAssignmentsByUser.get(a.userId) || [];
                list.push(a.shootId);
                otherAssignmentsByUser.set(a.userId, list);
            }
        }

        for (const u of assignableUsers) {
            // 1. Check leave
            const leave = approvedLeaves.find(l => l.userId === u.id && shootStart <= l.endMs && shootEnd >= l.startMs);
            if (leave) {
                const startStr = format(new Date(leave.startDate), 'MMM d');
                const endStr = format(new Date(leave.endDate), 'MMM d');
                const rangeStr = startStr === endStr ? startStr : `${startStr}–${endStr}`;
                map.set(u.id, {
                    status: 'ON_LEAVE',
                    label: 'On Leave',
                    details: `On Leave: ${rangeStr}${leave.reason ? ` (${leave.reason})` : ''}`,
                    shortDetails: `Leave: ${rangeStr}`
                });
                continue;
            }

            // 2. Check shoot conflict
            const userShootIds = otherAssignmentsByUser.get(u.id);
            let conflictingShoot: { title: string; shootNumber?: number; startTime: string; endTime?: string } | null = null;
            if (userShootIds) {
                for (const sId of userShootIds) {
                    const sInfo = shootTimeMap.get(sId);
                    if (sInfo && shootStart < sInfo.endMs && shootEnd > sInfo.startMs) {
                        conflictingShoot = sInfo;
                        break;
                    }
                }
            }

            if (conflictingShoot) {
                const timeStr = conflictingShoot.startTime ? format(new Date(conflictingShoot.startTime), 'h:mm a') : '';
                const endTimeStr = conflictingShoot.endTime ? `–${format(new Date(conflictingShoot.endTime), 'h:mm a')}` : '';
                const shootNum = conflictingShoot.shootNumber ? `#${conflictingShoot.shootNumber} ` : '';
                map.set(u.id, {
                    status: 'BUSY',
                    label: 'On Other Shoot',
                    details: `Busy: ${shootNum}${conflictingShoot.title} (${timeStr}${endTimeStr})`,
                    shortDetails: `Busy: ${shootNum}${timeStr}`
                });
                continue;
            }

            map.set(u.id, {
                status: 'AVAILABLE',
                label: 'Available',
                details: 'Available for this schedule',
                shortDetails: 'Available'
            });
        }

        return map;
    }, [shoot?.id, shoot?.startTime, shoot?.endTime, assignableUsers, allLeaves, allAssignments, allShoots]);

    // O(1) Instant Availability Lookup
    const getCrewAvailability = useCallback((userId: string) => {
        return availabilityMap.get(userId) || {
            status: 'AVAILABLE' as const,
            label: 'Available',
            details: 'No schedule conflicts',
            shortDetails: 'Available'
        };
    }, [availabilityMap]);

    // Filtered Crew Members & Counts for Minimal View
    const filteredCrewMembers = useMemo(() => {
        const q = crewSearch.trim().toLowerCase();
        return assignableUsers.filter(u => {
            const avail = getCrewAvailability(u.id);
            if (crewAvailabilityFilter === 'AVAILABLE' && avail.status !== 'AVAILABLE') return false;
            if (crewAvailabilityFilter === 'BUSY' && avail.status !== 'BUSY') return false;
            if (crewAvailabilityFilter === 'ON_LEAVE' && avail.status !== 'ON_LEAVE') return false;

            if (!q) return true;
            return (
                u.name.toLowerCase().includes(q) ||
                (u.role && u.role.toLowerCase().includes(q)) ||
                (u.phone && u.phone.includes(q)) ||
                avail.details.toLowerCase().includes(q)
            );
        });
    }, [assignableUsers, crewSearch, crewAvailabilityFilter, getCrewAvailability]);

    const crewCounts = useMemo(() => {
        let availCount = 0;
        let busyCount = 0;
        let leaveCount = 0;
        for (const u of assignableUsers) {
            const status = availabilityMap.get(u.id)?.status;
            if (status === 'AVAILABLE') availCount++;
            else if (status === 'BUSY') busyCount++;
            else if (status === 'ON_LEAVE') leaveCount++;
        }
        return {
            all: assignableUsers.length,
            available: availCount,
            busy: busyCount,
            onLeave: leaveCount
        };
    }, [assignableUsers, availabilityMap]);

    // Helper: Role / Scope badge display info
    const getRoleBadgeInfo = (role?: string) => {
        const r = (role || '').toLowerCase();
        if (r === 'incharge' || r.includes('lead')) {
            return {
                label: labels.leadLabel || 'Lead Incharge',
                icon: '⭐',
                bg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
            };
        }
        if (r.includes('setup')) {
            return {
                label: 'Setup Only',
                icon: '🛠️',
                bg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700'
            };
        }
        if (r.includes('windup') || r.includes('packup') || r.includes('wrap')) {
            return {
                label: 'Windup Only',
                icon: '📦',
                bg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700'
            };
        }
        if (r === 'full shoot' || r === 'crew' || !r) {
            return {
                label: 'Full Shoot',
                icon: '🎬',
                bg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
            };
        }
        return {
            label: getRoleLabel(role) || role,
            icon: '🎬',
            bg: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'
        };
    };

    // Helper to start inline editing for a section
    const startEditSection = (section: 'title' | 'schedule' | 'location' | 'poc' | 'description') => {
        if (!shoot || !canEdit) return;
        setEditingSection(section);
        if (section === 'title') {
            setFormTitle(shoot.title || '');
        } else if (section === 'schedule') {
            setFormStartDate(shoot.startTime ? format(parseISO(shoot.startTime), 'yyyy-MM-dd') : '');
            setFormStartTime(shoot.startTime ? format(parseISO(shoot.startTime), 'HH:mm') : '');
            setFormEndDate(shoot.endTime ? format(parseISO(shoot.endTime), 'yyyy-MM-dd') : (shoot.startTime ? format(parseISO(shoot.startTime), 'yyyy-MM-dd') : ''));
            setFormEndTime(shoot.endTime ? format(parseISO(shoot.endTime), 'HH:mm') : '');
        } else if (section === 'location') {
            const parsed = parseLocationString(shoot.location, jiraDetails?.eventLocation, jiraDetails?.eventVenue);
            setFormEventLocation(parsed.eventLocation);
            setFormEventVenue(parsed.eventVenue);
        } else if (section === 'poc') {
            setFormPocName(shoot.pocName || '');
            setFormPocContact(shoot.pocContact || '');
        } else if (section === 'description') {
            const raw = shoot.description?.trim();
            const isPlaceholder = !raw || raw.startsWith('Jira Request') || raw.startsWith('Auto-synced from Jira') || raw.toLowerCase().includes('auto-synced');
            setFormDescription((!isPlaceholder ? raw : (jiraDetails?.description || '')) || '');
        }
    };

    const cancelEditSection = () => {
        setEditingSection(null);
    };

    const saveEditSection = async (section: 'title' | 'schedule' | 'location' | 'poc' | 'description') => {
        if (!shoot) return;
        setIsSavingField(true);
        try {
            const updates: Partial<Shoot> = {};
            let logDetail = '';

            if (section === 'title') {
                if (!formTitle.trim()) {
                    showToast('Title cannot be empty', 'warning');
                    setIsSavingField(false);
                    return;
                }
                updates.title = formTitle.trim();
                logDetail = `Updated title to "${updates.title}"`;
                if (shoot.jiraTicketId) {
                    syncFieldToJira(shoot.jiraTicketId, { title: formTitle.trim() });
                }
            } else if (section === 'schedule') {
                if (!formStartDate) {
                    showToast('Start date is required', 'warning');
                    setIsSavingField(false);
                    return;
                }
                const startIso = formStartTime ? `${formStartDate}T${formStartTime}:00` : `${formStartDate}T09:00:00`;
                const endDate = formEndDate || formStartDate;
                const endIso = formEndTime ? `${endDate}T${formEndTime}:00` : (formEndDate ? `${formEndDate}T18:00:00` : undefined);

                updates.startTime = startIso;
                updates.endTime = endIso;
                logDetail = `Updated schedule`;
                if (shoot.jiraTicketId) {
                    syncFieldToJira(shoot.jiraTicketId, { startTime: startIso, endTime: endIso });
                }
            } else if (section === 'location') {
                const combinedLoc = formEventVenue.trim()
                    ? `${formEventLocation} • ${formEventVenue.trim()}`
                    : formEventLocation;
                updates.location = combinedLoc;
                logDetail = `Updated location to "${combinedLoc}"`;
                if (shoot.jiraTicketId) {
                    syncFieldToJira(shoot.jiraTicketId, { location: formEventLocation, venue: formEventVenue.trim() });
                }
            } else if (section === 'poc') {
                updates.pocName = formPocName.trim();
                updates.pocContact = formPocContact.trim();
                logDetail = `Updated Point of Contact`;
            } else if (section === 'description') {
                updates.description = formDescription.trim();
                logDetail = `Updated notes & requirements`;
                if (shoot.jiraTicketId) {
                    syncFieldToJira(shoot.jiraTicketId, { description: formDescription.trim() });
                }
            }

            const updatedShoot: Shoot = {
                ...shoot,
                ...updates,
            };

            await saveShoot(updatedShoot);
            await queryClient.invalidateQueries({ queryKey: ['shoot', shoot.id] });
            await queryClient.invalidateQueries({ queryKey: ['shoots'] });

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: logDetail,
                    departmentId: shoot.departmentId,
                });
                storage.getLogsByEntity(shoot.id).then(setLogs);
            }

            showToast('Updated successfully!', 'success');
            setEditingSection(null);
        } catch (e) {
            console.error('Failed to save field:', e);
            showToast('Failed to save changes. Please try again.', 'error');
        } finally {
            setIsSavingField(false);
        }
    };

    // Open Full Quick Edit Modal
    const openQuickEditModal = () => {
        if (!shoot || !canEdit) return;
        setFormTitle(shoot.title || '');
        setFormStartDate(shoot.startTime ? format(parseISO(shoot.startTime), 'yyyy-MM-dd') : '');
        setFormStartTime(shoot.startTime ? format(parseISO(shoot.startTime), 'HH:mm') : '');
        setFormEndDate(shoot.endTime ? format(parseISO(shoot.endTime), 'yyyy-MM-dd') : (shoot.startTime ? format(parseISO(shoot.startTime), 'yyyy-MM-dd') : ''));
        setFormEndTime(shoot.endTime ? format(parseISO(shoot.endTime), 'HH:mm') : '');
        
        const parsed = parseLocationString(shoot.location, jiraDetails?.eventLocation, jiraDetails?.eventVenue);
        setFormEventLocation(parsed.eventLocation);
        setFormEventVenue(parsed.eventVenue);

        setFormPocName(shoot.pocName || '');
        setFormPocContact(shoot.pocContact || '');

        const raw = shoot.description?.trim();
        const isPlaceholder = !raw || raw.startsWith('Jira Request') || raw.startsWith('Auto-synced from Jira') || raw.toLowerCase().includes('auto-synced');
        setFormDescription((!isPlaceholder ? raw : (jiraDetails?.description || '')) || '');

        const currentCrewIds = assignments.map(a => a.userId);
        const incharge = assignments.find(a => a.role === 'Incharge')?.userId || '';
        const rolesMap: Record<string, string> = {};
        assignments.forEach(a => {
            rolesMap[a.userId] = a.role || (a.userId === incharge ? 'Incharge' : 'Full Shoot');
        });

        setSelectedCrewIds(currentCrewIds);
        setSelectedCrewRoles(rolesMap);
        setSelectedInchargeId(incharge);
        setCrewSearch('');
        setCrewAvailabilityFilter('ALL');
        setIsQuickEditModalOpen(true);
    };

    const handleSaveFullQuickEdit = async () => {
        if (!shoot) return;
        if (!formTitle.trim()) {
            showToast('Title cannot be empty', 'warning');
            return;
        }
        if (!formStartDate) {
            showToast('Start date is required', 'warning');
            return;
        }

        setIsSavingField(true);
        try {
            const startIso = formStartTime ? `${formStartDate}T${formStartTime}:00` : `${formStartDate}T09:00:00`;
            const endDate = formEndDate || formStartDate;
            const endIso = formEndTime ? `${endDate}T${formEndTime}:00` : (formEndDate ? `${formEndDate}T18:00:00` : undefined);

            const combinedLoc = formEventVenue.trim()
                ? `${formEventLocation} • ${formEventVenue.trim()}`
                : formEventLocation;

            const updatedShoot: Shoot = {
                ...shoot,
                title: formTitle.trim(),
                startTime: startIso,
                endTime: endIso,
                location: combinedLoc,
                pocName: formPocName.trim(),
                pocContact: formPocContact.trim(),
                description: formDescription.trim(),
            };

            await saveShoot(updatedShoot);

            // Synchronize crew assignments as well
            await syncCrewAssignments(selectedCrewIds, selectedCrewRoles, selectedInchargeId);

            // Sync to Jira if linked
            if (shoot.jiraTicketId) {
                syncFieldToJira(shoot.jiraTicketId, {
                    title: formTitle.trim(),
                    startTime: startIso,
                    endTime: endIso,
                    location: formEventLocation,
                    venue: formEventVenue.trim(),
                    description: formDescription.trim(),
                });
            }

            await queryClient.invalidateQueries({ queryKey: ['shoot', shoot.id] });
            await queryClient.invalidateQueries({ queryKey: ['shoots'] });

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Quick updated shoot details`,
                    departmentId: shoot.departmentId,
                });
                storage.getLogsByEntity(shoot.id).then(setLogs);
            }

            showToast('Shoot updated successfully!', 'success');
            setIsQuickEditModalOpen(false);
        } catch (e) {
            console.error('Failed to save quick edit:', e);
            showToast('Failed to save changes. Please try again.', 'error');
        } finally {
            setIsSavingField(false);
        }
    };

    // Open Crew Assignment Modal
    const openCrewModal = () => {
        if (!shoot || !canEdit) return;
        const currentCrewIds = assignments.map(a => a.userId);
        const incharge = assignments.find(a => a.role === 'Incharge')?.userId || '';
        const rolesMap: Record<string, string> = {};
        assignments.forEach(a => {
            rolesMap[a.userId] = a.role || (a.userId === incharge ? 'Incharge' : 'Full Shoot');
        });

        setSelectedCrewIds(currentCrewIds);
        setSelectedCrewRoles(rolesMap);
        setSelectedInchargeId(incharge);
        setCrewSearch('');
        setCrewAvailabilityFilter('ALL');
        setIsCrewModalOpen(true);
    };

    // Shared Crew Sync Helper (Atomic multi-day segments, craft roles, scopes, custom hours, and deferred cross-shoot swaps)
    const syncCrewAssignments = async (
        crewIds: string[],
        rolesMap: Record<string, string>,
        inchargeId: string,
        scopesMap: Record<string, string> = {},
        memberDays?: Record<string, string[]>,
        memberCustomHours?: Record<string, { startTime: string; endTime: string }>,
        pendingSwaps?: Array<{ thisUserId: string; otherShootId: string; otherUserId: string; otherAssignmentId?: string }>
    ) => {
        if (!shoot) return;

        // 1. Atomically execute any staged cross-shoot swaps
        if (pendingSwaps && pendingSwaps.length > 0) {
            for (const swap of pendingSwaps) {
                const targetAssignment = allAssignments.find(
                    a => a.shootId === swap.otherShootId && a.userId === swap.otherUserId
                );
                if (targetAssignment) {
                    await storage.saveAssignments([{
                        ...targetAssignment,
                        userId: swap.thisUserId
                    }]);
                }
            }
        }

        const currentAssignments = allAssignments.filter(a => a.shootId === shoot.id);
        const currentDraftAssignments = shootDraftAssignments.filter(a => a.shootId === shoot.id);

        if (shoot.status === 'DRAFT') {
            const toRemoveLive = currentAssignments;
            if (toRemoveLive.length > 0) {
                await storage.deleteAssignmentSegmentsByAssignmentIds(toRemoveLive.map(a => a.id));
                await Promise.all(toRemoveLive.map(a => storage.deleteAssignment(a.id)));
            }

            const selectedCrewSet = new Set(crewIds);
            const draftIdsToRemove = currentDraftAssignments
                .filter(a => !selectedCrewSet.has(a.userId))
                .map(a => a.id);

            if (draftIdsToRemove.length > 0) {
                await storage.deletePlannerDraftAssignments(draftIdsToRemove);
            }

            const draftsToSave: PlannerDraftAssignment[] = crewIds.map(userId => {
                const existing = currentDraftAssignments.find(a => a.userId === userId);
                const assignedRole = rolesMap[userId] || (users.find(u => u.id === userId)?.role || 'Crew');
                return {
                    id: existing?.id || crypto.randomUUID(),
                    shootId: shoot.id,
                    userId,
                    role: assignedRole,
                    createdBy: existing?.createdBy || user?.id,
                    createdAt: existing?.createdAt || new Date().toISOString(),
                    departmentId: shoot.departmentId
                };
            });

            if (draftsToSave.length > 0) {
                await storage.savePlannerDraftAssignments(draftsToSave);
            }
            const updatedDrafts = await storage.getPlannerDraftAssignments(shoot.departmentId);
            setShootDraftAssignments(updatedDrafts.filter(d => d.shootId === shoot.id));
        } else {
            const existingUserIds = currentAssignments.map(a => a.userId);
            const toRemove = currentAssignments.filter(a => !crewIds.includes(a.userId));
            if (toRemove.length > 0) {
                await storage.deleteAssignmentSegmentsByAssignmentIds(toRemove.map(a => a.id));
                await Promise.all(toRemove.map(a => storage.deleteAssignment(a.id)));
            }

            const toAdd = crewIds.filter(userId => !existingUserIds.includes(userId));
            const newAssignments = toAdd.map(userId => {
                const assignedRole = rolesMap[userId] || (users.find(u => u.id === userId)?.role || 'Crew');
                return {
                    id: crypto.randomUUID(),
                    shootId: shoot.id,
                    userId,
                    role: assignedRole,
                    status: 'ACCEPTED' as const,
                    departmentId: shoot.departmentId
                };
            });

            // Update role on existing assignments if changed
            const assignmentsToUpdate: Assignment[] = [];
            for (const a of currentAssignments) {
                if (crewIds.includes(a.userId)) {
                    const targetRole = rolesMap[a.userId] || (users.find(u => u.id === a.userId)?.role || 'Crew');
                    if (a.role !== targetRole) {
                        assignmentsToUpdate.push({
                            ...a,
                            role: targetRole
                        });
                    }
                }
            }

            if (assignmentsToUpdate.length > 0) {
                await storage.saveAssignments(assignmentsToUpdate);
            }

            if (newAssignments.length > 0) {
                await storage.saveAssignments(newAssignments);
            }

            // Save Assignment Segments with proper daily hours & custom timing calculation
            const allCurrentAndNew = [...currentAssignments.filter(a => crewIds.includes(a.userId)), ...newAssignments];
            
            // Always clean up existing segments first
            if (allCurrentAndNew.length > 0) {
                await storage.deleteAssignmentSegmentsByAssignmentIds(allCurrentAndNew.map(a => a.id));
            }

            if (memberDays && shoot.startTime) {
                const shootStartDateStr = format(parseISO(shoot.startTime), 'yyyy-MM-dd');
                const shootEndDateStr = shoot.endTime ? format(parseISO(shoot.endTime), 'yyyy-MM-dd') : shootStartDateStr;
                const isMulti = shootStartDateStr !== shootEndDateStr;

                const segmentsToSave: any[] = [];
                for (const a of allCurrentAndNew) {
                    const userDays = memberDays[a.userId];
                    const userScope = scopesMap[a.userId] || 'Full Shoot';
                    const customTiming = memberCustomHours?.[a.userId];

                    if (userDays && userDays.length > 0) {
                        for (const dayStr of userDays) {
                            let segStartTime = `${dayStr}T09:00:00`;
                            let segEndTime = `${dayStr}T18:00:00`;

                            if (userScope === 'Custom Hours' && customTiming) {
                                segStartTime = `${dayStr}T${customTiming.startTime}:00`;
                                segEndTime = `${dayStr}T${customTiming.endTime}:00`;
                            } else if (!isMulti) {
                                segStartTime = shoot.startTime;
                                segEndTime = shoot.endTime || `${dayStr}T18:00:00`;
                            } else {
                                if (dayStr === shootStartDateStr) {
                                    segStartTime = shoot.startTime;
                                    segEndTime = `${dayStr}T21:00:00`;
                                } else if (dayStr === shootEndDateStr && shoot.endTime) {
                                    segStartTime = `${dayStr}T06:00:00`;
                                    segEndTime = shoot.endTime;
                                }
                            }

                            // Adjust for Setup / Windup scope
                            if (userScope === 'Setup Only') {
                                const startIso = parseISO(segStartTime);
                                const endSetup = new Date(startIso.getTime() + 3 * 3600000);
                                segEndTime = endSetup.toISOString();
                            } else if (userScope === 'Windup Only') {
                                const endIso = parseISO(segEndTime);
                                const startWindup = new Date(endIso.getTime() - 3 * 3600000);
                                segStartTime = startWindup.toISOString();
                            }

                            segmentsToSave.push({
                                id: crypto.randomUUID(),
                                assignmentId: a.id,
                                shootId: shoot.id,
                                userId: a.userId,
                                startTime: segStartTime,
                                endTime: segEndTime,
                                role: a.role,
                                departmentId: shoot.departmentId
                            });
                        }
                    }
                }

                if (segmentsToSave.length > 0) {
                    await storage.saveAssignmentSegments(segmentsToSave);
                }
            }
        }
    };

    const handleSaveCrewModal = async () => {
        if (!shoot) return;
        setIsSavingCrew(true);
        try {
            await syncCrewAssignments(selectedCrewIds, selectedCrewRoles, selectedInchargeId);

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Updated crew assignments (${selectedCrewIds.length} assigned)`,
                    departmentId: shoot.departmentId
                });
                storage.getLogsByEntity(shoot.id).then(setLogs);
            }

            await queryClient.invalidateQueries({ queryKey: ['assignments'] });
            await queryClient.invalidateQueries({ queryKey: ['shoots'] });
            showToast('Crew assignments updated!', 'success');
            setIsCrewModalOpen(false);
        } catch (e) {
            console.error('Failed to update crew:', e);
            showToast('Failed to update crew. Please try again.', 'error');
        } finally {
            setIsSavingCrew(false);
        }
    };

    const handleRemoveSingleCrew = async (assignmentId: string, userName: string) => {
        if (!shoot || !canEdit) return;
        try {
            if (shoot.status === 'DRAFT') {
                await storage.deletePlannerDraftAssignments([assignmentId]);
                const updatedDrafts = await storage.getPlannerDraftAssignments(shoot.departmentId);
                setShootDraftAssignments(updatedDrafts.filter(d => d.shootId === shoot.id));
            } else {
                await storage.deleteAssignmentSegmentsByAssignmentIds([assignmentId]);
                await storage.deleteAssignment(assignmentId);
            }

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Removed ${userName} from crew`,
                    departmentId: shoot.departmentId
                });
                storage.getLogsByEntity(shoot.id).then(setLogs);
            }

            await queryClient.invalidateQueries({ queryKey: ['assignments'] });
            await queryClient.invalidateQueries({ queryKey: ['shoots'] });
            showToast(`Removed ${userName}`, 'info');
        } catch (e) {
            console.error('Failed to remove crew member:', e);
            showToast('Failed to remove crew member', 'error');
        }
    };

    const handleUpdateStatus = async (newStatus: ShootStatus) => {
        if (!shoot) return;
        if (newStatus === 'CANCELLED') {
            setIsCancelModalOpen(true);
            return;
        }
        if (shoot.status === newStatus) return;

        // Guard Rule: Cannot set status to Ready for Shoot without assigned cameramen / crew
        if (newStatus === 'READY_FOR_SHOOT' || newStatus === 'CONFIRMED') {
            if (assignments.length === 0) {
                showToast('Please assign cameramen / crew before setting status to Ready for Shoot.', 'error');
                openCrewModal();
                return;
            }
        }

        try {
            setIsUpdatingStatus(true);
            const updatedShoot: Shoot = {
                ...shoot,
                status: newStatus,
                cancellationReason: undefined
            };

            await saveShoot(updatedShoot);
            await queryClient.invalidateQueries({ queryKey: [['shoots', id], ['shoots'], ['shoots', shoot.id]] });

            if (shoot.jiraTicketId) {
                fetch('/api/jira/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketKey: shoot.jiraTicketId, status: newStatus })
                }).catch(err => console.debug('[Jira Status Sync]:', err));

                // Automation: If status is changed to READY_FOR_SHOOT or CONFIRMED, automatically post public crew notification comment to Jira
                if (newStatus === 'READY_FOR_SHOOT' || newStatus === 'CONFIRMED') {
                    const assignedUsers = assignments
                        .map(a => users.find(u => u.id === a.userId))
                        .filter((u): u is User => Boolean(u));

                    if (assignedUsers.length > 0) {
                        const crewText = assignedUsers
                            .map(u => u.phone ? `${u.name}-${u.phone}` : u.name)
                            .join(', ');

                        const deptTitle = pageDepartment?.name
                            ? (pageDepartment.name === 'Video Publication' ? 'Video Publications' : pageDepartment.name)
                            : 'Video Publications';

                        const autoCommentBody = `Namaskaram\n\nPlease find the cameramen for this shoot & their contact numbers below\n${crewText}\n\nPranam\n${deptTitle}`;

                        try {
                            const commentRes = await fetch(`/api/jira/ticket/${encodeURIComponent(shoot.jiraTicketId)}/comments`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    body: autoCommentBody,
                                    isInternal: false,
                                    authorName: user?.name || 'System'
                                })
                            });

                            if (commentRes.ok) {
                                fetchJiraComments();
                            }
                        } catch (commentErr) {
                            console.error('[Jira Auto Comment Error]:', commentErr);
                        }
                    }
                }
            }

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Changed status from ${shoot.status.replace(/_/g, ' ')} to ${newStatus.replace(/_/g, ' ')}`,
                    departmentId: shoot.departmentId
                });
                storage.getLogsByEntity(shoot.id).then(setLogs);
            }

            if (newStatus === 'READY_FOR_SHOOT' || newStatus === 'CONFIRMED') {
                showToast('Status updated & cameramen notified to Jira!', 'success');
            } else {
                showToast(`Status updated to ${newStatus.replace(/_/g, ' ')}`, 'success');
            }
        } catch (error) {
            console.error('Failed to update status:', error);
            showToast('Failed to update status. Please try again.', 'error');
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'OPEN':
                return { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc', label: 'OPEN' };
            case 'WAITING_FOR_REQUESTER':
                return { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1', label: 'WAITING FOR REQUESTER' };
            case 'PENDING_PRODUCTION_SETUP':
                return { bg: '#ffedd5', text: '#c2410c', border: '#fdba74', label: 'PENDING SETUP' };
            case 'READY_FOR_SHOOT':
            case 'CONFIRMED':
                return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', label: status === 'CONFIRMED' ? 'CONFIRMED' : 'READY FOR SHOOT' };
            case 'SHOOT_IN_PROGRESS':
                return { bg: '#dcfce7', text: '#15803d', border: '#86efac', label: 'IN PROGRESS' };
            case 'ON_HOLD':
                return { bg: '#fef3c7', text: '#b45309', border: '#fcd34d', label: 'ON HOLD' };
            case 'CLOSED':
                return { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe', label: 'CLOSED' };
            case 'CANCELLED':
                return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'CANCELLED' };
            case 'DRAFT':
                return { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db', label: 'DRAFT' };
            default:
                return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: status.replace(/_/g, ' ') };
        }
    };

    useEffect(() => {
        if (shoot?.id) {
            storage.getLogsByEntity(shoot.id).then(setLogs);
        }
    }, [shoot?.id]);

    useEffect(() => {
        if (!shoot?.id || shoot.status !== 'DRAFT') {
            setShootDraftAssignments([]);
            return;
        }

        storage.getPlannerDraftAssignments(shoot.departmentId)
            .then(drafts => setShootDraftAssignments(drafts.filter(draft => draft.shootId === shoot.id)))
            .catch(error => {
                console.error('Failed to load draft shoot assignments:', error);
                setShootDraftAssignments([]);
            });
    }, [shoot?.departmentId, shoot?.id, shoot?.status]);

    const handleSaveFixedExpenses = async () => {
        if (!shoot) return;

        const hasChanges = FIXED_EXPENSE_TYPES.some(type => {
            const existing = shoot.expenses?.find(e => e.type === type);
            const oldVal = existing?.amount || 0;
            const newVal = Number(expenseAmounts[type]) || 0;
            const oldCampaign = existing?.campaign || '';
            const newCampaign = selectedCampaign || '';
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

    const handleCancelShoot = () => {
        setIsCancelModalOpen(true);
    };

    const handleConfirmCancel = async (reason: string) => {
        if (!shoot) return;
        setIsCancelling(true);

        try {
            let calendarError = null;
            if (shoot.googleEventId) {
                try {
                    const tokens = await getGoogleProviderToken();
                    if (tokens && tokens.accessToken) {
                        await deleteGoogleCalendarEvent(shoot.googleEventId, tokens);
                    }
                } catch (calErr: any) {
                    console.error('Failed to remove Google Calendar event during shoot cancellation:', calErr);
                    calendarError = calErr.message || 'Unknown calendar error';
                }
            }

            const updatedShoot: Shoot = {
                ...shoot,
                status: 'CANCELLED',
                googleEventId: undefined,
                cancellationReason: reason
            };

            await saveShoot(updatedShoot);
            await queryClient.invalidateQueries({ queryKey: [['shoots', id], ['shoots'], ['shoots', shoot.id]] });

            if (shoot.jiraTicketId) {
                fetch('/api/jira/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketKey: shoot.jiraTicketId, status: 'CANCELLED' })
                }).catch(err => console.debug('[Jira Status Sync]:', err));
            }

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'EDIT',
                    entityId: shoot.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Cancelled ${labels.workLower}${reason ? `: ${reason}` : ''}`,
                    departmentId: shoot.departmentId
                });
                storage.getLogsByEntity(shoot.id).then(setLogs);
            }

            showToast(`${labels.workSingular} cancelled successfully`, 'info');
            setIsCancelModalOpen(false);

        } catch (error) {
            console.error(`Failed to cancel ${labels.workLower}:`, error);
            showToast(`Failed to cancel ${labels.workLower}. Please try again.`, 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const handleConfirmCancelShoot = async () => {
        if (!shoot || isCancelling) return;
        await handleConfirmCancel(cancelReason.trim());
    };

    const handleSyncToCalendar = async () => {
        if (!shoot || isSyncing) return;

        setIsSyncing(true);
        try {
            const tokens = await getGoogleProviderToken();
            if (!tokens || !tokens.accessToken) {
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
            const event = await createGoogleCalendarEvent(shoot, assignedCrew, tokens, labels);

            if (event?.id) {
                await storage.saveShoot({
                    ...shoot,
                    googleEventId: event.id
                });

                await queryClient.invalidateQueries({ queryKey: [['shoots', id], ['shoots'], ['shoots', shoot.id]] });

                showToast(`Successfully synced to Google Calendar (${assignedCrew.filter(c => c.email).length} invites sent)`, 'success');
            }
        } catch (error: unknown) {
            console.error('Failed to sync to calendar:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            showToast('Calendar sync failed: ' + message, 'error');
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
                    <p className="text-muted-foreground">Loading {labels.workLower} details...</p>
                </div>
            </div>
        );
    }

    if (!shoot) return null;

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
                        You are not assigned to this {labels.workLower}. Only assigned {labels.teamPluralLower} members can view the details.
                    </p>
                    <Link href="/shoots">
                        <Button>Back to {labels.workPlural}</Button>
                    </Link>
                </div>
            );
        }
    }

    const currentStatusStyle = getStatusStyle(shoot.status);

    return (
        <div className="max-w-[1600px] mx-auto w-full space-y-5 animate-fade-in pb-12 p-3 sm:p-5">
            {/* Unified Hero Header & Quick Specs Card */}
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs relative z-20">
                {/* Main Header Row: Title & Action Toolbar */}
                <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        {/* Left: Metadata & Title */}
                        <div className="space-y-2 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5 text-sm">
                                {shoot.shootNumber && (
                                    <span className="font-mono text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 rounded-md shrink-0">
                                        #{shoot.shootNumber}
                                    </span>
                                )}

                                <span
                                    style={{
                                        backgroundColor: currentStatusStyle.bg,
                                        color: currentStatusStyle.text,
                                        border: `1px solid ${currentStatusStyle.border}`,
                                    }}
                                    className="text-xs font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 inline-flex items-center justify-center whitespace-nowrap"
                                >
                                    {currentStatusStyle.label || shoot.status.replace(/_/g, ' ')}
                                </span>

                                {shoot.googleEventId && (
                                    <a
                                        href={`https://calendar.google.com/calendar/event?eid=${shoot.googleEventId}&ctz=Asia/Kolkata`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-0.5 rounded-md transition-colors border border-primary/20 shrink-0"
                                        title="View in Google Calendar"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        <span>Calendar Synced</span>
                                    </a>
                                )}

                                <span className="text-gray-400 dark:text-gray-500">•</span>

                                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                    Added by <strong className="font-semibold text-gray-800 dark:text-gray-200">{getUserName(shoot.createdBy)}</strong>
                                </span>
                            </div>

                            {/* Editable Shoot Title */}
                            {editingSection === 'title' ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="text"
                                        value={formTitle}
                                        onChange={(e) => setFormTitle(e.target.value)}
                                        className="flex-1 text-lg sm:text-2xl font-bold rounded-xl border border-primary/50 bg-white dark:bg-zinc-800 px-3 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
                                        placeholder="Shoot Title"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => saveEditSection('title')}
                                        disabled={isSavingField}
                                        className="p-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shrink-0 shadow-xs cursor-pointer"
                                        title="Save Title"
                                    >
                                        {isSavingField ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    </button>
                                    <button
                                        onClick={cancelEditSection}
                                        disabled={isSavingField}
                                        className="p-2 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors shrink-0 cursor-pointer"
                                        title="Cancel"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2.5 group/title">
                                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight break-words">
                                        {shoot.title}
                                    </h1>
                                    {canEdit && (
                                        <button
                                            onClick={() => startEditSection('title')}
                                            className="opacity-0 group-hover/title:opacity-100 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all shrink-0 cursor-pointer"
                                            title="Edit Title"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right: Sleek Action Toolbar */}
                        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap shrink-0">
                            {/* WhatsApp */}
                            <button
                                onClick={() => {
                                    if (assignmentsForMessage.length === 0) {
                                        showToast('Please add crew before sending WhatsApp call sheet', 'error');
                                        return;
                                    }
                                    setIsWhatsAppModalOpen(true);
                                }}
                                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-semibold transition-all shadow-xs active:scale-95 text-white text-xs sm:text-sm whitespace-nowrap cursor-pointer ${
                                    assignmentsForMessage.length === 0
                                        ? 'bg-gray-400 dark:bg-gray-600 hover:bg-gray-500'
                                        : 'bg-[#25D366] hover:bg-[#22bf5b] hover:shadow-green-500/20'
                                }`}
                                title={assignmentsForMessage.length === 0 ? 'Please add crew first' : 'Share Call Sheet via WhatsApp'}
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="shrink-0">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                </svg>
                                <span>WhatsApp</span>
                            </button>

                            {/* Copy Info */}
                            <button
                                onClick={async (e) => {
                                    if (assignmentsForMessage.length === 0) {
                                        showToast('Please add crew before copying WhatsApp message', 'error');
                                        return;
                                    }
                                    const btn = e.currentTarget;
                                    const originalContent = btn.innerHTML;
                                    const message = formatWhatsAppMessage(shoot, assignmentsForMessage, users, labels);
                                    try {
                                        await navigator.clipboard.writeText(message);
                                        btn.innerHTML = `<svg class="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg> <span>Copied</span>`;
                                        btn.classList.add('bg-green-50', 'dark:bg-green-900/20', 'border-green-300', 'text-green-700', 'dark:text-green-300');
                                        setTimeout(() => {
                                            btn.innerHTML = originalContent;
                                            btn.classList.remove('bg-green-50', 'dark:bg-green-900/20', 'border-green-300', 'text-green-700', 'dark:text-green-300');
                                        }, 2000);
                                    } catch (err) {
                                        console.error('Failed to copy', err);
                                    }
                                }}
                                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all shadow-xs bg-white dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 text-xs sm:text-sm whitespace-nowrap cursor-pointer ${
                                    assignmentsForMessage.length === 0
                                        ? 'text-gray-400 dark:text-gray-500 hover:text-amber-500'
                                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800'
                                }`}
                                title={assignmentsForMessage.length === 0 ? 'Please add crew first' : 'Copy Call Sheet'}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span>Copy Info</span>
                            </button>

                            {/* Jira Link */}
                            {shoot.jiraTicketId && (
                                <a
                                    href={`https://${APP_CONFIG.jiraDomain}/browse/${shoot.jiraTicketId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono font-semibold transition-all shadow-xs bg-[#0052CC]/10 hover:bg-[#0052CC]/20 text-[#0052CC] dark:text-[#4c9aff] border border-[#0052CC]/20 text-xs sm:text-sm whitespace-nowrap"
                                    title={`Open ${shoot.jiraTicketId} in Jira`}
                                >
                                    <JiraIcon className="w-4 h-4 shrink-0" />
                                    <span>{shoot.jiraTicketId}</span>
                                </a>
                            )}

                            {canEdit && (
                                <>
                                    {/* In-Place Quick Edit Button */}
                                    <button
                                        onClick={openQuickEditModal}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-medium transition-all shadow-xs bg-white dark:bg-zinc-800/80 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 text-xs sm:text-sm whitespace-nowrap cursor-pointer"
                                        title="Quick Edit Shoot Details"
                                    >
                                        <Edit className="w-4 h-4 text-gray-500" />
                                        <span>Edit</span>
                                    </button>

                                    {/* Status Change Dropdown */}
                                    <div className="relative" ref={actionStatusMenuRef}>
                                        <button
                                            type="button"
                                            onClick={() => setIsActionStatusMenuOpen(!isActionStatusMenuOpen)}
                                            disabled={isUpdatingStatus}
                                            style={{
                                                backgroundColor: currentStatusStyle.bg,
                                                color: currentStatusStyle.text,
                                                borderColor: currentStatusStyle.border,
                                            }}
                                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap border transition-all shadow-2xs hover:opacity-90 active:scale-95 cursor-pointer"
                                            title="Change shoot status"
                                        >
                                            {isUpdatingStatus ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: currentStatusStyle.text }} />
                                            )}
                                            <span>{currentStatusStyle.label || shoot.status.replace(/_/g, ' ')}</span>
                                            <ChevronDown size={14} className={`transition-transform duration-200 opacity-70 ${isActionStatusMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isActionStatusMenuOpen && (
                                            <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
                                                <div className="px-2.5 py-1.5 mb-1 border-b border-gray-100 dark:border-gray-800">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Change Status</span>
                                                </div>
                                                <div className="space-y-0.5">
                                                    {STATUS_OPTIONS.map((opt) => {
                                                        const isActive = shoot.status === opt.key || (opt.key === 'READY_FOR_SHOOT' && shoot.status === 'CONFIRMED');
                                                        return (
                                                            <button
                                                                key={opt.key}
                                                                type="button"
                                                                onClick={() => {
                                                                    setIsActionStatusMenuOpen(false);
                                                                    handleUpdateStatus(opt.key);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm flex items-center justify-between transition-colors cursor-pointer ${
                                                                    isActive
                                                                        ? 'bg-primary/10 text-primary font-bold'
                                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.text }} />
                                                                    <div className="truncate">
                                                                        <p className="font-semibold truncate text-xs sm:text-sm">{opt.label}</p>
                                                                    </div>
                                                                </div>
                                                                {isActive && <CheckCircle2 size={14} className="text-primary shrink-0 ml-1" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Integrated 4-Tile Specs Bar with In-Place Editing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800 bg-gray-50/50 dark:bg-zinc-900/40 rounded-b-2xl overflow-hidden">
                    {/* 1. Schedule Tile */}
                    <div className="p-4 sm:p-5 flex items-start gap-3.5 relative group/tile">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                            <Calendar size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 block">Schedule</span>
                                {canEdit && editingSection !== 'schedule' && (
                                    <button
                                        onClick={() => startEditSection('schedule')}
                                        className="opacity-0 group-hover/tile:opacity-100 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all cursor-pointer"
                                        title="Edit Schedule Date & Time"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                )}
                            </div>

                            {editingSection === 'schedule' ? (
                                <div className="space-y-2 mt-1 animate-in fade-in duration-150">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Start Date & Time</label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <input
                                                type="date"
                                                value={formStartDate}
                                                onChange={(e) => setFormStartDate(e.target.value)}
                                                className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white"
                                            />
                                            <input
                                                type="time"
                                                value={formStartTime}
                                                onChange={(e) => setFormStartTime(e.target.value)}
                                                className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">End Date & Time</label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <input
                                                type="date"
                                                value={formEndDate}
                                                onChange={(e) => setFormEndDate(e.target.value)}
                                                className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white"
                                            />
                                            <input
                                                type="time"
                                                value={formEndTime}
                                                onChange={(e) => setFormEndTime(e.target.value)}
                                                className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 pt-1">
                                        <button
                                            onClick={() => saveEditSection('schedule')}
                                            disabled={isSavingField}
                                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 flex items-center gap-1 cursor-pointer"
                                        >
                                            {isSavingField ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                            Save
                                        </button>
                                        <button
                                            onClick={cancelEditSection}
                                            disabled={isSavingField}
                                            className="px-2 py-1 rounded-md text-xs font-medium bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-tight">
                                        {(() => {
                                            if (!shoot.startTime) return 'Date Not Set';
                                            const startDate = parseISO(shoot.startTime);
                                            const endDate = shoot.endTime ? parseISO(shoot.endTime) : null;
                                            if (endDate && !isSameDay(startDate, endDate)) {
                                                return `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`;
                                            }
                                            return format(startDate, 'MMM d, yyyy');
                                        })()}
                                    </p>
                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">
                                        {(() => {
                                            if (!shoot.startTime) return 'Time not set';
                                            const start = format(parseISO(shoot.startTime), 'h:mm a');
                                            const end = shoot.endTime ? format(parseISO(shoot.endTime), 'h:mm a') : '';
                                            return end ? `${start} – ${end}` : start;
                                        })()}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 2. Location Tile */}
                    <div className="p-4 sm:p-5 flex items-start gap-3.5 relative group/tile">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                            <MapPin size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 block">Location</span>
                                {canEdit && editingSection !== 'location' && (
                                    <button
                                        onClick={() => startEditSection('location')}
                                        className="opacity-0 group-hover/tile:opacity-100 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all cursor-pointer"
                                        title="Edit Location"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                )}
                            </div>

                            {editingSection === 'location' ? (
                                <div className="space-y-2 mt-1 animate-in fade-in duration-150">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">
                                            Event Location
                                        </label>
                                        <select
                                            value={formEventLocation}
                                            onChange={(e) => setFormEventLocation(e.target.value)}
                                            className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white cursor-pointer"
                                        >
                                            {EVENT_LOCATION_OPTIONS.map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">
                                            Event Venue
                                        </label>
                                        <input
                                            type="text"
                                            value={formEventVenue}
                                            onChange={(e) => setFormEventVenue(e.target.value)}
                                            placeholder="e.g. Adiyogi, Spanda Hall, Dhyanalinga..."
                                            className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1.5 pt-0.5">
                                        <button
                                            onClick={() => saveEditSection('location')}
                                            disabled={isSavingField}
                                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 flex items-center gap-1 cursor-pointer"
                                        >
                                            {isSavingField ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                            Save
                                        </button>
                                        <button
                                            onClick={cancelEditSection}
                                            disabled={isSavingField}
                                            className="px-2 py-1 rounded-md text-xs font-medium bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-tight truncate" title={shoot.location || 'Location TBD'}>
                                        {shoot.location ? shoot.location.split('•')[0].trim() : 'Location TBD'}
                                    </p>
                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium truncate">
                                        {shoot.location && shoot.location.includes('•') ? shoot.location.split('•').slice(1).join('•').trim() : (jiraDetails?.eventVenue || jiraDetails?.indoorOutdoor || 'Venue TBD')}
                                        {jiraDetails?.indoorOutdoor && !shoot.location?.includes(jiraDetails.indoorOutdoor) ? ` • ${jiraDetails.indoorOutdoor}` : ''}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 3. Point of Contact Tile */}
                    <div className="p-4 sm:p-5 flex items-start gap-3.5 relative group/tile">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                            <UserIcon size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 block">Point of Contact</span>
                                {canEdit && editingSection !== 'poc' && (
                                    <button
                                        onClick={() => startEditSection('poc')}
                                        className="opacity-0 group-hover/tile:opacity-100 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all cursor-pointer"
                                        title="Edit Point of Contact"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                )}
                            </div>

                            {editingSection === 'poc' ? (
                                <div className="space-y-1.5 mt-1 animate-in fade-in duration-150">
                                    <input
                                        type="text"
                                        value={formPocName}
                                        onChange={(e) => setFormPocName(e.target.value)}
                                        placeholder="POC Name"
                                        className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white"
                                    />
                                    <input
                                        type="text"
                                        value={formPocContact}
                                        onChange={(e) => setFormPocContact(e.target.value)}
                                        placeholder="Phone or Email"
                                        className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-1.5 text-gray-900 dark:text-white"
                                    />
                                    <div className="flex items-center gap-1.5 pt-0.5">
                                        <button
                                            onClick={() => saveEditSection('poc')}
                                            disabled={isSavingField}
                                            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 flex items-center gap-1 cursor-pointer"
                                        >
                                            {isSavingField ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                            Save
                                        </button>
                                        <button
                                            onClick={cancelEditSection}
                                            disabled={isSavingField}
                                            className="px-2 py-1 rounded-md text-xs font-medium bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-tight truncate" title={shoot.pocName || jiraDetails?.reporter || 'No POC'}>
                                        {shoot.pocName || jiraDetails?.reporter || 'No POC'}
                                    </p>
                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono truncate" title={shoot.pocContact || jiraDetails?.reporterEmail || ''}>
                                        {shoot.pocContact || jiraDetails?.reporterEmail || (jiraDetails?.assignee ? `Assignee: ${jiraDetails.assignee}` : '-')}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 4. Production Specs Tile */}
                    <div className="p-4 sm:p-5 flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                            <Layers size={20} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-0.5">Production Specs</span>
                            <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-tight truncate">
                                {jiraDetails?.language || 'English'}
                                {jiraDetails?.liveTranslation && jiraDetails.liveTranslation !== 'No Translation' && jiraDetails.liveTranslation !== 'No Live Translation' ? ` • Translation` : ''}
                            </p>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium truncate">
                                {jiraDetails?.audienceSize ? `Audience: ${jiraDetails.audienceSize}` : 'Standard Video Coverage'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cancelled Banner */}
            {shoot.status === 'CANCELLED' && shoot.cancellationReason && (
                <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4 text-sm">
                    <p className="font-bold uppercase tracking-wide text-red-700 dark:text-red-300 text-xs">Cancellation Reason</p>
                    <p className="mt-1 text-red-900 dark:text-red-100 whitespace-pre-wrap">{shoot.cancellationReason}</p>
                </div>
            )}

            {/* 2-Column Responsive Layout: Left (People & Expenses) + Right (Checkouts, Meta & Activity) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Column (7 cols): Crew & Expenses */}
                <div className="lg:col-span-7 space-y-5">
                    {/* Requester Notes & Requirements (Editable In-Place) */}
                    <div className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800 shadow-xs relative group/notes">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <MessageSquare size={16} className="text-primary" />
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Requester Notes & Requirements
                                </span>
                            </div>
                            {canEdit && editingSection !== 'description' && (
                                <button
                                    onClick={() => startEditSection('description')}
                                    className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all flex items-center gap-1 text-xs font-medium cursor-pointer"
                                    title="Edit Notes"
                                >
                                    <Pencil size={13} />
                                    <span>Edit</span>
                                </button>
                            )}
                        </div>

                        {editingSection === 'description' ? (
                            <div className="space-y-2 mt-1 animate-in fade-in duration-150">
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    rows={4}
                                    placeholder="Enter shoot notes, requirements, or client brief..."
                                    className="w-full text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-zinc-900/50 p-3 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-y"
                                    autoFocus
                                />
                                <div className="flex items-center gap-2 justify-end">
                                    <button
                                        onClick={cancelEditSection}
                                        disabled={isSavingField}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => saveEditSection('description')}
                                        disabled={isSavingField}
                                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 flex items-center gap-1 shadow-xs cursor-pointer"
                                    >
                                        {isSavingField ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                        Save Notes
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm sm:text-base leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {(() => {
                                    const text = (jiraDetails?.description !== undefined ? jiraDetails.description : shoot.description)?.trim() || '';
                                    const isPlaceholder = !text || text.startsWith('Jira Request') || text.startsWith('Auto-synced from Jira');
                                    if (!text || isPlaceholder) {
                                        return (
                                            <span className="text-gray-400 italic text-xs sm:text-sm">No requester notes provided for this shoot. Click Edit to add details.</span>
                                        );
                                    }
                                    return text;
                                })()}
                            </p>
                        )}
                    </div>

                    {/* Crew Assignments (Clean 2-Column Grid with Comfortable Sizes & In-Place Add/Remove) */}
                    <div className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800 shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <Users size={18} className="text-primary" />
                                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                                    {shoot.status === 'DRAFT' ? `Tentative ${labels.teamPlural}` : `${labels.teamPlural} Assignments`}
                                </h2>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">
                                    {assignments.length}
                                </span>
                            </div>

                            {canEdit && (
                                <button
                                    onClick={openCrewModal}
                                    className="text-xs sm:text-sm font-semibold text-primary hover:text-primary/80 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/15 transition-colors cursor-pointer"
                                >
                                    <Plus size={15} />
                                    <span>Assign {labels.teamPlural}</span>
                                </button>
                            )}
                        </div>

                        {assignments.length === 0 ? (
                            <div className="text-center py-8 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-dashed border-gray-200 dark:border-gray-800">
                                <Users size={28} className="mx-auto text-gray-400 mb-2" />
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No {labels.teamPluralLower} assigned yet</p>
                                <p className="text-xs text-gray-400 mt-1 mb-3">
                                    {shoot.status === 'DRAFT'
                                        ? `Add tentative ${labels.teamPluralLower} before publishing this ${labels.workLower}`
                                        : `Assign members to organize this ${labels.workLower}`}
                                </p>
                                {canEdit && (
                                    <button
                                        onClick={openCrewModal}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
                                    >
                                        <Plus size={14} />
                                        Assign {labels.teamPlural}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {assignments.map((assignment) => {
                                    const assignedUser = users.find(u => u.id === assignment.userId);
                                    if (!assignedUser) return null;
                                    const isIncharge = assignment.role === 'Incharge';
                                    const roleInfo = getRoleBadgeInfo(assignment.role);

                                    return (
                                        <div
                                            key={assignment.id}
                                            className="flex items-center justify-between p-3 px-3.5 rounded-xl bg-gray-50/80 dark:bg-[#252528] border border-gray-200/70 dark:border-gray-800/80 hover:border-primary/40 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="relative shrink-0">
                                                    <div
                                                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold ${
                                                            isIncharge
                                                                ? 'bg-amber-500 text-white shadow-xs'
                                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                        }`}
                                                    >
                                                        {assignedUser.name.charAt(0)}
                                                    </div>
                                                    {isIncharge && (
                                                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white dark:ring-gray-900 flex items-center justify-center text-[8px] text-amber-950 font-bold" title="Lead Incharge">★</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                                                        {assignedUser.name}
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                                        {getRoleLabel(assignedUser.role) || 'Crew'} {assignedUser.phone ? `• ${assignedUser.phone}` : ''}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                <span
                                                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 shrink-0 ${roleInfo.bg}`}
                                                >
                                                    <span>{roleInfo.icon}</span>
                                                    <span>{roleInfo.label}</span>
                                                </span>

                                                {canEdit && (
                                                    <button
                                                        onClick={() => handleRemoveSingleCrew(assignment.id, assignedUser.name)}
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                                                        title={`Remove ${assignedUser.name}`}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Unified Activity & Discussions Hub (Main Stream - Left Column) */}
                    <div className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800 shadow-xs space-y-4">
                        {/* Hub Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 flex items-center justify-center text-blue-600">
                                    <JiraIcon className="w-4 h-4" />
                                </div>
                                <h3 className="text-sm font-bold tracking-tight text-gray-900 dark:text-white">
                                    Activity & Discussions
                                </h3>
                                {pinnedCommentIds.length > 0 && activityTab === 'COMMENTS' && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/50">
                                        <Pin size={10} className="fill-amber-500" />
                                        {pinnedCommentIds.length} Pinned
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Sort Order Toggle */}
                                <button
                                    onClick={() => setCommentSortOrder(prev => prev === 'NEWEST_FIRST' ? 'OLDEST_FIRST' : 'NEWEST_FIRST')}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                    title="Toggle sort order"
                                >
                                    <ArrowUpDown size={13} />
                                    <span>{commentSortOrder === 'NEWEST_FIRST' ? 'Newest' : 'Oldest'}</span>
                                </button>

                                {/* Refresh Button */}
                                <button
                                    onClick={() => { fetchJiraComments(); fetchJiraHistory(); }}
                                    disabled={isLoadingComments || isLoadingHistory}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                                    title="Refresh Activity & Comments"
                                >
                                    <RefreshCw size={14} className={isLoadingComments || isLoadingHistory ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        {/* Activity Tabs */}
                        <div className="flex items-center gap-1 bg-gray-100/70 dark:bg-zinc-800/60 p-1 rounded-xl text-xs font-semibold">
                            <button
                                onClick={() => setActivityTab('COMMENTS')}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    activityTab === 'COMMENTS'
                                        ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs font-bold'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                <MessageSquare size={13} />
                                <span>Comments</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold">
                                    {jiraComments.length}
                                </span>
                            </button>

                            {shoot.jiraTicketId && (
                                <button
                                    onClick={() => setActivityTab('JIRA_HISTORY')}
                                    className={`flex-1 py-1.5 px-3 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                        activityTab === 'JIRA_HISTORY'
                                            ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs font-bold'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <History size={13} />
                                    <span>Jira History</span>
                                    {jiraHistory.length > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-200 dark:bg-zinc-600 text-gray-700 dark:text-gray-300 font-bold">
                                            {jiraHistory.length}
                                        </span>
                                    )}
                                </button>
                            )}

                            <button
                                onClick={() => setActivityTab('APP_LOGS')}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    activityTab === 'APP_LOGS'
                                        ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs font-bold'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                <Clock size={13} />
                                <span>App Logs</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold">
                                    {logs.length}
                                </span>
                            </button>

                            <button
                                onClick={() => setActivityTab('ALL')}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    activityTab === 'ALL'
                                        ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-xs font-bold'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                <span>All</span>
                            </button>
                        </div>

                        {/* TAB 1: COMMENTS */}
                        {activityTab === 'COMMENTS' && (
                            <div className="space-y-4">
                                {shoot.jiraTicketId && (
                                    <div className="space-y-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 p-3">
                                        {/* Formatting Toolbar */}
                                        <div className="flex items-center gap-1 pb-2 border-b border-gray-200/60 dark:border-gray-800 text-gray-500 dark:text-gray-400">
                                            <button
                                                type="button"
                                                onClick={() => insertFormatting('*', '*')}
                                                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                                title="Bold (*bold*)"
                                            >
                                                <Bold size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => insertFormatting('_', '_')}
                                                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                                title="Italic (_italic_)"
                                            >
                                                <Italic size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => insertFormatting('- ')}
                                                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                                title="Bullet List (- item)"
                                            >
                                                <List size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => insertFormatting('[', '|(url)]')}
                                                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                                title="Link ([text|url])"
                                            >
                                                <Link2 size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => insertFormatting('{quote}', '{quote}')}
                                                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                                title="Quote ({quote}...{quote})"
                                            >
                                                <Quote size={14} />
                                            </button>
                                        </div>

                                        {/* Comment Textarea */}
                                        <textarea
                                            id="jira-comment-textarea"
                                            value={newCommentText}
                                            onChange={(e) => setNewCommentText(e.target.value)}
                                            placeholder="Write a comment or internal note to sync with Jira..."
                                            rows={3}
                                            className="w-full text-xs sm:text-sm rounded-lg border-0 bg-transparent p-1 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-0 resize-y"
                                        />

                                        {/* Composer Bottom Buttons */}
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-200/60 dark:border-gray-800">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handlePostComment(true)}
                                                disabled={isPostingComment || !newCommentText.trim()}
                                                className="gap-1.5 h-8 text-xs rounded-lg font-semibold border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                                                title="Add an internal comment visible only to agents / internal staff"
                                            >
                                                {isPostingComment ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                                                Comment internally
                                            </Button>

                                            <Button
                                                size="sm"
                                                onClick={() => handlePostComment(false)}
                                                disabled={isPostingComment || !newCommentText.trim()}
                                                className="gap-1.5 h-8 text-xs rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                                                title="Post a public reply visible to everyone and customer"
                                            >
                                                {isPostingComment ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
                                                Share with customer
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Comment Feed */}
                                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin divide-y divide-gray-100 dark:divide-gray-800/60">
                                    {isLoadingComments && jiraComments.length === 0 ? (
                                        <div className="flex items-center justify-center py-6 text-gray-400 gap-2 text-xs">
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Loading Jira comments...</span>
                                        </div>
                                    ) : organizedComments.length === 0 ? (
                                        <div className="text-center py-6 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-dashed border-gray-200 dark:border-gray-800">
                                            <MessageSquare size={20} className="mx-auto text-gray-400 mb-1.5" />
                                            <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300">No Jira comments yet</p>
                                            <p className="text-xs text-gray-400 mt-0.5">Post an update above to sync with Jira.</p>
                                        </div>
                                    ) : (
                                        organizedComments.map((comment) => {
                                            const isPinned = pinnedCommentIds.includes(comment.id);
                                            const isEditingThis = editingCommentId === comment.id;
                                            const isDeletingThis = deletingCommentId === comment.id;

                                            return (
                                                <div
                                                    key={comment.id}
                                                    className={`pt-3.5 first:pt-0 space-y-2 text-xs sm:text-sm transition-all ${
                                                        isPinned ? 'p-3 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 my-1' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-[11px] shrink-0">
                                                                {comment.author.displayName.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-semibold text-gray-900 dark:text-white truncate">
                                                                {comment.author.displayName}
                                                            </span>
                                                            <span className="text-xs text-gray-400 shrink-0">added a comment</span>
                                                            {comment.isInternal && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
                                                                    <Lock size={9} />
                                                                    Internal
                                                                </span>
                                                            )}
                                                            {isPinned && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 shrink-0">
                                                                    <Pin size={9} className="fill-purple-600" />
                                                                    Pinned
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-400 shrink-0">
                                                            {comment.created ? format(parseISO(comment.created), 'MMM d, h:mm a') : ''}
                                                        </span>
                                                    </div>

                                                    {isEditingThis ? (
                                                        <div className="space-y-2 pl-8 pt-1">
                                                            <textarea
                                                                value={editingCommentText}
                                                                onChange={(e) => setEditingCommentText(e.target.value)}
                                                                rows={3}
                                                                className="w-full text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                                                                autoFocus
                                                            />
                                                            <div className="flex items-center gap-1.5 justify-end">
                                                                <button
                                                                    onClick={() => { setEditingCommentId(null); setEditingCommentText(''); }}
                                                                    disabled={isSavingCommentEdit}
                                                                    className="px-3 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 cursor-pointer"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSaveEditComment(comment.id)}
                                                                    disabled={isSavingCommentEdit || !editingCommentText.trim()}
                                                                    className="px-3.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 flex items-center gap-1 cursor-pointer"
                                                                >
                                                                    {isSavingCommentEdit ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                                    Save
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="pl-8 text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                            {comment.body.replace(/^\[Production App • [^\]]+\]\s*/i, '')}
                                                        </div>
                                                    )}

                                                    {!isEditingThis && (
                                                        <div className="pl-8 flex items-center gap-3 pt-0.5 text-xs text-gray-400 dark:text-gray-500">
                                                            <button
                                                                onClick={() => handleStartEditComment(comment)}
                                                                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1 cursor-pointer"
                                                                title="Edit this comment in Jira"
                                                            >
                                                                <Pencil size={12} />
                                                                <span>Edit</span>
                                                            </button>
                                                            <span>•</span>
                                                            <button
                                                                onClick={() => handleDeleteComment(comment.id)}
                                                                disabled={isDeletingThis}
                                                                className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                                title="Delete this comment from Jira"
                                                            >
                                                                {isDeletingThis ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                                <span>Delete</span>
                                                            </button>
                                                            <span>•</span>
                                                            <button
                                                                onClick={() => togglePinComment(comment.id)}
                                                                className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-center gap-1 cursor-pointer"
                                                                title={isPinned ? 'Unpin comment' : 'Pin comment to top'}
                                                            >
                                                                {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                                                                <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB 2: JIRA HISTORY */}
                        {activityTab === 'JIRA_HISTORY' && (
                            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin divide-y divide-gray-100 dark:divide-gray-800/60">
                                {isLoadingHistory && jiraHistory.length === 0 ? (
                                    <div className="flex items-center justify-center py-6 text-gray-400 gap-2 text-xs">
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Loading Jira history...</span>
                                    </div>
                                ) : organizedHistory.length === 0 ? (
                                    <div className="text-center py-6 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-dashed border-gray-200 dark:border-gray-800">
                                        <History size={20} className="mx-auto text-gray-400 mb-1.5" />
                                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300">No Jira field changes recorded yet</p>
                                    </div>
                                ) : (
                                    organizedHistory.map((h) => (
                                        <div key={h.id} className="pt-3.5 first:pt-0 space-y-1.5 text-xs sm:text-sm">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-[11px]">
                                                        {h.author.displayName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="font-semibold text-gray-900 dark:text-white">
                                                        {h.author.displayName}
                                                    </span>
                                                    <span className="text-xs text-gray-400">updated ticket</span>
                                                </div>
                                                <span className="text-xs text-gray-400">
                                                    {h.created ? format(parseISO(h.created), 'MMM d, h:mm a') : ''}
                                                </span>
                                            </div>
                                            <div className="pl-8 space-y-1.5 text-gray-600 dark:text-gray-300">
                                                {h.items.map((item, idx) => (
                                                    <div key={idx} className="bg-gray-50 dark:bg-zinc-800/60 rounded-lg p-2 border border-gray-100 dark:border-zinc-800 text-xs">
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200 capitalize">{item.field}: </span>
                                                        {item.fromString ? (
                                                            <>
                                                                <span className="line-through text-red-500/80 mr-1">{item.fromString}</span>
                                                                <span>→</span>
                                                            </>
                                                        ) : null}
                                                        <span className="font-bold text-emerald-600 dark:text-emerald-400 ml-1">{item.toString || '(cleared)'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* TAB 3: APP LOGS */}
                        {activityTab === 'APP_LOGS' && (
                            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3.5 scrollbar-thin">
                                {logs.length === 0 ? (
                                    <p className="text-gray-400 italic text-xs sm:text-sm text-center py-6">No internal activity logged yet</p>
                                ) : (
                                    logs.map((log, index) => (
                                        <div key={log.id} className="relative pl-7 text-xs sm:text-sm">
                                            {index !== logs.length - 1 && (
                                                <div className="absolute left-[8px] top-3.5 bottom-[-14px] w-0.5 bg-gray-100 dark:bg-gray-800" />
                                            )}
                                            <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500/20 border-2 border-emerald-500" />
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white leading-tight">
                                                    {getUserName(log.userId)}
                                                </p>
                                                <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm mt-0.5 leading-snug">
                                                    {log.details}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-1 font-medium">
                                                    {format(parseISO(log.timestamp), 'MMM d, h:mm a')}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* TAB 4: ALL TIMELINE */}
                        {activityTab === 'ALL' && (
                            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin divide-y divide-gray-100 dark:divide-gray-800/60">
                                {mergedActivityTimeline.length === 0 ? (
                                    <p className="text-gray-400 italic text-xs sm:text-sm text-center py-6">No activity yet</p>
                                ) : (
                                    mergedActivityTimeline.map((item) => {
                                        if (item.type === 'COMMENT') {
                                            return (
                                                <div key={item.id} className="pt-3.5 first:pt-0 space-y-1.5 text-xs sm:text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-[11px]">
                                                                {item.comment.author.displayName.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-semibold text-gray-900 dark:text-white">
                                                                {item.comment.author.displayName}
                                                            </span>
                                                            <span className="text-xs text-gray-400">commented</span>
                                                            {item.comment.isInternal && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                                                    <Lock size={9} />
                                                                    Internal
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-400">
                                                            {format(parseISO(item.timestamp), 'MMM d, h:mm a')}
                                                        </span>
                                                    </div>
                                                    <div className="pl-8 text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                        {item.comment.body.replace(/^\[Production App • [^\]]+\]\s*/i, '')}
                                                    </div>
                                                </div>
                                            );
                                        } else if (item.type === 'JIRA_HISTORY') {
                                            return (
                                                <div key={item.id} className="pt-3.5 first:pt-0 space-y-1.5 text-xs sm:text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-[11px]">
                                                                {item.history.author.displayName.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-semibold text-gray-900 dark:text-white">
                                                                {item.history.author.displayName}
                                                            </span>
                                                            <span className="text-xs text-gray-400">updated Jira ticket</span>
                                                        </div>
                                                        <span className="text-xs text-gray-400">
                                                            {format(parseISO(item.timestamp), 'MMM d, h:mm a')}
                                                        </span>
                                                    </div>
                                                    <div className="pl-8 space-y-1">
                                                        {item.history.items.map((fi, idx) => (
                                                            <div key={idx} className="bg-gray-50 dark:bg-zinc-800/60 rounded-md p-1.5 border border-gray-100 dark:border-zinc-800 text-xs">
                                                                <span className="font-semibold text-gray-700 dark:text-gray-200 capitalize">{fi.field}: </span>
                                                                {fi.fromString && <span className="line-through text-red-500/80 mr-1">{fi.fromString} → </span>}
                                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{fi.toString || '(cleared)'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        } else {
                                            return (
                                                <div key={item.id} className="pt-3.5 first:pt-0 space-y-1.5 text-xs sm:text-sm">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-[11px]">
                                                                {getUserName(item.log.userId).charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-semibold text-gray-900 dark:text-white">
                                                                {getUserName(item.log.userId)}
                                                            </span>
                                                            <span className="text-xs text-gray-400">app activity</span>
                                                        </div>
                                                        <span className="text-xs text-gray-400">
                                                            {format(parseISO(item.timestamp), 'MMM d, h:mm a')}
                                                        </span>
                                                    </div>
                                                    <div className="pl-8 text-gray-600 dark:text-gray-300">
                                                        {item.log.details}
                                                    </div>
                                                </div>
                                            );
                                        }
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column (5 cols): Linked Transactions, Project Expenses & Shoot Overview */}
                <div className="lg:col-span-5 space-y-5">
                    {/* Google Calendar Banner (if not synced and confirmed) */}
                    {!shoot.googleEventId && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && shoot.status === 'CONFIRMED' && (
                        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2.5">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-primary" />
                                <p className="text-sm font-bold text-gray-900 dark:text-white">Google Calendar Sync</p>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Invite assigned crew and sync this shoot to calendar.</p>
                            <Button
                                size="sm"
                                onClick={handleSyncToCalendar}
                                disabled={isSyncing}
                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-9 text-xs sm:text-sm rounded-xl font-semibold cursor-pointer"
                            >
                                {isSyncing ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
                                Sync to Calendar
                            </Button>
                        </div>
                    )}

                    {/* Linked Equipment Transactions */}
                    <div className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800 shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
                            <div className="flex items-center gap-2">
                                <Video size={17} className="text-primary" />
                                <h2 className="text-base font-bold text-gray-900 dark:text-white">Linked Transactions</h2>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                {linkedTransactions.length} Checkouts
                            </span>
                        </div>

                        {linkedTransactions.length === 0 ? (
                            <div className="text-center py-6 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-dashed border-gray-200 dark:border-gray-800">
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No equipment checkouts linked</p>
                                <p className="text-xs text-gray-400 mt-1">Transactions linked to this {labels.workLower} will appear here.</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
                                {linkedTransactions.map((txn) => {
                                    const primaryUser = users.find(u => u.id === txn.userId);
                                    return (
                                        <Link
                                            key={txn.id}
                                            href={`/transactions/${txn.id}?returnTo=${encodeURIComponent(`/shoots/${shoot.id}`)}&returnLabel=${encodeURIComponent(`Back to ${shoot.title || labels.workSingular}`)}`}
                                            className="block group"
                                        >
                                            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80 dark:bg-[#252528] border border-gray-200/70 dark:border-gray-800/80 group-hover:border-primary/40 transition-colors">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                        <Video size={16} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white group-hover:text-primary transition-colors truncate">
                                                                {txn.project || 'Unspecified Project'}
                                                            </h4>
                                                            <span className="text-xs font-mono text-gray-400">#{txn.id}</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                            {txn.items.length} items • {primaryUser?.name || 'Unknown User'} • {format(parseISO(txn.timestampOut), 'MMM d, h:mm a')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Badge variant={txn.status === 'OPEN' ? 'success' : 'default'} className="px-2 py-0.5 text-xs font-bold shrink-0 ml-2">
                                                    {txn.status}
                                                </Badge>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Project Expenses (Sidebar Card) */}
                    {((user?.role && ['ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user.role)) || user?.canManageExpenses) && (
                        <div className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800 shadow-xs space-y-3.5">
                            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-100 dark:border-gray-800 pb-2.5">
                                <div className="flex items-center gap-2">
                                    <Receipt size={17} className="text-emerald-500" />
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Project Expenses</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40">
                                        Total: ₹{FIXED_EXPENSE_TYPES.reduce((sum, type) => sum + (Number(expenseAmounts[type]) || 0), 0).toLocaleString('en-IN')}
                                    </span>
                                    {isSavingExpense && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                                </div>
                            </div>

                            {/* Category Dropdown */}
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Category</span>
                                <select
                                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 cursor-pointer"
                                    value={selectedCampaign || ""}
                                    onChange={(e) => handleCampaignChange(e.target.value)}
                                >
                                    <option value="">Category (None)</option>
                                    <option value="SGEx">SGEx</option>
                                    <option value="Isha Tamil">Isha Tamil</option>
                                    <option value="SG Reach">SG Reach</option>
                                    <option value="Events">Events</option>
                                    <option value="Campaign">Campaign</option>
                                    <option value="Others">Others</option>
                                </select>
                            </div>

                            {/* 5 Fixed Expense Fields */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {FIXED_EXPENSE_TYPES.map((type) => (
                                    <div key={type} className="flex items-center justify-between p-2 px-3 rounded-xl bg-gray-50/80 dark:bg-[#252528] border border-gray-200/70 dark:border-gray-800/80 text-xs">
                                        <span className="font-semibold text-gray-700 dark:text-gray-300">{type}</span>
                                        <div className="relative w-24">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">₹</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={expenseAmounts[type] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val && Number(val) < 0) return;
                                                    setExpenseAmounts(prev => ({ ...prev, [type]: val }));
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === '-') e.preventDefault();
                                                }}
                                                onBlur={handleSaveFixedExpenses}
                                                className="w-full pl-5 pr-2 py-1 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-right"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Quick Metadata Details Card */}
                    <div className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800 shadow-xs space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 pb-2.5">
                            Shoot Overview
                        </h3>
                        <div className="space-y-2.5 text-xs sm:text-sm">
                            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-800/40">
                                <span className="text-gray-500 dark:text-gray-400">Department</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{pageDepartment?.name || 'Video Production'}</span>
                            </div>
                            <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-800/40">
                                <span className="text-gray-500 dark:text-gray-400">Created Date</span>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                    {shoot.createdAt ? format(parseISO(shoot.createdAt), 'MMM d, yyyy') : '-'}
                                </span>
                            </div>
                            {jiraDetails && (
                                <>
                                    <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-800/40">
                                        <span className="text-gray-500 dark:text-gray-400">Jira Priority</span>
                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{jiraDetails.priority || 'Medium'}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-800/40">
                                        <span className="text-gray-500 dark:text-gray-400">Jira Assignee</span>
                                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px] text-right">{jiraDetails.assignee || '-'}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isCancelModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Cancel {labels.workSingular}?</h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                This will mark the {labels.workLower} as cancelled and remove the Google Calendar event if connected.
                            </p>
                        </div>

                        <div className="p-5 space-y-2">
                            <label htmlFor="cancel-reason" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Reason <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                id="cancel-reason"
                                value={cancelReason}
                                onChange={event => setCancelReason(event.target.value)}
                                rows={4}
                                placeholder="Add context for why this was cancelled"
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                            />
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-gray-900/60 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsCancelModalOpen(false)}
                                disabled={isCancelling}
                            >
                                Keep {labels.workSingular}
                            </Button>
                            <Button
                                type="button"
                                variant="danger"
                                onClick={handleConfirmCancelShoot}
                                isLoading={isCancelling}
                            >
                                Cancel {labels.workSingular}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dedicated High-Performance Crew Assignment Modal */}
            <CrewAssignmentModal
                isOpen={isCrewModalOpen}
                onClose={() => setIsCrewModalOpen(false)}
                shoot={shoot}
                users={users}
                allAssignments={allAssignments}
                allShoots={allShoots}
                allLeaves={allLeaves}
                initialSelectedIds={selectedCrewIds}
                initialRoles={selectedCrewRoles}
                initialInchargeId={selectedInchargeId}
                labels={labels}
                onSave={async (newIds, newRoles, newScopes, newIncharge, newMemberDays, newCustomHours, pendingSwaps) => {
                    await syncCrewAssignments(newIds, newRoles, newIncharge, newScopes, newMemberDays, newCustomHours, pendingSwaps);
                    if (user) {
                        await storage.addLog({
                            id: crypto.randomUUID(),
                            action: 'EDIT',
                            entityId: shoot.id,
                            userId: user.id,
                            timestamp: new Date().toISOString(),
                            details: `Updated crew assignments (${newIds.length} assigned)`,
                            departmentId: shoot.departmentId
                        });
                        storage.getLogsByEntity(shoot.id).then(setLogs);
                    }
                    await queryClient.invalidateQueries({ queryKey: ['assignments'] });
                    await queryClient.invalidateQueries({ queryKey: ['assignmentSegments'] });
                    await queryClient.invalidateQueries({ queryKey: ['shoots'] });
                    showToast('Crew assignments updated!', 'success');
                }}
            />

            {/* In-Place Full Quick Edit Modal */}
            {isQuickEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/40">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                    <Edit size={18} />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                                        Quick Edit {labels.workSingular} Details
                                    </h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Update details, schedule, location, and crew in one place
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsQuickEditModalOpen(false)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body Form */}
                        <div className="p-5 overflow-y-auto flex-1 space-y-4 scrollbar-thin">
                            {/* Title */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                    {labels.workSingular} Title *
                                </label>
                                <input
                                    type="text"
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    placeholder="Enter title..."
                                    className="w-full text-sm font-semibold rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>

                            {/* Schedule */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-900/50 border border-gray-200/80 dark:border-gray-800">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                        Start Date & Time *
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            value={formStartDate}
                                            onChange={(e) => setFormStartDate(e.target.value)}
                                            className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            type="time"
                                            value={formStartTime}
                                            onChange={(e) => setFormStartTime(e.target.value)}
                                            className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                        End Date & Time
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            value={formEndDate}
                                            onChange={(e) => setFormEndDate(e.target.value)}
                                            className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            type="time"
                                            value={formEndTime}
                                            onChange={(e) => setFormEndTime(e.target.value)}
                                            className="text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Location & POC */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                            Event Location
                                        </label>
                                        <select
                                            value={formEventLocation}
                                            onChange={(e) => setFormEventLocation(e.target.value)}
                                            className="w-full text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                                        >
                                            {EVENT_LOCATION_OPTIONS.map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                            Event Venue
                                        </label>
                                        <input
                                            type="text"
                                            value={formEventVenue}
                                            onChange={(e) => setFormEventVenue(e.target.value)}
                                            placeholder="e.g. Adiyogi, Spanda Hall..."
                                            className="w-full text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                        Point of Contact (POC)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            value={formPocName}
                                            onChange={(e) => setFormPocName(e.target.value)}
                                            placeholder="POC Name"
                                            className="w-full text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2 text-gray-900 dark:text-white"
                                        />
                                        <input
                                            type="text"
                                            value={formPocContact}
                                            onChange={(e) => setFormPocContact(e.target.value)}
                                            placeholder="Phone or Email"
                                            className="w-full text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                    Notes & Requirements
                                </label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    rows={3}
                                    placeholder="Enter client brief, requirements, or special instructions..."
                                    className="w-full text-xs sm:text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-800 p-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                                />
                            </div>

                            {/* Crew Assignment Sub-Section */}
                            <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                        Assign {labels.teamPlural} & Scope ({selectedCrewIds.length} selected)
                                    </label>
                                </div>
                                <div className="max-h-56 overflow-y-auto space-y-2 p-2 rounded-xl bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-gray-800 scrollbar-thin">
                                    {assignableUsers.map(u => {
                                        const isSelected = selectedCrewIds.includes(u.id);
                                        const currentRole = selectedCrewRoles[u.id] || (selectedInchargeId === u.id ? 'Incharge' : 'Full Shoot');
                                        const isIncharge = currentRole === 'Incharge' || selectedInchargeId === u.id;
                                        const availability = getCrewAvailability(u.id);

                                        return (
                                            <div
                                                key={u.id}
                                                className={`p-2.5 rounded-xl border transition-all text-xs ${
                                                    isSelected ? 'bg-white dark:bg-zinc-800 border-primary/40 shadow-xs' : 'bg-white dark:bg-zinc-900/40 border-gray-100 dark:border-gray-800'
                                                }`}
                                            >
                                                <div
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setSelectedCrewIds(prev => prev.filter(id => id !== u.id));
                                                            if (selectedInchargeId === u.id) setSelectedInchargeId('');
                                                        } else {
                                                            setSelectedCrewIds(prev => [...prev, u.id]);
                                                            setSelectedCrewRoles(prev => ({
                                                                ...prev,
                                                                [u.id]: prev[u.id] || 'Full Shoot'
                                                            }));
                                                            if (!selectedInchargeId) setSelectedInchargeId(u.id);
                                                        }
                                                    }}
                                                    className="flex items-center justify-between gap-2 cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => {}}
                                                            className="w-3.5 h-3.5 rounded text-primary cursor-pointer"
                                                        />
                                                        <span className="font-semibold text-gray-900 dark:text-white truncate">{u.name}</span>
                                                        <span className="text-[10px] text-gray-400">({getRoleLabel(u.role) || 'Crew'})</span>
                                                    </div>

                                                    <div className="shrink-0">
                                                        {availability.status === 'AVAILABLE' ? (
                                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Available</span>
                                                        ) : availability.status === 'BUSY' ? (
                                                            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">On Other Shoot</span>
                                                        ) : (
                                                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">On Leave</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {isSelected && (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 grid grid-cols-4 gap-1 pl-5">
                                                        {CREW_SCOPE_OPTIONS.map(scope => {
                                                            const isScopeActive = currentRole === scope.value || (scope.value === 'Incharge' && isIncharge);
                                                            return (
                                                                <button
                                                                    key={scope.value}
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedCrewRoles(prev => ({
                                                                            ...prev,
                                                                            [u.id]: scope.value
                                                                        }));
                                                                        if (scope.value === 'Incharge') setSelectedInchargeId(u.id);
                                                                        else if (selectedInchargeId === u.id) setSelectedInchargeId('');
                                                                    }}
                                                                    className={`px-1.5 py-1 rounded-lg text-[10px] font-semibold text-center border transition-all cursor-pointer ${
                                                                        isScopeActive
                                                                            ? 'bg-primary text-white border-primary font-bold'
                                                                            : 'bg-gray-50 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                                                                    }`}
                                                                >
                                                                    {scope.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-50 dark:bg-zinc-900/60 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsQuickEditModalOpen(false)}
                                disabled={isSavingField}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSaveFullQuickEdit}
                                isLoading={isSavingField}
                            >
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {shoot && (
                <WhatsAppDispatchModal
                    isOpen={isWhatsAppModalOpen}
                    onClose={() => setIsWhatsAppModalOpen(false)}
                    initialMessage={generateShootWhatsAppPayload(shoot, assignmentsForMessage, users, labels).message}
                    mentions={generateShootWhatsAppPayload(shoot, assignmentsForMessage, users, labels).mentions}
                    departmentId={shoot.departmentId}
                />
            )}
        </div>
    );
}
