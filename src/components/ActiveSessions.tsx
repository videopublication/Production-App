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
            <div className="rounded-2xl border border-border/70 bg-card p-8 text-center">
                <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-[13px] text-muted-foreground">Loading devices…</p>
            </div>
        );
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            <header className="flex items-center justify-between gap-3 px-5 py-4">
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Signed-in devices</h2>
                <span className="text-[13px] tabular-nums text-muted-foreground">{sessions.length}</span>
            </header>

            <div className="divide-y divide-border/60 border-t border-border/60">
                {sessions.map((session) => {
                    const isCurrent = session.user_agent === navigator.userAgent;
                    const details = parseUserAgent(session.user_agent);
                    const lastActive = new Date(session.last_active_at);

                    return (
                        <div key={session.id} className="group relative flex items-start gap-4 px-5 py-4 transition-colors hover:bg-secondary/40">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isCurrent ? 'bg-success/12' : 'bg-secondary'}`}>
                                {details.device === 'Mobile' ?
                                    <Smartphone className={`h-4 w-4 ${isCurrent ? 'text-[#248a3d] dark:text-[#34c759]' : 'text-muted-foreground'}`} /> :
                                    <Laptop className={`h-4 w-4 ${isCurrent ? 'text-[#248a3d] dark:text-[#34c759]' : 'text-muted-foreground'}`} />
                                }
                            </div>

                            <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="truncate text-[14px] font-medium text-foreground">
                                        {details.os} · {details.browser}
                                    </h3>
                                    {isCurrent && (
                                        <span className="flex items-center gap-1 rounded-full bg-success/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#248a3d] dark:text-[#34c759]">
                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                            This device
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>
                                        {isCurrent ? 'Active now' : `Active ${formatDistanceToNow(lastActive)} ago`}
                                    </span>
                                </div>
                            </div>

                            {!isCurrent && (
                                <button
                                    onClick={() => removeSession(session.user_agent)}
                                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 group-hover:opacity-100"
                                    title="Revoke session"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* Info Row & Action */}
                <div className="flex items-start gap-3 bg-secondary/30 px-5 py-4">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                        Signed in somewhere you do not recognise?{' '}
                        <button onClick={() => setShowSignOutModal(true)} className="font-medium text-destructive hover:underline">
                            Sign out everywhere
                        </button>.
                    </p>
                </div>
            </div>

            {/* Custom Modal */}
            {showSignOutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fade-in" onClick={() => setShowSignOutModal(false)} />
                    <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border scale-100 animate-scale-in">
                        <div className="p-6 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                                <Trash2 className="h-8 w-8 text-destructive" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold text-foreground">Sign Out All Devices?</h3>
                            <p className="text-[15px] leading-relaxed text-muted-foreground">
                                This will invalidate all your active sessions everywhere. You will be logged out on all devices.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
                            <button onClick={() => setShowSignOutModal(false)} className="bg-card py-4 text-[17px] font-medium text-muted-foreground transition-colors hover:bg-secondary/60">Cancel</button>
                            <button onClick={confirmSignOutAll} className="bg-card py-4 text-[17px] font-bold text-destructive transition-colors hover:bg-destructive/10">Sign Out All</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};
