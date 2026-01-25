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
    linkGoogleCalendar: () => Promise<{ error: any }>;
    loginWithGoogle: () => Promise<{ error: any }>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const router = useRouter();

    // Safety timeout: If auth takes more than 10 seconds, force stop loading
    useEffect(() => {
        if (!isLoading) return;

        const timeoutId = setTimeout(() => {
            if (isLoading) {
                console.warn('Auth check timed out after 10s. Forcing loading state to false.');
                setIsLoading(false);
            }
        }, 12000); // 12 seconds safety net

        return () => clearTimeout(timeoutId);
    }, [isLoading]);

    useEffect(() => {
        let channel: RealtimeChannel | null = null;

        const fetchProfile = async (userId: string, email: string) => {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('*, avatarUrl:avatar_url')
                    .eq('id', userId)
                    .single();

                if (data) {
                    // Check if user is active
                    if (data.status === 'PENDING' || data.status === 'SUSPENDED') {
                        const reason = data.status === 'SUSPENDED' ? 'suspended' : 'pending';
                        setUser(null);
                        setIsLoading(false);
                        router.replace(`/inactive?reason=${reason}`);
                        await supabase.auth.signOut();
                        return;
                    }

                    // Case: User was on inactive page but just got reactivated
                    if (window.location.pathname === '/inactive' && data.status === 'ACTIVE') {
                        router.replace('/login');
                    }

                    setUser(data as User);

                    // Track this session
                    storage.upsertSession(data.id, navigator.userAgent).catch(console.error);

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
                                const updatedUser = payload.new as any;
                                // Map avatar_url to avatarUrl for consistency incase of updates
                                if (updatedUser.avatar_url) updatedUser.avatarUrl = updatedUser.avatar_url;

                                if (updatedUser.status === 'PENDING' || updatedUser.status === 'SUSPENDED') {
                                    const reason = updatedUser.status === 'SUSPENDED' ? 'suspended' : 'pending';
                                    setUser(null);
                                    router.replace(`/inactive?reason=${reason}`);
                                    await supabase.auth.signOut();
                                } else {
                                    // Case: User was on inactive page but just got reactivated
                                    if (window.location.pathname === '/inactive' && updatedUser.status === 'ACTIVE') {
                                        router.replace('/login');
                                    }
                                    // Update local user state
                                    setUser(updatedUser as User);
                                }
                            }
                        )
                        .subscribe();

                } else if (error && error.code === 'PGRST116') {
                    // User exists in Auth but not in public.users table yet (e.g., first Google Login)
                    console.log('User profile not found in public table, creating new PENDING profile...');

                    try {
                        const { error: insertError } = await supabase
                            .from('users')
                            .insert([
                                {
                                    id: userId,
                                    email: email,
                                    name: email.split('@')[0], // Default name from email
                                    role: 'CREW',
                                    status: 'PENDING',
                                    // Map JS property avatarUrl to DB column avatar_url
                                    avatar_url: (await supabase.auth.getSession()).data.session?.user?.user_metadata?.avatar_url || null
                                }
                            ]);

                        if (insertError) {
                            console.error('Failed to create public user profile details (JSON):', JSON.stringify(insertError, null, 2));
                            console.error('Attempted Insert Data:', {
                                id: userId,
                                email,
                                role: 'CREW',
                                status: 'PENDING'
                            });
                            setUser(null);
                        } else {
                            // Successfully created, now recurse/reload to fetch it and handle routing
                            fetchProfile(userId, email);
                        }
                    } catch (err) {
                        console.error('Error creating profile:', err);
                        setUser(null);
                    }
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
        } = supabase.auth.onAuthStateChange(async (event, session) => {
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

    // Handle Google Login Success Logging
    useEffect(() => {
        const checkGoogleLoginSuccess = async () => {
            const pendingLogin = sessionStorage.getItem('auth_logging_pending');
            if (pendingLogin === 'google' && user) {
                // Clear immediately to prevent double logging
                sessionStorage.removeItem('auth_logging_pending');

                // Log success
                try {
                    if (user.status === 'ACTIVE' || user.status === 'PENDING') { // Pending users also managed via signup flow usually, but Google might be different
                        // For Google, if they are brand new, they might be PENDING.
                        // If existing active user, log LOGIN.
                        storage.addLog({
                            id: generateUUID(),
                            action: 'LOGIN',
                            userId: user.id,
                            entityId: 'AUTH',
                            timestamp: new Date().toISOString(),
                            details: `User logged in with Google: ${user.email}`
                        });
                    } else {
                        storage.addLog({
                            id: generateUUID(),
                            action: 'LOGIN_FAILED',
                            userId: user.id,
                            entityId: 'AUTH',
                            timestamp: new Date().toISOString(),
                            details: `Google login attempt by inactive user: ${user.email}`
                        });
                    }
                } catch (err) {
                    console.error('Error logging google success:', err);
                }
            }
        };

        checkGoogleLoginSuccess();
    }, [user]);

    const login = async (email: string, password: string) => {
        // isLoading is handled locally by the caller to prevent full app unmount/remount
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
        // isLoading is handled locally
        // 1. Sign up in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
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
        // Use scope: 'local' so we don't invalidate sessions on other devices
        await supabase.auth.signOut({ scope: 'local' });

        // Log logout
        if (currentUser) {
            // Remove this session from our tracker
            storage.deleteSession(currentUser.id, navigator.userAgent).catch(console.error);

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
        router.replace('/login');
    };

    const linkGoogleCalendar = async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/calendar.events',
                redirectTo: `${window.location.origin}/profile`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        });
        return { error };
    };

    const loginWithGoogle = async () => {
        // Log the attempt (Non-blocking)
        // We do NOT await this, so the redirect happens immediately without waiting for the log to save.
        storage.addLog({
            id: generateUUID(),
            action: 'LOGIN',
            entityId: 'AUTH',
            timestamp: new Date().toISOString(),
            details: `Google login attempt initiated`
        }).catch(e => console.error('Failed to log google attempt', e));

        // Set flag to track this login attempt across the redirect
        sessionStorage.setItem('auth_logging_pending', 'google');

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // Request emails scope and Calendar scope to get user details and enable calendar integration
                scopes: 'https://www.googleapis.com/auth/calendar.events',
                redirectTo: `${window.location.origin}/login`,
                queryParams: {
                    access_type: 'offline',
                    // prompt: 'consent', // Removed to prevent forcing consent screen on every login
                },
            },
        });
        return { error };
    };

    return (
        <AuthContext.Provider value={{ user, login, signUp, logout, linkGoogleCalendar, loginWithGoogle, isLoading }}>
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
