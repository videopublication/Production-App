'use client';

import React, { useState, useEffect } from 'react';
import { Shoot, HumanResourceRequirement, User } from '@/types';
import { Input } from './Input';
import { Button } from './Button';
import { Select } from './Select';
import { Card } from './Card';
import { Calendar, MapPin, User as UserIcon, X, Plus, FileText } from 'lucide-react';
import { MultiSelect } from './MultiSelect';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { createGoogleCalendarEvent, getGoogleProviderToken, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google-calendar';

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
    buttonLabel = 'Save Shoot'
}) => {
    const [formData, setFormData] = useState<Partial<Shoot>>({
        title: '',
        description: '',
        location: '',
        status: 'CONFIRMED',
        pocName: '',
        pocContact: '',
        ...initialData,
        startTime: initialData.startTime ? format(new Date(initialData.startTime), "yyyy-MM-dd'T'HH:mm") : '',
        endTime: initialData.endTime ? format(new Date(initialData.endTime), "yyyy-MM-dd'T'HH:mm") : '',
    });

    const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>(initialCrewIds);
    const [inchargeId, setInchargeId] = useState<string>(initialInchargeId);

    // Toggle states for optional fields
    const [showDescription, setShowDescription] = useState(!!initialData.description);
    const [showEndTime, setShowEndTime] = useState(!!initialData.endTime);
    const [showPOC, setShowPOC] = useState(!!initialData.pocName || !!initialData.pocContact);

    // Google Calendar State
    const [addToCalendar, setAddToCalendar] = useState(false);
    const [hasCalendarToken, setHasCalendarToken] = useState(false);

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
                setFormData(prev => ({ ...prev, ...parsed }));
                sessionStorage.removeItem('tempShootForm'); // Clear it
                // Also optimistically assume they wanted to add to calendar if they clicked connect
                setAddToCalendar(true);
            } catch (e) {
                console.error('Failed to parse saved form', e);
            }
        }
    }, []);

    // Auto-set End Time Logic
    useEffect(() => {
        if (formData.startTime && !formData.endTime) {
            // If start time is set but end time is empty, default end time to end of that day (23:59)
            const startDate = new Date(formData.startTime);
            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 0, 0); // End of day
            setFormData(prev => ({ ...prev, endTime: format(endDate, "yyyy-MM-dd'T'HH:mm") }));
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
        // Save current form state so we don't lose it
        sessionStorage.setItem('tempShootForm', JSON.stringify(formData));

        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/calendar.events',
                redirectTo: window.location.href,
                queryParams: {
                    access_type: 'offline',
                    // prompt: 'consent', // Removed to make it seamless
                },
            },
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const requiredRoles = calculateRequiredRoles();

        // Determine effective status (revive to CONFIRMED if it was CANCELLED)
        const effectiveStatus = initialData.status === 'CANCELLED' ? 'CONFIRMED' : formData.status;

        const submissionData = {
            ...formData,
            status: effectiveStatus
        };

        // Handle Google Calendar Logic
        let googleEventId = submissionData.googleEventId; // Keep existing if present

        if (hasCalendarToken) {
            try {
                const token = await getGoogleProviderToken();
                if (token) {
                    const assignedCrew = users.filter(u => selectedCrewIds.includes(u.id));

                    if (addToCalendar) {
                        if (googleEventId) {
                            // UPDATE existing event
                            try {
                                await updateGoogleCalendarEvent(googleEventId, submissionData, assignedCrew, token);
                            } catch (error) {
                                console.warn('Failed to update event:', error);
                            }
                        } else {
                            // CREATE new event
                            const event = await createGoogleCalendarEvent(submissionData, assignedCrew, token);
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
                                    <p class="text-xs text-gray-500">Invites sent to crew members</p>
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
                        await deleteGoogleCalendarEvent(googleEventId, token);
                        googleEventId = undefined; // Clear ID to remove from DB
                    }
                }
            } catch (error: any) {
                console.error('Calendar Error:', error);
                alert('Shoot saved, but failed to sync with Calendar: ' + error.message);
            }
        }

        // Final Submit with all data including potential new calendar ID
        await onSubmit({
            ...submissionData,
            requiredRoles,
            googleEventId // Save the ID to DB
        }, selectedCrewIds, inchargeId);
    };

    const crewOptions = users.map(u => ({ label: u.name, value: u.id }));
    const inchargeOptions = selectedCrewIds.map(id => {
        const user = users.find(u => u.id === id);
        return { label: user?.name || 'Unknown', value: id };
    });

    return (
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">

                {/* Shoot Details Card */}
                <Card className="md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between bg-blue-50/50 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-blue-100/50 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <FileText size={16} className="text-blue-600" />
                            </div>
                            <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Shoot Details</h3>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDescription(!showDescription)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-100/50"
                        >
                            {showDescription ? 'Hide Description' : 'Add Description'}
                        </Button>
                    </div>

                    <div className="space-y-4 pt-1">
                        <Input
                            label="Shoot Title"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder="e.g. Summer Campaign 2024"
                            required
                            className="bg-[#f5f5f7] border-0 rounded-2xl h-12 focus:ring-2 focus:ring-[#0071e3]"
                        />

                        {showDescription && (
                            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                                <label className="block text-sm font-medium text-[#424245] mb-2">Description (Optional)</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="flex min-h-[100px] w-full rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3 text-[15px] text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent resize-none transition-all duration-200"
                                    placeholder="Brief description of the shoot..."
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>
                </Card>

                {/* Schedule Card */}
                <Card className="space-y-4">
                    <div className="flex items-center justify-between bg-purple-50/50 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-purple-100/50 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Calendar size={16} className="text-purple-600" />
                            </div>
                            <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Schedule</h3>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowEndTime(!showEndTime)}
                            className={`h-8 w-8 rounded-full ${showEndTime ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-100/50'}`}
                            title={showEndTime ? "Remove End Time" : "Add End Time"}
                        >
                            {showEndTime ? <X size={16} /> : <Plus size={16} />}
                        </Button>
                    </div>

                    <div className="space-y-4 pt-1">
                        <Input
                            type="datetime-local"
                            label="Start Time"
                            value={formData.startTime}
                            onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                            required
                            className="bg-[#f5f5f7] border-0 rounded-2xl h-12 focus:ring-2 focus:ring-[#0071e3]"
                        />

                        {showEndTime && (
                            <div className="animate-in slide-in-from-top-2 duration-200">
                                <Input
                                    type="datetime-local"
                                    label="End Time (Optional)"
                                    value={formData.endTime || ''}
                                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                    className="bg-[#f5f5f7] border-0 rounded-2xl h-12 focus:ring-2 focus:ring-[#0071e3]"
                                    autoFocus
                                />
                            </div>
                        )}

                        {/* Google Calendar Section */}
                        <div className="space-y-3 pt-1">
                            {hasCalendarToken ? (
                                <div className="flex items-center gap-3 bg-white border border-[#e5e5ea] p-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center h-5">
                                        <input
                                            id="google-calendar"
                                            type="checkbox"
                                            checked={addToCalendar}
                                            onChange={(e) => {
                                                setAddToCalendar(e.target.checked);
                                                localStorage.setItem('addToCalendarPreference', e.target.checked ? 'true' : 'false');
                                            }}
                                            className="w-5 h-5 text-[#0071e3] border-gray-300 rounded focus:ring-[#0071e3] transition-colors"
                                        />
                                    </div>
                                    <label htmlFor="google-calendar" className="flex items-center gap-2 text-sm font-medium text-[#1d1d1f] cursor-pointer select-none">
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
                                <div className="flex items-center justify-between bg-gray-50/50 border border-dashed border-gray-300 p-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                            <Calendar size={16} className="text-gray-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-700">Google Calendar Disconnected</p>
                                            <p className="text-xs text-gray-500">Connect to send invites automatically</p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleConnectCalendar}
                                        className="bg-white hover:bg-gray-50 text-xs sm:text-sm h-8"
                                    >
                                        Connect
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Logistics Card */}
                <Card className="space-y-4">
                    <div className="flex items-center gap-3 bg-red-50/50 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-red-100/50 rounded-t-3xl">
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                            <MapPin size={16} className="text-red-500" />
                        </div>
                        <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Logistics</h3>
                    </div>

                    <div className="pt-1">
                        <Input
                            label="Location"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                            placeholder="e.g. Studio A, Central Park"
                            required
                            className="bg-[#f5f5f7] border-0 rounded-2xl h-12 focus:ring-2 focus:ring-[#0071e3]"
                        />
                    </div>
                </Card>

                {/* Point of Contact Card */}
                <Card className="md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between bg-green-50/50 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-green-100/50 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                                <UserIcon size={16} className="text-green-600" />
                            </div>
                            <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Point of Contact</h3>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPOC(!showPOC)}
                            className="text-green-600 hover:text-green-700 hover:bg-green-100/50"
                        >
                            {showPOC ? 'Hide' : 'Add'}
                        </Button>
                    </div>

                    {showPOC ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 animate-in slide-in-from-top-2 duration-200">
                            <Input
                                label="POC Name"
                                value={formData.pocName || ''}
                                onChange={e => setFormData({ ...formData, pocName: e.target.value })}
                                placeholder="Name of contact person"
                                className="bg-[#f5f5f7] border-0 rounded-2xl h-12 focus:ring-2 focus:ring-[#0071e3]"
                            />
                            <Input
                                label="POC Contact"
                                value={formData.pocContact || ''}
                                onChange={e => setFormData({ ...formData, pocContact: e.target.value })}
                                placeholder="Phone or Email"
                                className="bg-[#f5f5f7] border-0 rounded-2xl h-12 focus:ring-2 focus:ring-[#0071e3]"
                            />
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground pt-1 pl-1">
                            Optional: Add point of contact details if relevant.
                        </div>
                    )}
                </Card>

                {/* Crew Assignments Card */}
                <Card className="md:col-span-2 space-y-3">
                    <div className="flex justify-between items-center bg-gray-50/50 -mx-3 -mt-3 p-3 sm:-mx-4 sm:-mt-4 sm:p-4 md:-mx-6 md:-mt-6 md:px-6 md:py-4 mb-4 border-b border-gray-100/50 rounded-t-3xl">
                        <h3 className="text-[17px] font-semibold text-[#1d1d1f]">Crew Assignments</h3>
                    </div>

                    <div className="space-y-4 pt-1">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-[#424245] mb-2">Select Crew Members</label>
                            <MultiSelect
                                options={crewOptions}
                                value={selectedCrewIds}
                                onChange={setSelectedCrewIds}
                                placeholder="Search & add crew..."
                            />
                        </div>

                        {selectedCrewIds.length > 0 && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <label className="block text-sm font-medium text-[#424245] mb-2">Select Shoot Incharge</label>
                                <Select
                                    value={inchargeId}
                                    onChange={setInchargeId}
                                    options={inchargeOptions}
                                    placeholder="Choose incharge from selected crew"
                                />
                            </div>
                        )}

                        {selectedCrewIds.length > 0 && (
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                <h4 className="text-sm font-medium text-gray-900 mb-2">Selected Crew ({selectedCrewIds.length})</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedCrewIds.map(id => {
                                        const user = users.find(u => u.id === id);
                                        return (
                                            <div key={id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${id === inchargeId ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-700'}`}>
                                                <span>{user?.name}</span>
                                                {id === inchargeId && <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">INCHARGE</span>}
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
                    {buttonLabel}
                </Button>
            </div>
        </form>
    );
};
