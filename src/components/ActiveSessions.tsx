import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast-context';
import { Laptop, Smartphone, Globe, Trash2, Clock, Shield } from 'lucide-react';

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
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            setCurrentSessionId(currentSession?.access_token || null);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching sessions:', error);
            setLoading(false);
        }
    };

    const confirmSignOutAll = async () => {
        try {
            setShowSignOutModal(false);
            await supabase.auth.signOut({ scope: 'global' });
            showToast('Signed out from all devices', 'success');
            window.location.reload(); // Force reload to clear state
        } catch (error) {
            console.error('Error signing out all:', error);
            showToast('Failed to sign out all devices', 'error');
        }
    };

    const currentDevice = parseUserAgent(navigator.userAgent);

    return (
        <div className="space-y-2 mt-8">
            <p className="section-header-ios">Active Sessions</p>

            {/* Main Card */}
            <div className="mx-4 overflow-hidden rounded-2xl bg-[#1c1c1e] shadow-sm ring-1 ring-white/10">
                {/* Device Row */}
                <div className="p-4 flex items-start gap-4 border-b border-white/5">
                    <div className="w-12 h-12 rounded-full bg-green-900/20 flex items-center justify-center shrink-0">
                        {currentDevice.device === 'Mobile' ?
                            <Smartphone className="w-6 h-6 text-green-500" /> :
                            <Laptop className="w-6 h-6 text-green-500" />
                        }
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-[17px] font-semibold text-white">
                                {currentDevice.os} {currentDevice.browser}
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-500 uppercase tracking-wide">
                                This Device
                            </span>
                        </div>
                        <p className="text-[15px] text-gray-400 mb-1">
                            Last active: Just now
                        </p>
                        <p className="text-[13px] text-gray-500 font-mono truncate opacity-60">
                            {navigator.userAgent}
                        </p>
                    </div>
                </div>

                {/* Info Row & Action */}
                <div className="p-4 flex gap-4 bg-white/5 transition-colors hover:bg-white/10">
                    <div className="w-12 flex justify-center shrink-0 pt-0.5">
                        <Shield className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[13px] leading-relaxed text-gray-400">
                            To protect your account, you can <button onClick={() => setShowSignOutModal(true)} className="text-[#ff453a] hover:underline font-medium inline-block">sign out from all devices</button>.
                            This will invalidate all active sessions.
                        </p>
                    </div>
                </div>
            </div>

            {/* Custom Modal */}
            {showSignOutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in"
                        onClick={() => setShowSignOutModal(false)}
                    />

                    {/* Modal Content */}
                    <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-[#1c1c1e] shadow-2xl ring-1 ring-white/10 scale-100 animate-scale-in">
                        <div className="p-6 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                                <Trash2 className="h-8 w-8 text-red-500" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold text-white">Sign Out All Devices?</h3>
                            <p className="text-[15px] text-gray-400 leading-relaxed">
                                This will remove your account from all currently signed-in devices. You will need to log in again.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-white/10 border-t border-white/10">
                            <button
                                onClick={() => setShowSignOutModal(false)}
                                className="py-4 text-[17px] font-medium text-gray-300 hover:bg-white/5 active:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSignOutAll}
                                className="py-4 text-[17px] font-bold text-[#ff453a] hover:bg-white/5 active:bg-white/10 transition-colors"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
