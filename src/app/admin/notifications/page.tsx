'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { User } from '@/types';

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
        if (!authLoading && user && (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
            router.push('/');
        }
        if (user) {
            storage.getUsers().then(setUsers);
        }
    }, [user, authLoading, router]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // Filter target users
            let targets: User[] = [];
            if (targetRole === 'ALL') {
                targets = users;
            } else if (targetRole === 'SPECIFIC') {
                targets = users.filter(u => u.id === specificUserId);
            } else {
                targets = users.filter(u => u.role === targetRole);
            }

            // Exclude users without tokens if necessary, but we also want to save to DB so keep them
            // Actually API handles sending, we loop here to save to DB + Call API

            const notifications = targets.map(async (target) => {
                // 1. Save to Database
                await storage.addNotification({
                    userId: target.id,
                    title,
                    message,
                    link: '/'
                });

                // 2. Send Push Notification (if token exists)
                if (target.fcmToken) {
                    try {
                        await fetch('/api/send-notification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                token: target.fcmToken,
                                title,
                                message,
                                link: '/'
                            })
                        });
                    } catch (err) {
                        console.error(`Failed to send push to ${target.name}`, err);
                    }
                }
            });

            await Promise.all(notifications);

            showToast(`Sent ${notifications.length} notifications`, 'success');
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
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Urgent Meeting"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Message</label>
                        <textarea
                            required
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none min-h-[120px] resize-y"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Enter your message here..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Target Audience</label>
                        <div className="relative">
                            <select
                                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none appearance-none"
                                value={targetRole}
                                onChange={(e: any) => setTargetRole(e.target.value)}
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
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none appearance-none"
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
                        <Button type="submit" isLoading={isLoading} className="w-full sm:w-auto px-8 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all font-medium">
                            Send Notification
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
