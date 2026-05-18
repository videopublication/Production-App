'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Department } from '@/types';
import { storage } from '@/lib/storage';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useToast } from '@/lib/toast-context';

const AVAILABLE_FEATURES = [
    { id: 'inventory', label: 'Inventory Management', description: 'Equipment tracking, checkout, returns & verification' },
    { id: 'shoots', label: 'Shoot Management', description: 'Plan and manage shoots with crew assignments' },
    { id: 'calendar', label: 'Calendar', description: 'Visual calendar view of shoots and schedules' },
    { id: 'crew_management', label: 'User & Crew Management', description: 'Manage users, roles and permissions' },
    { id: 'leaves', label: 'Leaves Management', description: 'Apply for leaves and manage approvals' },
];

export default function DepartmentManagementPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();

    const [departments, setDepartments] = useState<Department[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        enabledFeatures: [] as string[]
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user && user.role !== 'SUPER_ADMIN') {
            router.push('/dashboard');
            return;
        }
        if (user) {
            fetchDepartments();
        }
    }, [user, router]);

    const fetchDepartments = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/departments');
            if (res.ok) {
                const data = await res.json();
                setDepartments(data);
            } else {
                showToast('Failed to fetch departments', 'error');
            }
        } catch (error) {
            console.error('Error fetching departments:', error);
            showToast('Network error fetching departments', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            const newDept = {
                name: formData.name,
                slug: formData.slug.toLowerCase().replace(/\s+/g, '-'),
                enabledFeatures: formData.enabledFeatures,
                settings: {}
            };

            const res = await fetch('/api/admin/departments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDept)
            });

            if (res.ok) {
                showToast('Department created successfully', 'success');
                setShowAddModal(false);
                fetchDepartments();
                setFormData({ name: '', slug: '', enabledFeatures: [] });
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to create department', 'error');
            }
        } catch (error) {
            console.error('Error creating department:', error);
            showToast('Failed to create department', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDept || isSubmitting) return;
        setIsSubmitting(true);

        try {
            const res = await fetch('/api/admin/departments', {
                method: 'PUT', // Use PUT for update
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedDept.id,
                    name: formData.name,
                    slug: formData.slug,
                    enabledFeatures: formData.enabledFeatures
                })
            });

            if (res.ok) {
                showToast('Department updated successfully', 'success');
                setShowEditModal(false);
                setSelectedDept(null);
                fetchDepartments();
            } else {
                const error = await res.json();
                showToast(error.error || 'Failed to update department', 'error');
            }
        } catch (error) {
            console.error('Error updating department:', error);
            showToast('Failed to update department', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEditModal = (dept: Department) => {
        setSelectedDept(dept);
        setFormData({
            name: dept.name,
            slug: dept.slug,
            enabledFeatures: (dept.enabledFeatures || []).filter(f => AVAILABLE_FEATURES.some(af => af.id === f))
        });
        setShowEditModal(true);
    };

    const toggleFeature = (featureId: string) => {
        setFormData(prev => {
            const features = prev.enabledFeatures.includes(featureId)
                ? prev.enabledFeatures.filter(f => f !== featureId)
                : [...prev.enabledFeatures, featureId];
            return { ...prev, enabledFeatures: features };
        });
    };

    if (isLoading) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Departments</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage organization units and feature access</p>
                </div>
                <Button onClick={() => {
                    setFormData({ name: '', slug: '', enabledFeatures: ['inventory', 'shoots'] }); // Default features
                    setShowAddModal(true);
                }}>
                    Add Department
                </Button>
            </div>

            <PullToRefresh onRefresh={fetchDepartments}>
                <div className="grid gap-4 sm:grid-cols-2">
                    {departments.map(dept => (
                        <Card key={dept.id} className="p-5 hover:border-primary/50 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{dept.name}</h3>
                                    <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-500">{dept.slug}</code>
                                </div>
                                <button
                                    onClick={() => openEditModal(dept)}
                                    className="p-2 text-gray-400 hover:text-primary transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                            </div>

                            <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Enabled Features</h4>
                                <div className="flex flex-wrap gap-2">
                                    {dept.enabledFeatures?.filter(f => AVAILABLE_FEATURES.some(af => af.id === f)).map(f => (
                                        <span key={f} className="px-2 py-1 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary text-xs rounded-md font-medium border border-primary dark:border-primary">
                                            {AVAILABLE_FEATURES.find(af => af.id === f)?.label}
                                        </span>
                                    ))}
                                    {(!dept.enabledFeatures || dept.enabledFeatures.length === 0) && (
                                        <span className="text-xs text-gray-400 italic">No features enabled</span>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </PullToRefresh>

            {/* Add/Edit Modal */}
            {(showAddModal || showEditModal) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
                    <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                            {showAddModal ? 'Create Department' : 'Edit Department'}
                        </h2>
                        <form onSubmit={showAddModal ? handleAdd : handleUpdate} className="space-y-4">
                            <Input
                                label="Department Name"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Marketing"
                            />
                            <Input
                                label="Slug (URL identifier)"
                                required
                                value={formData.slug}
                                onChange={e => setFormData({ ...formData, slug: e.target.value })}
                                placeholder="e.g. marketing"
                                pattern="[a-z0-9-]+"
                                title="Lowercase letters, numbers, and hyphens only"
                            />

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Features</label>
                                <div className="space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
                                    {AVAILABLE_FEATURES.map(feature => (
                                        <label key={feature.id} className="flex items-start gap-3 cursor-pointer p-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded transition-colors">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                checked={formData.enabledFeatures.includes(feature.id)}
                                                onChange={() => toggleFeature(feature.id)}
                                            />
                                            <div>
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 block">{feature.label}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{feature.description}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                                <Button type="button" variant="ghost" onClick={() => {
                                    setShowAddModal(false);
                                    setShowEditModal(false);
                                }}>
                                    Cancel
                                </Button>
                                <Button type="submit" isLoading={isSubmitting}>
                                    {showAddModal ? 'Create' : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
