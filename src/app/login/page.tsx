'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';

export default function LoginPage() {
    const router = useRouter();
    const { login, signUp, loginWithGoogle, user } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

    // Redirect if already logged in
    React.useEffect(() => {
        if (user) {
            if (['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
                router.replace('/dashboard');
            } else {
                router.replace('/checkout');
            }
        }
    }, [user, router]);

    // Fetch departments when switching to signup mode (public API - no auth needed)
    useEffect(() => {
        if (!isLogin && departments.length === 0) {
            fetch('/api/departments')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) setDepartments(data);
                })
                .catch(console.error);
        }
    }, [isLogin]);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        role: 'CREW', // Default role
        departmentId: ''
    });

    const isSubmittingRef = React.useRef(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isSubmittingRef.current || isLoading) return;

        isSubmittingRef.current = true;
        setError('');
        setIsLoading(true);

        try {
            if (isLogin) {
                const { error } = await login(formData.email, formData.password);
                if (error) throw error;
                router.replace('/');
            } else {
                if (!formData.departmentId) {
                    throw new Error('Please select your department');
                }
                const { error } = await signUp(
                    formData.email,
                    formData.password,
                    formData.name,
                    formData.departmentId
                );
                if (error) throw error;
                // Since new accounts are inactive by default, redirect to the approval pending page
                router.replace('/inactive');
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
            setIsLoading(false);
            isSubmittingRef.current = false;
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8 bg-gradient-to-br from-background to-secondary/20">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent">
                        VP App
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {isLogin ? 'Sign in to your account' : 'Create a new account'}
                    </p>
                </div>

                <Card className="p-6" variant="glass">
                    <div className="space-y-4">
                        <Button
                            type="button"
                            variant="secondary"
                            className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                            onClick={async () => {
                                const { error } = await loginWithGoogle();
                                if (error) setError(error.message);
                            }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </Button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white dark:bg-[#1c1c1e] px-2 text-muted-foreground">Or continue with</span>
                            </div>
                        </div>
                    </div>

                    <form className="space-y-4 pt-4" onSubmit={handleSubmit}>
                        {!isLogin && (
                            <>
                                <Input
                                    label="Full Name"
                                    autoComplete="name"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />

                                {/* Department Selector */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        Department <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        value={formData.departmentId}
                                        onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                                    >
                                        <option value="">Select your department</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        <Input
                            label="Email address"
                            type="email"
                            autoComplete="email"
                            required
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />

                        <Input
                            label="Password"
                            type="password"
                            autoComplete={isLogin ? "current-password" : "new-password"}
                            required
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />

                        {error && (
                            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            size="lg"
                            isLoading={isLoading}
                        >
                            {isLogin ? 'Sign in' : 'Create account'}
                        </Button>
                    </form>

                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-sm text-primary hover:underline"
                        >
                            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
