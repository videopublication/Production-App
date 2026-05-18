import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { useToast } from '@/lib/toast-context';
import { Laptop, Smartphone, Globe, Trash2, Clock, Shield, X, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Using UAParser logic simplified for this component
const parseUserAgent = (userAgent: string) => {
    let device = 'Unknown Device';
    let os = 'Unknown OS';
    let browser = 'Unknown Browser';

    if (/mobile/i.test(userAgent)) device = 'Mobile';
    else if (/tablet/i.test(userAgent)) device = 'Tablet';
    else device = 'Desktop';

    if (/windows/i.test(userAgent)) os = 'Windows';
    else if (/mac/i.test(userAgent)) os = 'macOS';
    else if (/android/i.test(userAgent)) os = 'Android';
    else if (/ios/i.test(userAgent) || /iphone/i.test(userAgent)) os = 'iOS';
    else if (/linux/i.test(userAgent)) os = 'Linux';

    if (/chrome/i.test(userAgent)) browser = 'Chrome';
    else if (/firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/safari/i.test(userAgent)) browser = 'Safari';
    else if (/edge/i.test(userAgent)) browser = 'Edge';

    return { device, os, browser };
};

export const ActiveSessions = () => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUserId(session.user.id);
                const data = await storage.getUserSessions(session.user.id);
                setSessions(data);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching sessions:', error);
            setLoading(false);
        }
    };

    const confirmSignOutAll = async () => {
        try {
            setShowSignOutModal(false);
            if (userId) {
                await storage.deleteAllUserSessions(userId);
            }
            await supabase.auth.signOut({ scope: 'global' });
            showToast('Signed out from all devices', 'success');
            window.location.reload(); // Force reload to clear state
        } catch (error) {
            console.error('Error signing out all:', error);
            showToast('Failed to sign out all devices', 'error');
        }
    };

    const removeSession = async (userAgent: string) => {
        if (!userId) return;
        try {
            await storage.deleteSession(userId, userAgent);
            setSessions(prev => prev.filter(s => s.user_agent !== userAgent));
            showToast('Session removed', 'success');
        } catch (error) {
            showToast('Failed to remove session', 'error');
        }
    };

    if (loading) {
        return (
            <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading sessions...</p>
            </div>
        );
    }

    return (
        <div className="space-y-3 mt-8">
            <div className="px-4 flex items-center justify-between">
                <p className="section-header-ios !p-0">Active Sessions</p>
                <span className="text-[11px] font-bold text-primary bg-primary/ px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {sessions.length} {sessions.length === 1 ? 'Device' : 'Devices'}
                </span>
            </div>

            <div className="mx-4 overflow-hidden rounded-2xl bg-white dark:bg-[#1c1c1e] shadow-sm ring-1 ring-gray-200 dark:ring-white/10 divide-y divide-gray-100 dark:divide-white/5">
                {sessions.map((session) => {
                    const isCurrent = session.user_agent === navigator.userAgent;
                    const details = parseUserAgent(session.user_agent);
                    const lastActive = new Date(session.last_active_at);

                    return (
                        <div key={session.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors relative group">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isCurrent ? 'bg-green-100 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                {details.device === 'Mobile' ?
                                    <Smartphone className={`w-6 h-6 ${isCurrent ? 'text-green-600 dark:text-green-500' : 'text-gray-500'}`} /> :
                                    <Laptop className={`w-6 h-6 ${isCurrent ? 'text-green-600 dark:text-green-500' : 'text-gray-500'}`} />
                                }
                            </div>

                            <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white truncate">
                                        {details.os} {details.browser}
                                    </h3>
                                    {isCurrent && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500 uppercase tracking-wide">
                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                            Current
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-gray-400 mb-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>
                                        {isCurrent ? 'Just now' : `${formatDistanceToNow(lastActive)} ago`}
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate opacity-60">
                                    {session.user_agent}
                                </p>
                            </div>

                            {!isCurrent && (
                                <button
                                    onClick={() => removeSession(session.user_agent)}
                                    className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 sm:opacity-0 group-hover:opacity-100"
                                    title="Revoke session"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* Info Row & Action */}
                <div className="p-4 flex gap-4 bg-gray-50 dark:bg-white/5">
                    <div className="w-12 flex justify-center shrink-0 pt-0.5">
                        <Shield className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[13px] leading-relaxed text-gray-500 dark:text-gray-400 pt-0.5">
                            To secure your account, you can <button onClick={() => setShowSignOutModal(true)} className="text-[#ff453a] hover:underline font-medium inline-block">sign out from all devices</button>.
                        </p>
                    </div>
                </div>
            </div>

            {/* Custom Modal */}
            {showSignOutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in" onClick={() => setShowSignOutModal(false)} />
                    <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white dark:bg-[#1c1c1e] shadow-2xl ring-1 ring-gray-200 dark:ring-white/10 scale-100 animate-scale-in">
                        <div className="p-6 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
                                <Trash2 className="h-8 w-8 text-red-600 dark:text-red-500" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Sign Out All Devices?</h3>
                            <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                This will invalidate all your active sessions everywhere. You will be logged out on all devices.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-white/10 border-t border-gray-100 dark:border-white/10">
                            <button onClick={() => setShowSignOutModal(false)} className="py-4 text-[17px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors bg-white dark:bg-transparent">Cancel</button>
                            <button onClick={confirmSignOutAll} className="py-4 text-[17px] font-bold text-[#ff453a] hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors bg-white dark:bg-transparent">Sign Out All</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
