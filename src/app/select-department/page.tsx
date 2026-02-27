'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';

export default function SelectDepartmentPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // If user already has a department or isn't logged in, redirect
    useEffect(() => {
        if (user && user.departmentId) {
            // Already has department, go to appropriate page
            if (user.status === 'PENDING') {
                router.replace('/inactive');
            } else {
                router.replace('/dashboard');
            }
        }
        if (!user) {
            // Not logged in at all
            // Wait briefly - auth might still be loading
        }
    }, [user, router]);

    // Fetch departments from public API
    useEffect(() => {
        fetch('/api/departments')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setDepartments(data);
            })
            .catch(console.error);
    }, []);

    const handleSubmit = async () => {
        if (!selectedDeptId || !user) return;

        setIsLoading(true);
        setError('');

        try {
            const { error: updateError } = await supabase
                .from('users')
                .update({ department_id: selectedDeptId })
                .eq('id', user.id);

            if (updateError) {
                throw new Error(updateError.message);
            }

            // Redirect to inactive page (pending approval)
            router.replace('/inactive');
        } catch (err: any) {
            setError(err.message || 'Failed to save department');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-background to-secondary/20">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent">
                        Welcome!
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        One last step — select your department to complete your registration.
                    </p>
                </div>

                <Card className="p-6" variant="glass">
                    <div className="space-y-5">
                        {/* User info */}
                        {user && (
                            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                        {user.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{user.name}</p>
                                    <p className="text-xs text-gray-500">{user.email}</p>
                                </div>
                            </div>
                        )}

                        {/* Department Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Your Department <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                value={selectedDeptId}
                                onChange={e => setSelectedDeptId(e.target.value)}
                            >
                                <option value="">Select your department</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        {error && (
                            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        <Button
                            className="w-full"
                            size="lg"
                            isLoading={isLoading}
                            onClick={handleSubmit}
                            disabled={!selectedDeptId}
                        >
                            Continue
                        </Button>

                        <p className="text-center text-xs text-gray-400">
                            Your account will need admin approval after this step.
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
}
