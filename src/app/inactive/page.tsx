'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { Suspense } from 'react';

function InactiveContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reason = searchParams.get('reason');

    const isSuspended = reason === 'suspended';

    return (
        <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
            <div className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-[32px] p-8 shadow-2xl text-center space-y-8">
                {/* Icon Container */}
                <div className="relative mx-auto w-24 h-24">
                    <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full animate-pulse" />
                    <div className={`relative w-full h-full rounded-full bg-gradient-to-br ${isSuspended ? 'from-red-600 to-red-500' : 'from-orange-500 to-yellow-500'} flex items-center justify-center shadow-lg shadow-red-500/20`}>
                        {isSuspended ? (
                            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                        ) : (
                            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                    </div>
                </div>

                {/* Text Content */}
                <div className="space-y-3">
                    <h1 className="text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                        {isSuspended ? 'Account Deactivated' : 'Approval Pending'}
                    </h1>
                    <p className="text-[#86868b] text-[17px] leading-relaxed">
                        {isSuspended ? (
                            'Your account has been actively suspended by an administrator. Please contact support if you believe this is a mistake.'
                        ) : (
                            <>
                                Thank you for signing up! Your account is currently <b>pending approval</b> from an administrator.
                                <br /><br />
                                Once approved, you'll receive access to the system. Please check back soon or contact your manager for a status update.
                            </>
                        )}
                    </p>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent" />

                {/* Action Button */}
                <div className="pt-2">
                    <Button
                        className="w-full rounded-2xl h-14 text-[17px] font-semibold bg-[#1d1d1f] hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200 shadow-xl transition-all active:scale-[0.98]"
                        onClick={() => router.push('/login')}
                    >
                        Return to Login
                    </Button>
                    <p className="mt-6 text-sm text-[#86868b]">
                        Need help? <a href="mailto:admin@example.com" className="text-[var(--primary)] hover:underline">Contact Support</a>
                    </p>
                </div>
            </div>

            {/* Footer Logo/Name */}
            <div className="mt-8 text-center text-[#c7c7cc] dark:text-[#48484a] flex items-center justify-center gap-2">
                <span className="font-semibold tracking-[0.2em] uppercase text-xs">Vpub Production</span>
            </div>
        </div>
    );
}

export default function InactivePage() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f5f7] dark:bg-[#000000]">
            {/* Ambient Background Glows */}
            <div className="fixed inset-0 overflow-hidden -z-10">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <Suspense fallback={<div className="text-gray-500">Loading status...</div>}>
                <InactiveContent />
            </Suspense>
        </div>
    );
}
