'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { User } from '@/types';
import { sendPushNotification } from '@/lib/push-notifications';

export default function SendNotificationPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { showToast } = useToast();

    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [targetRole, setTargetRole] = useState<'ALL' | 'MANAGER' | 'CREW' | 'SPECIFIC'>('ALL');
    const [specificUserId, setSpecificUserId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        if (!authLoading && user && (!['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user.role))) {
            router.push('/');
        }
        if (user) {
            storage.getUsers(user.departmentId).then(setUsers);
        }
    }, [user, authLoading, router]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const latestUsers = user ? await storage.getUsers(user.departmentId) : users;
            setUsers(latestUsers);

            // Filter target users
            let targets: User[] = [];
            if (targetRole === 'ALL') {
                targets = latestUsers;
            } else if (targetRole === 'SPECIFIC') {
                targets = latestUsers.filter(u => u.id === specificUserId);
            } else {
                targets = latestUsers.filter(u => u.role === targetRole);
            }
            targets = targets.filter(u => u.status === 'ACTIVE');

            let inAppSaved = 0;
            let pushSuccesses = 0;
            let pushFailures = 0;
            let staleTokens = 0;
            let missingPushTokens = 0;

            const notifications = targets.map(async (target) => {
                // 1. Save to Database
                if (user) {
                    await storage.addNotification({
                        userId: target.id,
                        title,
                        message,
                        link: '/',
                        departmentId: user.departmentId
                    });
                    inAppSaved += 1;
                }

            });

            await Promise.all(notifications);

            if (targets.length > 0) {
                try {
                    const pushResult = await sendPushNotification({
                        userIds: targets.map(target => target.id),
                        title,
                        message,
                        link: '/'
                    });
                    pushSuccesses = pushResult.sent;
                    pushFailures = pushResult.failed;
                    staleTokens = pushResult.staleTokens;
                    missingPushTokens = pushResult.missingTokens;
                } catch (err) {
                    pushFailures = targets.length;
                    console.error('Failed to send push notifications', err);
                }
            }

            const pushSummary = `${pushSuccesses} push sent, ${missingPushTokens} no token, ${pushFailures} failed`;
            showToast(
                staleTokens > 0
                    ? `Saved ${inAppSaved} in-app; ${pushSummary} (${staleTokens} stale removed)`
                    : `Saved ${inAppSaved} in-app; ${pushSummary}`,
                pushFailures > 0 || pushSuccesses === 0 ? 'error' : 'success'
            );
            setTitle('');
            setMessage('');
            setTargetRole('ALL');
        } catch (error) {
            console.error('Error sending notifications:', error);
            showToast('Failed to send notifications', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading) return null;

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Send Notification</h1>
            </div>

            <Card className="bg-white/80 backdrop-blur-xl border-gray-200/50 shadow-xl">
                <form onSubmit={handleSend} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Title</label>
                        <input
                            type="text"
                            required
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 outline-none"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Urgent Meeting"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Message</label>
                        <textarea
                            required
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 outline-none min-h-[120px] resize-y"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Enter your message here..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Target Audience</label>
                        <div className="relative">
                            <select
                                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 outline-none appearance-none"
                                value={targetRole}
                                onChange={(e) => setTargetRole(e.target.value as typeof targetRole)}
                            >
                                <option value="ALL">All Users</option>
                                <option value="MANAGER">Managers</option>
                                <option value="CREW">Crew</option>
                                <option value="SPECIFIC">Specific User</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {targetRole === 'SPECIFIC' && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Select User</label>
                            <div className="relative">
                                <select
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 outline-none appearance-none"
                                    value={specificUserId}
                                    onChange={(e) => setSpecificUserId(e.target.value)}
                                    required
                                >
                                    <option value="">Select a user...</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name} ({u.role})
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <Button type="submit" isLoading={isLoading} className="w-full sm:w-auto px-8 py-2.5 rounded-xl shadow-lg shadow-primary/ hover:shadow-primary/ transition-all font-medium">
                            Send Notification
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
