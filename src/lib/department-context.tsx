'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Department } from '@/types';

interface DepartmentContextType {
    department: Department | null;
    allDepartments: Department[];
    isLoading: boolean;
    hasFeature: (featureSlug: string) => boolean;
    refreshDepartment: () => Promise<void>;
    switchDepartment?: (deptId: string | null) => Promise<void>;
}

const DepartmentContext = createContext<DepartmentContextType | undefined>(undefined);

// Super Admins default to the "Global" view, but can pin a default department here
// (set from Profile / the header switcher). Stored per-device. 'GLOBAL' = all departments.
const SUPERADMIN_DEFAULT_DEPT_KEY = 'vpub_default_department';

export function DepartmentProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [department, setDepartment] = useState<Department | null>(null);
    const [allDepartments, setAllDepartments] = useState<Department[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // For Super Admins, 'null' means "All Departments" view.
    // For regular users, 'null' means "No Department Assigned" (which shouldn't happen for valid users).

    const fetchDepartment = async (deptId: string) => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('departments')
                .select('*')
                .eq('id', deptId)
                .single();

            if (error) {
                console.error('Error fetching department:', error);
                // Don't clear department if we fail, just log? Or clear? 
                if (user?.role !== 'SUPER_ADMIN') setDepartment(null);
            } else {
                setDepartment({
                    id: data.id,
                    name: data.name,
                    slug: data.slug,
                    enabledFeatures: data.enabled_features || [],
                    settings: data.settings || {}
                });
            }
        } catch (err) {
            console.error('Unexpected error fetching department:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAllDepartments = async (): Promise<Department[]> => {
        try {
            // Use the admin API to bypass RLS policies that restrict view to assigned department
            const res = await fetch('/api/admin/departments');
            if (!res.ok) throw new Error('Failed to fetch departments');
            const data = await res.json();
            setAllDepartments(data);
            return data;
        } catch (error) {
            console.error('Error fetching all departments:', error);
            // Fallback to RLS query if API fails (though API is preferred for Super Admin)
            const { data: rlsData, error: rlsError } = await supabase.from('departments').select('*');
            if (!rlsError && rlsData) {
                const formatted = rlsData.map(d => ({
                    id: d.id,
                    name: d.name,
                    slug: d.slug,
                    enabledFeatures: d.enabled_features || [],
                    settings: d.settings || {}
                }));
                setAllDepartments(formatted);
                return formatted;
            }
            return [];
        }
    };

    const switchDepartment = async (deptId: string | null) => {
        if (user?.role !== 'SUPER_ADMIN') return;

        // Remember the choice so it becomes the default on next load.
        try {
            localStorage.setItem(SUPERADMIN_DEFAULT_DEPT_KEY, deptId ?? 'GLOBAL');
        } catch { /* ignore storage errors */ }

        if (deptId === null) {
            setDepartment(null); // Switch to "Global" view
        } else {
            const target = allDepartments.find(d => d.id === deptId);
            if (target) {
                setDepartment(target);
            } else {
                await fetchDepartment(deptId);
            }
        }
    };

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            if (user?.role === 'SUPER_ADMIN') {
                const departments = await fetchAllDepartments();
                // Restore the pinned default department (set via Profile / header switcher).
                // Falls back to Global when unset, set to 'GLOBAL', or pointing at a
                // department that no longer exists.
                let saved: string | null = null;
                try { saved = localStorage.getItem(SUPERADMIN_DEFAULT_DEPT_KEY); } catch { /* ignore */ }
                const target = saved && saved !== 'GLOBAL'
                    ? departments.find(d => d.id === saved)
                    : null;
                setDepartment(target || null);
            } else if (user?.departmentId) {
                await fetchDepartment(user.departmentId);
            } else {
                setDepartment(null);
            }
            setIsLoading(false);
        };

        if (user) {
            init();
        } else {
            setDepartment(null);
            setAllDepartments([]);
            setIsLoading(false);
        }
    }, [user?.id, user?.role, user?.departmentId]);

    const hasFeature = (featureSlug: string): boolean => {
        if (!department) {
            // Global view (Super Admin) - assume all features enabled OR handled by dashboard logic
            // Ideally, the dashboard shows *everything*, so we return true?
            // Or false, forcing components to handle "Global" mode?
            // Returning true is safer for "Access Everything" philosophy.
            return user?.role === 'SUPER_ADMIN';
        }
        return department.enabledFeatures.includes(featureSlug);
    };

    return (
        <DepartmentContext.Provider value={{
            department,
            allDepartments,
            isLoading,
            hasFeature,
            switchDepartment, // Exposed for Navbar
            refreshDepartment: async () => {
                if (user?.role === 'SUPER_ADMIN') {
                    await fetchAllDepartments();
                } else if (user?.departmentId) {
                    await fetchDepartment(user.departmentId);
                }
            }
        }}>
            {children}
        </DepartmentContext.Provider>
    );
}

export const useDepartment = () => {
    const context = useContext(DepartmentContext);
    if (context === undefined) {
        throw new Error('useDepartment must be used within a DepartmentProvider');
    }
    return context;
};
