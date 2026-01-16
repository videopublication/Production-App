'use client';

import React, { useState, useEffect } from 'react';
import { Shoot, ShootStatus, HumanResourceRequirement, User } from '@/types';
import { Input } from './Input';
import { Button } from './Button';
import { Select } from './Select';
import { Card } from './Card';
import { Calendar, MapPin, User as UserIcon, X, Plus, Check } from 'lucide-react';
import { MultiSelect } from './MultiSelect';
import { format } from 'date-fns';

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

    // Filter assigned crew for the incharge dropdown
    // But allowing any user for now, assuming incharge is also part of crew usually or separate
    // Requirement says: "one option to make incharge from select crew"
    // So Incharge must be in selectedCrewIds? Or selecting Incharge adds them to crew?
    // Let's assume selecting Incharge implies they are on the crew.

    useEffect(() => {
        // Ensure incharge is in crew list if set
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Auto-calculate requirements based on assignment
        const requiredRoles = calculateRequiredRoles();

        await onSubmit({
            ...formData,
            requiredRoles
        }, selectedCrewIds, inchargeId);
    };

    const crewOptions = users.map(u => ({ label: u.name, value: u.id }));
    const inchargeOptions = selectedCrewIds.map(id => {
        const user = users.find(u => u.id === id);
        return { label: user?.name || 'Unknown', value: id };
    });

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="md:col-span-2 space-y-4">
                    <h3 className="text-lg font-semibold text-[#1d1d1f]">Basic Verification</h3>

                    <Input
                        label="Shoot Title"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Summer Campaign 2024"
                        required
                    />

                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-muted-foreground">Description (Optional)</label>
                        <textarea
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                            placeholder="Brief description of the shoot..."
                        />
                    </div>
                </Card>

                <Card className="space-y-4">
                    <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                        <Calendar size={18} /> Schedule
                    </h3>

                    <Input
                        type="datetime-local"
                        label="Start Time"
                        value={formData.startTime}
                        onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                        required
                    />

                    <Input
                        type="datetime-local"
                        label="End Time (Optional)"
                        value={formData.endTime || ''}
                        onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                    />
                </Card>

                <Card className="space-y-4">
                    <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                        <MapPin size={18} /> Logistics
                    </h3>

                    <Input
                        label="Location"
                        value={formData.location}
                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                        placeholder="e.g. Studio A, Central Park"
                        required
                    />


                </Card>

                <Card className="md:col-span-2 space-y-4">
                    <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                        <UserIcon size={18} /> Point of Contact
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="POC Name"
                            value={formData.pocName || ''}
                            onChange={e => setFormData({ ...formData, pocName: e.target.value })}
                            placeholder="Name of contact person"
                        />
                        <Input
                            label="POC Contact"
                            value={formData.pocContact || ''}
                            onChange={e => setFormData({ ...formData, pocContact: e.target.value })}
                            placeholder="Phone or Email"
                        />
                    </div>
                </Card>

                <Card className="md:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-[#1d1d1f]">Crew Assignments</h3>
                    </div>

                    <div className="space-y-4">
                        {/* Multi-Select for Crew */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-muted-foreground">Select Crew Members</label>
                            <MultiSelect
                                options={crewOptions}
                                value={selectedCrewIds}
                                onChange={setSelectedCrewIds}
                                placeholder="Search & add crew..."
                            />
                        </div>

                        {/* Incharge Selection */}
                        {selectedCrewIds.length > 0 && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-muted-foreground">Select Shoot Incharge</label>
                                <Select
                                    value={inchargeId}
                                    onChange={setInchargeId}
                                    options={inchargeOptions}
                                    placeholder="Choose incharge from selected crew"
                                />
                            </div>
                        )}

                        {/* Summary of Selection */}
                        {selectedCrewIds.length > 0 && (
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
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
