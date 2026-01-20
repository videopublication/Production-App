'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { supabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { RealtimeChannel } from '@supabase/supabase-js';
import { generateUUID } from '@/lib/id';

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<{ error: any }>;
    signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
    logout: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        let channel: RealtimeChannel | null = null;

        const fetchProfile = async (userId: string, email: string) => {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (data) {
                    // Check if user is active
                    if (data.status === 'PENDING' || data.status === 'SUSPENDED') {
                        const reason = data.status === 'SUSPENDED' ? 'suspended' : 'pending';
                        setUser(null);
                        setIsLoading(false);
                        router.push(`/inactive?reason=${reason}`);
                        await supabase.auth.signOut();
                        return;
                    }

                    // Case: User was on inactive page but just got reactivated
                    if (window.location.pathname === '/inactive' && data.status === 'ACTIVE') {
                        router.push('/login');
                    }

                    setUser(data as User);

                    // Subscribe to real-time changes
                    if (channel) supabase.removeChannel(channel);

                    channel = supabase
                        .channel(`user-status-${userId}`)
                        .on(
                            'postgres_changes',
                            {
                                event: 'UPDATE',
                                schema: 'public',
                                table: 'users',
                                filter: `id=eq.${userId}`
                            },
                            async (payload) => {
                                const updatedUser = payload.new as User;
                                if (updatedUser.status === 'PENDING' || updatedUser.status === 'SUSPENDED') {
                                    const reason = updatedUser.status === 'SUSPENDED' ? 'suspended' : 'pending';
                                    setUser(null);
                                    router.push(`/inactive?reason=${reason}`);
                                    await supabase.auth.signOut();
                                } else {
                                    // Case: User was on inactive page but just got reactivated
                                    if (window.location.pathname === '/inactive' && updatedUser.status === 'ACTIVE') {
                                        router.push('/login');
                                    }
                                    // Update local user state
                                    setUser(updatedUser);
                                }
                            }
                        )
                        .subscribe();

                } else if (error && error.code === 'PGRST116') {
                    // User exists in Auth but not in public.users table yet
                    console.warn('User profile not found in public table');
                    setUser(null);
                }
            } catch (error) {
                console.error('Error fetching user profile:', error);
            } finally {
                setIsLoading(false);
            }
        };

        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchProfile(session.user.id, session.user.email!);
            } else {
                setIsLoading(false);
            }
        });

        // Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                // If we already have a user and IDs match, we might not need to refetch
                // But to be safe on sign-in, we fetch.
                fetchProfile(session.user.id, session.user.email!);
            } else {
                setUser(null);
                setIsLoading(false);
                if (channel) {
                    supabase.removeChannel(channel);
                    channel = null;
                }
            }
        });

        return () => {
            subscription.unsubscribe();
            if (channel) supabase.removeChannel(channel);
        };
    }, [router]);

    const login = async (email: string, password: string) => {
        setIsLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            // Log failed login attempt
            storage.addLog({
                id: generateUUID(),
                action: 'LOGIN_FAILED',
                entityId: 'AUTH',
                timestamp: new Date().toISOString(),
                details: `Failed login attempt for email: ${email}`
            }).catch(err => console.error('Error logging failed login:', err));

            setIsLoading(false);
            return { error };
        }

        // Fetch profile to check active status BEFORE logging success
        const { data: profile } = await supabase
            .from('users')
            .select('status')
            .eq('id', data.user?.id)
            .single();

        // Log login success ONLY if user is active
        if (data.user && profile?.status === 'ACTIVE') {
            storage.addLog({
                id: generateUUID(),
                action: 'LOGIN',
                userId: data.user.id,
                entityId: 'AUTH',
                timestamp: new Date().toISOString(),
                details: `User logged in: ${email}`
            }).catch(err => console.error('Error logging login:', err));
        } else if (data.user && (profile?.status === 'PENDING' || profile?.status === 'SUSPENDED')) {
            // Log a special entry for inactive login attempts
            storage.addLog({
                id: generateUUID(),
                action: 'LOGIN_FAILED',
                userId: data.user.id,
                entityId: 'AUTH',
                timestamp: new Date().toISOString(),
                details: `Login attempt by inactive user: ${email}`
            }).catch(err => console.error('Error logging inactive user login:', err));
        }

        return { error: null };
    };

    const signUp = async (email: string, password: string, name: string) => {
        setIsLoading(true);
        // 1. Sign up in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            setIsLoading(false);
            const message = authError.message === 'User already registered'
                ? 'An account with this email already exists. Try logging in.'
                : authError.message;
            return { error: new Error(message) };
        }

        if (authData.user) {
            // 2. Create profile in public.users table
            const { error: profileError } = await supabase
                .from('users')
                .insert([
                    {
                        id: authData.user.id,
                        email: email,
                        name: name,
                        role: 'CREW',
                        status: 'PENDING'
                    }
                ]);

            if (profileError) {
                // Handle duplicate key error (User already has a profile)
                if (profileError.code === '23505') {
                    // Do not log to console.error to avoid scary red box in dev mode
                    console.log(`[SignUp] Duplicate account attempt for ${email}`);
                    return { error: new Error('An account with this email already exists. Please try logging in instead.') };
                }

                // Log detailed error for other cases
                console.error(`[SignUp] Profile creation failed for ${email}:`,
                    profileError.message,
                    profileError.code,
                    profileError.details
                );

                // Attempt to sign out since they were technically signed up but profile creation failed
                await supabase.auth.signOut();
                return { error: new Error(`Account setup failed: ${profileError.message}. Please contact an admin.`) };
            }

            // Log signup success
            storage.addLog({
                id: generateUUID(),
                action: 'SIGNUP',
                userId: authData.user.id,
                entityId: 'AUTH',
                timestamp: new Date().toISOString(),
                details: `New account request: ${name} (${email}) - Pending Approval`
            }).catch(err => console.error('Error logging signup:', err));
        }

        return { error: null };
    };

    const logout = async () => {
        const currentUser = user;
        await supabase.auth.signOut();

        // Log logout
        if (currentUser) {
            storage.addLog({
                id: generateUUID(),
                action: 'LOGOUT',
                userId: currentUser.id,
                entityId: 'AUTH',
                timestamp: new Date().toISOString(),
                details: `User logged out: ${currentUser.email}`
            }).catch(err => console.error('Error logging logout:', err));
        }

        setUser(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, login, signUp, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
