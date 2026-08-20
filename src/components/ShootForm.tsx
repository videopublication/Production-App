'use client';

import React, { useState, useEffect } from 'react';
import { Shoot, HumanResourceRequirement, User } from '@/types';
import { Input } from './Input';
import { Button } from './Button';
import { Select } from './Select';
import { Card } from './Card';
import { Calendar, MapPin, User as UserIcon, X, Plus, FileText } from 'lucide-react';
import { MultiSelect } from './MultiSelect';
import { format, parse } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { createGoogleCalendarEvent, getGoogleProviderToken, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google-calendar';
import { useToast } from '@/lib/toast-context';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import { jiraStatusToAppStatus } from '@/lib/jira-utils';

interface ShootFormProps {
    initialData?: Partial<Shoot>;
    initialCrewIds?: string[];
    initialInchargeId?: string;
    users: User[];
    onSubmit: (data: Partial<Shoot>, crewIds: string[], inchargeId: string) => Promise<void>;
    isLoading?: boolean;
    buttonLabel?: string;
}

export const ShootForm: React.FC<ShootFormProps> = ({
    initialData = {},
    initialCrewIds = [],
    initialInchargeId = '',
    users,
    onSubmit,
    isLoading = false,
    buttonLabel
}) => {
    const { showToast } = useToast();
    const { department } = useDepartment();
    const labels = getDepartmentLabels(department);
    const submitLabel = buttonLabel || `Save ${labels.workSingular}`;
    const [formData, setFormData] = useState<Partial<Shoot>>({
        title: '',
        description: '',
        location: '',
        pocName: '',
        pocContact: '',
        ...initialData,
        status: initialData.status === 'CANCELLED' ? 'CONFIRMED' : (initialData.status || 'DRAFT'),
        startTime: initialData.startTime ? format(new Date(initialData.startTime), "yyyy-MM-dd'T'HH:mm") : '',
        endTime: initialData.endTime ? format(new Date(initialData.endTime), "yyyy-MM-dd'T'HH:mm") : '',
    });

    const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>(initialCrewIds);
    const [inchargeId, setInchargeId] = useState<string>(initialInchargeId);

    // Toggle states for optional fields
    const [showDescription, setShowDescription] = useState(true);
    const [showEndTime, setShowEndTime] = useState(true);
    const [showPOC, setShowPOC] = useState(true);

    // Google Calendar State
    const [addToCalendar, setAddToCalendar] = useState(false);
    const [hasCalendarToken, setHasCalendarToken] = useState(false);

    // Jira State
    const [isFetchingJira, setIsFetchingJira] = useState(false);

    const handleFetchJira = async () => {
        if (!formData.jiraTicketId) {
            showToast('Please enter a Jira Ticket ID', 'error');
            return;
        }

        setIsFetchingJira(true);
        try {
            // Our own route, on this origin. A relative path needs no per-environment
            // configuration, so local, beta and production are correct by construction —
            // the previous version had to pin a Supabase project URL because following
            // NEXT_PUBLIC_SUPABASE_URL pointed beta and local at projects with no such
            // function. Jira credentials and the Jira host now live server-side in
            // lib/jira.ts, behind the session check in the route.
            const ticketKey = encodeURIComponent(formData.jiraTicketId.trim().toUpperCase());
            const response = await fetch(`/api/jira/ticket/${ticketKey}`, {
                headers: { Accept: 'application/json' }
            });

            if (!response.ok) {
                const errText = await response.text();
                let errMsg = `Error ${response.status}`;
                try {
                    const json = JSON.parse(errText);
                    if (json.error) errMsg = json.error;
                } catch (e) { /* ignore */ }
                throw new Error(errMsg);
            }

            const data = await response.json();
            console.log('Jira Fetch Response:', data); // DEBUG: See what we got back!

            // Match Crew Members
            const matchedCrewIds: string[] = [];
            if (typeof data.crewString === 'string') {
                const crewNames = data.crewString.split(',').map((s: string) => s.trim());
                crewNames.forEach((namePart: string) => {
                    // Try to find a user whose name contains this part (case insensitive)
                    // Remove phone numbers if present (e.g. "Surya - 1234567890" -> "Surya")
                    const cleanName = namePart.split('-')[0].trim().toLowerCase();
                    if (!cleanName) return;

                    const match = users.find(u => u.name.toLowerCase().includes(cleanName) || cleanName.includes(u.name.toLowerCase()));
                    if (match) {
                        matchedCrewIds.push(match.id);
                    }
                });
            }

            // Auto-fill form
            setFormData(prev => ({
                ...prev,
                title: data.title || prev.title,
                description: data.description || prev.description,
                location: data.location || prev.location,
                pocName: data.pocName || prev.pocName,
                pocContact: data.pocContact || prev.pocContact,
                startTime: parseJiraDate(data.startTime) || prev.startTime,
                endTime: parseJiraDate(data.endTime) || prev.endTime,
                status: data.status ? jiraStatusToAppStatus(data.status) : prev.status,
            }));

            // Merge matched crew with existing selection, unique only
            if (matchedCrewIds.length > 0) {
                setSelectedCrewIds(prev => Array.from(new Set([...prev, ...matchedCrewIds])));
            }

            showToast(`${labels.workSingular} details fetched from Jira!`, 'success');
            if (data.description && !showDescription) setShowDescription(true);
            if (data.pocName && !showPOC) setShowPOC(true);
            if (data.endTime && !showEndTime) setShowEndTime(true);

        } catch (error: any) {
            console.error('Jira Fetch Error:', error);
            showToast(error.message || 'Failed to fetch Jira ticket', 'error');
        } finally {
            setIsFetchingJira(false);
        }
    };

    useEffect(() => {
        // Check if user has connected Google Calendar
        getGoogleProviderToken()
            .then(token => setHasCalendarToken(!!token))
            .catch(err => {
                console.error('Error checking calendar token:', err);
                setHasCalendarToken(false);
            });

        // Initialize state based on existing event or user preference
        if (initialData.googleEventId) {
            setAddToCalendar(true);
        } else {
            const savedPreference = localStorage.getItem('addToCalendarPreference');
            if (savedPreference !== null) {
                setAddToCalendar(savedPreference === 'true');
            }
        }
    }, [initialData.googleEventId]);

    // Restore form data from session storage if we just came back from a detailed Auth redirect
    useEffect(() => {
        const savedForm = sessionStorage.getItem('tempShootForm');
        if (savedForm) {
            try {
                const parsed = JSON.parse(savedForm);
                // Restore basic form data
                setFormData(prev => ({
                    ...prev,
                    ...parsed.formData
                }));

                // Restore Crew & Incharge
                if (parsed.selectedCrewIds) setSelectedCrewIds(parsed.selectedCrewIds);
                if (parsed.inchargeId) setInchargeId(parsed.inchargeId);

                sessionStorage.removeItem('tempShootForm'); // Clear it
                // Also optimistically assume they wanted to add to calendar if they clicked connect
                setAddToCalendar(true);
            } catch (e) {
                console.error('Failed to parse saved form', e);
            }
        }
    }, []);

    // Auto-set End Time Logic & Validation
    useEffect(() => {
        if (formData.startTime) {
            const startDate = new Date(formData.startTime);

            if (!formData.endTime) {
                // If end time is empty, default to end of that day (23:59)
                const endDate = new Date(startDate);
                endDate.setHours(23, 59, 0, 0);
                setFormData(prev => ({ ...prev, endTime: format(endDate, "yyyy-MM-dd'T'HH:mm") }));
            } else {
                // If end time exists but is BEFORE start time, reset it to start time + 1 hour or end of day
                const endDate = new Date(formData.endTime);
                if (endDate < startDate) {
                    const newEndDate = new Date(startDate);
                    newEndDate.setHours(newEndDate.getHours() + 4); // Default to 4 hours scan
                    setFormData(prev => ({ ...prev, endTime: format(newEndDate, "yyyy-MM-dd'T'HH:mm") }));
                }
            }
        }
    }, [formData.startTime]);

    useEffect(() => {
        if (inchargeId && !selectedCrewIds.includes(inchargeId)) {
            setSelectedCrewIds(prev => [...prev, inchargeId]);
        }
    }, [inchargeId]);

    const calculateRequiredRoles = (): HumanResourceRequirement[] => {
        const roleCounts = new Map<string, number>();
        selectedCrewIds.forEach(id => {
            const user = users.find(u => u.id === id);
            const roleName = user?.role || 'Crew';
            roleCounts.set(roleName, (roleCounts.get(roleName) || 0) + 1);
        });

        return Array.from(roleCounts.entries()).map(([roleName, count]) => ({
            roleName,
            count
        }));
    };

    const handleConnectCalendar = async () => {
        // Save complete state so we don't lose it
        const stateToSave = {
            formData,
            selectedCrewIds,
            inchargeId
        };
        sessionStorage.setItem('tempShootForm', JSON.stringify(stateToSave));

        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/calendar.events',
                redirectTo: window.location.origin + window.location.pathname,
                queryParams: {
                    access_type: 'offline',
                    // prompt: 'consent', // Removed to make it seamless
                },
            },
        });
    };

    const isSubmittingRef = React.useRef(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isSubmittingRef.current || isLoading) return;

        isSubmittingRef.current = true;

        try {
            const requiredRoles = calculateRequiredRoles();

            // Determine effective status (revive cancelled records through edit instead of keeping them cancelled)
            const effectiveStatus = initialData.status === 'CANCELLED' ? 'CONFIRMED' : (formData.status || 'DRAFT');

            // Ensure End Time is populated if missing
            let effectiveEndTime = formData.endTime;
            if (formData.startTime && !effectiveEndTime) {
                const startDate = new Date(formData.startTime);
                const endDate = new Date(startDate);
                endDate.setHours(23, 59, 0, 0); // Default to End of Day
                effectiveEndTime = format(endDate, "yyyy-MM-dd'T'HH:mm");
            }

            const submissionData = {
                ...formData,
                status: effectiveStatus,
                cancellationReason: effectiveStatus === 'CANCELLED' ? formData.cancellationReason : undefined,
                startTime: formData.startTime ? new Date(formData.startTime).toISOString() : formData.startTime,
                endTime: effectiveEndTime ? new Date(effectiveEndTime).toISOString() : effectiveEndTime
            };

            // Handle Google Calendar Logic
            let googleEventId = submissionData.googleEventId; // Keep existing if present

            if (hasCalendarToken && effectiveStatus !== 'DRAFT') {
                try {
                    const tokens = await getGoogleProviderToken();
                    if (tokens && tokens.accessToken) {
                        const assignedCrew = users.filter(u => selectedCrewIds.includes(u.id));

                        if (addToCalendar) {
                            if (googleEventId) {
                                // UPDATE existing event
                                try {
                                    await updateGoogleCalendarEvent(googleEventId, submissionData, assignedCrew, tokens, labels);
                                } catch (error) {
                                    console.warn('Failed to update event:', error);
                                }
                            } else {
                                // CREATE new event
                                const event = await createGoogleCalendarEvent(submissionData, assignedCrew, tokens, labels);
                                googleEventId = event.id;

                                // Show success toast
                                const toast = document.createElement('div');
                                toast.className = 'fixed top-4 right-4 bg-white text-gray-900 px-4 py-3 rounded-xl shadow-lg border border-gray-100 flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-2 duration-300';
                                toast.innerHTML = `
                                    <div class="h-8 w-8 rounded-full bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm">
                                        <svg class="h-5 w-5" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p class="text-sm font-semibold">Calendar Event Created</p>
                                        <p class="text-xs text-gray-500">Invites sent to ${labels.teamPluralLower} members</p>
                                    </div>
                                `;
                                document.body.appendChild(toast);
                                setTimeout(() => {
                                    toast.classList.add('opacity-0', 'translate-y-[-10px]');
                                    setTimeout(() => toast.remove(), 300);
                                }, 3000);
                            }
                        } else if (!addToCalendar && googleEventId) {
                            // REMOVE event if user unchecked the box
                            await deleteGoogleCalendarEvent(googleEventId, tokens);
                            googleEventId = undefined; // Clear ID to remove from DB
                        }
                    }
                } catch (error: any) {
                    console.error('Calendar Error:', error);
                    alert(`${labels.workSingular} saved, but failed to sync with Calendar: ` + error.message);
                }
            }

            // Final Submit with all data including potential new calendar ID
            await onSubmit({
                ...submissionData,
                requiredRoles,
                googleEventId: effectiveStatus === 'DRAFT' ? undefined : googleEventId
            }, Array.from(new Set(selectedCrewIds)), inchargeId); // Ensure unique crew IDs

        } catch (error) {
            console.error('Submit Error:', error);
            isSubmittingRef.current = false; // Reset lock on error
            throw error; // Re-throw so parent can handle if needed
        }

        // Note: We don't reset isSubmittingRef.current = false on success immediately 
        // because the page usually navigates away. 
        // If the parent component keeps this mounted and just stops loading, it should handle the state reset.
        // For now, let's assume navigation happens. If inconsistent, we can add a timeout reset or parent prop.
        setTimeout(() => { isSubmittingRef.current = false; }, 2000);
    };

    const crewOptions = users
        .filter(u => u.status !== 'SUSPENDED')
        .map(u => ({ label: u.name, value: u.id }));
    const inchargeOptions = selectedCrewIds.map(id => {
        const user = users.find(u => u.id === id);
        return { label: user?.name || user?.email || 'Unknown', value: id };
    });

    return (
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6 w-full">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-6">

                {/* Work Details Card */}
                <Card className="xl:col-span-2 space-y-4 dark:bg-[#1c1c1e] border-0">
                    <div className="flex items-center justify-between bg-primary/10 dark:bg-[var(--primary)]/10 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-primary/30 dark:border-[var(--primary)]/20 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-[var(--primary)]/20 flex items-center justify-center">
                                <FileText size={16} className="text-primary dark:text-[var(--primary)]" />
                            </div>
                            <h3 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">{labels.workSingular} Details</h3>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDescription(!showDescription)}
                            className="text-primary hover:text-primary hover:bg-primary/50 dark:text-primary dark:hover:bg-primary/20"
                        >
                            {showDescription ? 'Hide Description' : 'Add Description'}
                        </Button>
                    </div>

                    <div className="space-y-5 pt-1">
                        {/* Jira Ticket Section - High Priority */}
                        <div className="relative bg-primary/10 dark:bg-primary/20 p-4 rounded-3xl border border-primary/50 dark:border-primary/20">
                            <label className="block text-sm font-semibold text-primary dark:text-primary mb-2">
                                Import from Jira
                            </label>
                            <div className="relative">
                                <input
                                    value={formData.jiraTicketId || ''}
                                    onChange={e => setFormData({ ...formData, jiraTicketId: e.target.value })}
                                    placeholder="Enter Ticket ID (e.g. VP-51638)"
                                    className="flex h-12 w-full rounded-2xl border-0 bg-white dark:bg-gray-800 px-4 py-2 text-[15px] text-[#1d1d1f] dark:text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary pr-24 shadow-sm"
                                />
                                <div className="absolute top-1.5 right-1.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleFetchJira}
                                        isLoading={isFetchingJira}
                                        disabled={!formData.jiraTicketId}
                                        className="h-9 px-4 text-xs bg-primary hover:bg-primary text-white rounded-xl font-medium shadow-sm transition-all"
                                    >
                                        Fetch
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="w-full">
                                <label className="block text-sm font-medium text-[#424245] dark:text-gray-300 mb-2">
                                    {labels.workSingular} Title <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="e.g. Summer Campaign 2024"
                                    rows={3}
                                    className="flex w-full rounded-2xl border-0 bg-[#f5f5f7] dark:bg-gray-800 px-4 py-3 text-[15px] text-[#1d1d1f] dark:text-white placeholder:text-[#86868b] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y min-h-[80px]"
                                />
                            </div>

                            <div className="w-full">
                                <label className="block text-sm font-medium text-[#424245] dark:text-gray-300 mb-2">
                                    Planning Status
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-2xl bg-[#f5f5f7] dark:bg-gray-800 p-1.5">
                                    {[
                                        { value: 'OPEN' as const, label: 'Open' },
                                        { value: 'WAITING_FOR_REQUESTER' as const, label: 'Waiting' },
                                        { value: 'PENDING_PRODUCTION_SETUP' as const, label: 'Pending Setup' },
                                        { value: 'READY_FOR_SHOOT' as const, label: 'Ready' },
                                        { value: 'SHOOT_IN_PROGRESS' as const, label: 'In Progress' },
                                        { value: 'ON_HOLD' as const, label: 'On Hold' },
                                        { value: 'CLOSED' as const, label: 'Closed' },
                                        { value: 'DRAFT' as const, label: 'Draft' },
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, status: option.value })}
                                            className={`h-9 rounded-xl text-xs font-bold transition-all ${formData.status === option.value
                                                ? 'bg-white text-primary shadow-xs dark:bg-[#1c1c1e] dark:text-primary ring-1 ring-black/5 dark:ring-white/10'
                                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {formData.status === 'DRAFT'
                                        ? `Draft ${labels.workPluralLower} stay internal and do not notify ${labels.teamPluralLower}.`
                                        : `Status updates sync with Jira and ${labels.teamPluralLower} scheduling.`}
                                </p>
                            </div>

                            <div className="w-full">
                                <label className="block text-sm font-medium text-[#424245] dark:text-gray-300 mb-2">
                                    Location <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={formData.location}
                                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                                    placeholder="e.g. Studio A, Central Park"
                                    rows={3}
                                    className="flex w-full rounded-2xl border-0 bg-[#f5f5f7] dark:bg-gray-800 px-4 py-3 text-[15px] text-[#1d1d1f] dark:text-white placeholder:text-[#86868b] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y min-h-[80px]"
                                />
                            </div>
                        </div>

                        {showDescription && (
                            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                                <label className="block text-sm font-medium text-[#424245] dark:text-gray-300 mb-2">Description (Optional)</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="flex min-h-[100px] w-full rounded-2xl border-0 bg-[#f5f5f7] dark:bg-gray-800 px-4 py-3 text-[15px] text-[#1d1d1f] dark:text-white placeholder:text-[#86868b] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y transition-all duration-200"
                                    placeholder={`Brief description of the ${labels.workLower}...`}
                                />
                            </div>
                        )}
                    </div>
                </Card>

                {/* Schedule Card */}
                <Card className="space-y-4 h-full dark:bg-[#1c1c1e] border-0">
                    <div className="flex items-center justify-between bg-purple-50/50 dark:bg-[#5856d6]/10 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-purple-100/30 dark:border-[#5856d6]/20 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-[#5856d6]/20 flex items-center justify-center">
                                <Calendar size={16} className="text-purple-600 dark:text-[#5856d6]" />
                            </div>
                            <h3 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">Schedule</h3>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowEndTime(!showEndTime)}
                            className={`h-8 w-8 rounded-full ${showEndTime ? 'bg-purple-100 text-purple-600 dark:bg-[#5856d6]/30 dark:text-[#5856d6]' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-100/50 dark:text-gray-500 dark:hover:bg-[#5856d6]/20'}`}
                            title={showEndTime ? "Remove End Time" : "Add End Time"}
                        >
                            {showEndTime ? <X size={16} /> : <Plus size={16} />}
                        </Button>
                    </div>

                    <div className="space-y-4 pt-1">
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                type="date"
                                label="Start Date"
                                value={formData.startTime ? formData.startTime.split('T')[0] : ''}
                                onChange={e => {
                                    const date = e.target.value;
                                    const time = formData.startTime ? formData.startTime.split('T')[1] : '09:00';
                                    setFormData({ ...formData, startTime: date ? `${date}T${time}` : '' });
                                }}
                                required
                                className="bg-[#f5f5f7] dark:bg-gray-800 border-0 rounded-2xl h-12 text-[#1d1d1f] dark:text-white focus:ring-2 focus:ring-primary"
                            />
                            <Input
                                type="time"
                                label="Start Time"
                                value={formData.startTime ? formData.startTime.split('T')[1] : ''}
                                onChange={e => {
                                    const time = e.target.value;
                                    const date = formData.startTime ? formData.startTime.split('T')[0] : new Date().toISOString().split('T')[0];
                                    setFormData({ ...formData, startTime: `${date}T${time}` });
                                }}
                                required
                                className="bg-[#f5f5f7] dark:bg-gray-800 border-0 rounded-2xl h-12 text-[#1d1d1f] dark:text-white focus:ring-2 focus:ring-primary"
                            />
                        </div>

                        {showEndTime && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
                                <Input
                                    type="date"
                                    label="End Date"
                                    value={formData.endTime ? formData.endTime.split('T')[0] : ''}
                                    onChange={e => {
                                        const date = e.target.value;
                                        const time = formData.endTime ? formData.endTime.split('T')[1] : '18:00';

                                        const newEndTime = date ? `${date}T${time}` : '';

                                        // Auto-adjust if date change makes current time invalid?
                                        // For now, allow it, as the Start end time effect validates on save/submit or start-change
                                        setFormData({ ...formData, endTime: newEndTime });
                                    }}
                                    className="bg-[#f5f5f7] dark:bg-gray-800 border-0 rounded-2xl h-12 text-[#1d1d1f] dark:text-white focus:ring-2 focus:ring-primary"
                                    min={formData.startTime ? formData.startTime.split('T')[0] : undefined}
                                />
                                <Input
                                    type="time"
                                    label="End Time"
                                    value={formData.endTime ? formData.endTime.split('T')[1] : ''}
                                    min={
                                        formData.startTime && formData.endTime &&
                                            formData.startTime.split('T')[0] === formData.endTime.split('T')[0]
                                            ? formData.startTime.split('T')[1]
                                            : undefined
                                    }
                                    onChange={e => {
                                        const time = e.target.value;
                                        if (!time) return;

                                        const date = formData.endTime ? formData.endTime.split('T')[0] : (formData.startTime ? formData.startTime.split('T')[0] : new Date().toISOString().split('T')[0]);

                                        const newEndTime = `${date}T${time}`;

                                        // Silent Validation: Ignore invalid times (min attribute handles visual disabling)
                                        if (formData.startTime && newEndTime < formData.startTime) {
                                            showToast('End time cannot be before start time', 'error');
                                            return;
                                        }

                                        setFormData({ ...formData, endTime: newEndTime });
                                    }}
                                    className="bg-[#f5f5f7] dark:bg-gray-800 border-0 rounded-2xl h-12 text-[#1d1d1f] dark:text-white focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        )}

                        {/* Google Calendar Section */}
                        <div className="space-y-3 pt-1">
                            {formData.status === 'DRAFT' && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                                    Google Calendar and crew invites are disabled for draft {labels.workPluralLower}.
                                </div>
                            )}
                            {hasCalendarToken ? (
                                <div className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-[#e5e5ea] dark:border-gray-700 p-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center h-5">
                                        <input
                                            id="google-calendar"
                                            type="checkbox"
                                            checked={formData.status !== 'DRAFT' && addToCalendar}
                                            onChange={(e) => {
                                                setAddToCalendar(e.target.checked);
                                                localStorage.setItem('addToCalendarPreference', e.target.checked ? 'true' : 'false');
                                            }}
                                            disabled={formData.status === 'DRAFT'}
                                            className="w-5 h-5 text-primary border-gray-300 dark:border-gray-600 rounded focus:ring-primary transition-colors"
                                        />
                                    </div>
                                    <label htmlFor="google-calendar" className="flex items-center gap-2 text-sm font-medium text-[#1d1d1f] dark:text-white cursor-pointer select-none">
                                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        Add to Google Calendar & Send Invites
                                    </label>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/20 border border-dashed border-gray-300 dark:border-gray-700 p-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                            <Calendar size={16} className="text-gray-500 dark:text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Google Calendar Disconnected</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Connect to send invites automatically</p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleConnectCalendar}
                                        className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs sm:text-sm h-8"
                                    >
                                        Connect
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Point of Contact Card */}
                <Card className="space-y-4 h-full dark:bg-[#1c1c1e] border-0">
                    <div className="flex items-center justify-between bg-green-50/50 dark:bg-[#34c759]/10 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-green-100/30 dark:border-[#34c759]/20 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-[#34c759]/20 flex items-center justify-center">
                                <UserIcon size={16} className="text-green-600 dark:text-[#34c759]" />
                            </div>
                            <h3 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">Point of Contact</h3>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPOC(!showPOC)}
                            className="text-green-600 hover:text-green-700 hover:bg-green-100/50 dark:text-green-400 dark:hover:bg-green-900/30"
                        >
                            {showPOC ? 'Hide' : 'Add'}
                        </Button>
                    </div>

                    {showPOC ? (
                        <div className="grid grid-cols-1 gap-4 pt-1 animate-in slide-in-from-top-2 duration-200">
                            <Input
                                label="POC Name"
                                value={formData.pocName || ''}
                                onChange={e => setFormData({ ...formData, pocName: e.target.value })}
                                placeholder="Name of contact person"
                                className="bg-[#f5f5f7] dark:bg-gray-800 border-0 rounded-2xl h-12 text-[#1d1d1f] dark:text-white focus:ring-2 focus:ring-primary"
                            />
                            <Input
                                label="POC Contact"
                                value={formData.pocContact || ''}
                                onChange={e => setFormData({ ...formData, pocContact: e.target.value })}
                                placeholder="Phone or Email"
                                className="bg-[#f5f5f7] dark:bg-gray-800 border-0 rounded-2xl h-12 text-[#1d1d1f] dark:text-white focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground pt-1 pl-1 dark:text-gray-400">
                            Optional: Add point of contact details if relevant.
                        </div>
                    )}
                </Card>

                {/* Team Assignments Card */}
                <Card className="xl:col-span-2 space-y-3 dark:bg-[#2c2c2e] border-0">
                    <div className="flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/40 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-gray-100/30 dark:border-[#3a3a3c] rounded-t-3xl">
                        <h3 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">{labels.teamPlural} Assignments</h3>
                    </div>

                    <div className="space-y-4 pt-1 text-foreground">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-[#424245] dark:text-gray-300 mb-2">Select {labels.teamPlural} Members</label>
                            <MultiSelect
                                options={crewOptions}
                                value={selectedCrewIds}
                                onChange={setSelectedCrewIds}
                                placeholder={`Search & add ${labels.teamPluralLower}...`}
                                searchPlaceholder={`Search ${labels.teamPluralLower}…`}
                            />
                        </div>

                        {selectedCrewIds.length > 0 && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="block text-sm font-medium text-[#424245] dark:text-gray-300 mb-2">Select {labels.leadLabel}</label>
                                <Select
                                    value={inchargeId}
                                    onChange={setInchargeId}
                                    options={inchargeOptions}
                                    placeholder={`Choose incharge from selected ${labels.teamPluralLower}`}
                                />
                            </div>
                        )}

                        {selectedCrewIds.length > 0 && (
                            <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-top-2 duration-300">
                                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-200 mb-2">Selected {labels.teamPlural} ({selectedCrewIds.length})</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedCrewIds.map(id => {
                                        const user = users.find(u => u.id === id);
                                        return (
                                            <div key={id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${id === inchargeId ? 'bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`}>
                                                <span>{user?.name || user?.email || 'Unknown'}</span>
                                                {id === inchargeId && <span className="text-[10px] font-bold bg-primary/20 text-primary dark:bg-primary/30 px-1.5 py-0.5 rounded">INCHARGE</span>}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newCrew = selectedCrewIds.filter(cid => cid !== id);
                                                        setSelectedCrewIds(newCrew);
                                                        if (id === inchargeId) setInchargeId(''); // Reset incharge if removed
                                                    }}
                                                    className="hover:text-red-500 ml-1"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <div className="flex justify-end gap-4 pt-4">
                <Button type="submit" isLoading={isLoading} size="lg">
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
};

// Helper: Parse Jira Date (e.g., "31/Jan/26 11:00 AM" or ISO) to HTML input format
function parseJiraDate(dateStr: any): string {
    if (!dateStr) return '';
    if (typeof dateStr !== 'string') return '';

    try {
        // Try parsing ISO first
        const date = new Date(dateStr);
        if (!isNaN(date.getTime()) && dateStr.includes('-')) {
            return format(date, "yyyy-MM-dd'T'HH:mm");
        }

        // Try parsing custom format "31/Jan/26 11:00 AM" used in Jira
        // date-fns format string for this: 'd/MMM/yy h:mm a'
        const parsed = parse(dateStr, 'd/MMM/yy h:mm a', new Date());
        if (!isNaN(parsed.getTime())) {
            return format(parsed, "yyyy-MM-dd'T'HH:mm");
        }
    } catch (e) {
        console.warn('Failed to parse Jira date:', dateStr);
    }
    return '';
}
