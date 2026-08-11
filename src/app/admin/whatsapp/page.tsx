'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import Link from 'next/link';

interface WhatsAppLog {
    id: string;
    timestamp: string;
    type: 'GROUP' | 'DIRECT' | 'SYSTEM_ALERT';
    recipient: string;
    message: string;
    status: 'SUCCESS' | 'FAILED';
    mentions?: string[];
    error?: string;
}

interface GatewayStatus {
    status: 'connected' | 'qr_ready' | 'offline' | 'disconnected' | 'initializing';
    connected: boolean;
    gatewayUrl: string;
    groupJid: string;
    instanceName: string;
    qrDataUrl?: string | null;
    error?: string;
    lastChecked?: string;
}

export default function WhatsAppDashboardPage() {
    const { user } = useAuth();
    const { department, hasFeature, refreshDepartment } = useDepartment();
    const [status, setStatus] = useState<GatewayStatus | null>(null);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [logs, setLogs] = useState<WhatsAppLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [showQrModal, setShowQrModal] = useState(false);
    const [enablingFeature, setEnablingFeature] = useState(false);

    // Form state
    const [dispatchType, setDispatchType] = useState<'GROUP' | 'DIRECT' | 'POLL'>('GROUP');
    const [directPhone, setDirectPhone] = useState('919360546810');
    const [recipientName, setRecipientName] = useState('Ayush');
    const [messageText, setMessageText] = useState('');
    const [pollTitle, setPollTitle] = useState("Who is available for tomorrow's shoot at Studio 1?");
    const [pollOptions, setPollOptions] = useState<string[]>(['Available 🟢', 'Busy 🔴', 'Tentative 🟡']);
    const [sending, setSending] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Logs filtering
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'ALL' | 'GROUP' | 'DIRECT' | 'POLL'>('ALL');

    // Preset templates
    const templates = [
        {
            title: '🎬 Shoot Reminder',
            text: `Namaskaram Team 🙏\n\n🎬 *SHOOT REMINDER ALERT* 🎬\n\nReminder for upcoming scheduled shoot:\n📍 Location: Studio 1\n⏰ Time: 09:00 AM\n\nPlease ensure all checked-out gear is verified.\n\nPranam 🙏`
        },
        {
            title: '📦 Equipment Checkout Alert',
            text: `Namaskaram 🙏\n\n📦 *EQUIPMENT CHECKOUT NOTICE* 📦\n\nEquipment items checked out:\n• Sony A7S III Camera Body\n• 24-70mm f/2.8 GM II Lens\n\nChecked out by: @919360546810 (Ayush)\n\nPranam 🙏`
        },
        {
            title: '↩️ Equipment Return Confirmation',
            text: `Namaskaram 🙏\n\n↩️ *EQUIPMENT RETURN CONFIRMED* ↩️\n\nAll equipment items have been safely returned to inventory storage.\nVerified by Admin.\n\nPranam 🙏`
        },
        {
            title: '📢 Team Announcement',
            text: `Namaskaram Team 🙏\n\n📢 *IMPORTANT ANNOUNCEMENT* 📢\n\nPlease update your availability in the VP App calendar for next week shoots.\n\nPranam 🙏`
        }
    ];

    const fetchStatus = async () => {
        setLoadingStatus(true);
        try {
            const res = await fetch('/api/whatsapp/status');
            const data = await res.json();
            setStatus(data);
        } catch (err) {
            console.error('Failed to fetch status:', err);
            setStatus({
                status: 'offline',
                connected: false,
                gatewayUrl: 'http://localhost:3001',
                groupJid: '120363424310845566@g.us',
                instanceName: 'vp-app-1',
                error: 'Could not connect to API status route'
            });
        } finally {
            setLoadingStatus(false);
        }
    };

    const fetchLogs = async () => {
        setLoadingLogs(true);
        try {
            const res = await fetch('/api/whatsapp/send');
            const data = await res.json();
            if (data.logs) setLogs(data.logs);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        } finally {
            setLoadingLogs(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        fetchLogs();

        // Auto-refresh status every 15s
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();

        if (dispatchType === 'POLL') {
            if (!pollTitle.trim()) return;
            const validOpts = pollOptions.filter(o => o.trim());
            if (validOpts.length < 2) {
                setToast({ type: 'error', message: 'At least 2 poll options are required' });
                return;
            }
        } else {
            if (!messageText.trim()) return;
        }

        setSending(true);
        setToast(null);

        try {
            const payload = dispatchType === 'POLL' ? {
                type: 'POLL',
                pollName: pollTitle,
                options: pollOptions.filter(o => o.trim()),
                departmentId: department?.id
            } : {
                type: dispatchType,
                target: dispatchType === 'DIRECT' ? directPhone : undefined,
                message: messageText,
                departmentId: department?.id
            };

            const res = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to send WhatsApp dispatch');
            }

            setToast({
                type: 'success',
                message: dispatchType === 'POLL' ? 'Native WhatsApp Poll dispatched to group!' : 'WhatsApp message dispatched successfully!'
            });
            if (dispatchType !== 'POLL') setMessageText('');
            fetchLogs();
        } catch (err: any) {
            setToast({ type: 'error', message: err.message || 'Error sending message' });
        } finally {
            setSending(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.recipient.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'ALL' || log.type === filterType;
        return matchesSearch && matchesType;
    });

    const handleEnableDepartmentWhatsApp = async () => {
        if (!department || enablingFeature) return;
        setEnablingFeature(true);
        try {
            const currentFeatures = department.enabledFeatures || [];
            const updatedFeatures = Array.from(new Set([...currentFeatures, 'whatsapp']));
            const res = await fetch('/api/admin/departments', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: department.id,
                    name: department.name,
                    slug: department.slug,
                    enabledFeatures: updatedFeatures,
                    settings: { ...department.settings, whatsappEnabled: true }
                })
            });
            if (res.ok) {
                await refreshDepartment();
                setToast({ type: 'success', message: `WhatsApp feature enabled for ${department.name}!` });
            }
        } catch (err) {
            console.error('Failed to enable WhatsApp for department:', err);
        } finally {
            setEnablingFeature(false);
        }
    };

    if (!user || !['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DATA_MANAGER'].includes(user.role)) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold text-destructive">Access Restricted</h2>
                <p className="text-muted-foreground mt-2">You need Manager or Admin privileges to access WhatsApp Hub.</p>
                <Link href="/dashboard" className="mt-4 inline-block px-4 py-2 bg-primary text-white rounded-lg">
                    Return to Dashboard
                </Link>
            </div>
        );
    }

    if (department && !hasFeature('whatsapp')) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-4">
                <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-8 max-w-lg w-full text-center space-y-4 shadow-lg">
                    <div className="w-16 h-16 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto text-3xl">
                        🔕
                    </div>
                    <h2 className="text-xl font-bold text-foreground">WhatsApp Automation Disabled</h2>
                    <p className="text-sm text-muted-foreground">
                        WhatsApp Hub and automated alerts are currently <strong>disabled</strong> for <strong>{department.name}</strong>.
                    </p>
                    <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl">
                        Each department operates independently with its own feature flags and WhatsApp configurations.
                    </p>
                    {['ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
                        <button
                            onClick={handleEnableDepartmentWhatsApp}
                            disabled={enablingFeature}
                            className="w-full py-3 bg-[#25d366] hover:bg-[#20bd5a] text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                        >
                            {enablingFeature ? 'Enabling...' : `Enable WhatsApp Automation for ${department.name}`}
                        </button>
                    )}
                    <Link href="/dashboard" className="inline-block text-xs text-muted-foreground hover:text-foreground">
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background dark:bg-[#1c1c1e] text-foreground p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#25d366]/10 text-[#25d366] flex items-center justify-center font-bold text-xl">
                            💬
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">WhatsApp Automation Hub</h1>
                            <p className="text-sm text-muted-foreground">Monitor gateway status, send group announcements & review dispatch logs</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchStatus}
                        disabled={loadingStatus}
                        className="px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded-xl flex items-center gap-2 transition-colors"
                    >
                        <svg className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh Health
                    </button>
                </div>
            </div>

            {/* Gateway Connection Banner */}
            <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-5 mb-8 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                    <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gateway Status</span>
                        <div className="flex items-center gap-2.5 mt-1.5">
                            {status?.connected ? (
                                <>
                                    <span className="relative flex h-3.5 w-3.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#25d366] opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#25d366]"></span>
                                    </span>
                                    <span className="font-semibold text-base text-[#25d366]">Connected & Live</span>
                                </>
                            ) : (
                                <>
                                    <span className="h-3.5 w-3.5 rounded-full bg-amber-500"></span>
                                    <span className="font-semibold text-base text-amber-500">
                                        {status?.status === 'qr_ready' ? 'Scan QR Code' : 'Gateway Initializing'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Endpoint</span>
                        <p className="font-mono text-sm mt-1 text-foreground font-medium truncate">{status?.gatewayUrl || 'http://localhost:3001'}</p>
                    </div>

                    <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Group JID</span>
                        <p className="font-mono text-xs mt-1 text-muted-foreground truncate">{status?.groupJid || '120363424310845566@g.us'}</p>
                    </div>

                    <div className="flex justify-end gap-2">
                        {status?.qrDataUrl || !status?.connected ? (
                            <button
                                onClick={() => setShowQrModal(true)}
                                className="px-4 py-2.5 bg-[#25d366] hover:bg-[#20bd5a] text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all"
                            >
                                <span>📷</span> Scan QR Code
                            </button>
                        ) : (
                            <div className="px-4 py-2 bg-[#25d366]/10 text-[#25d366] text-xs font-semibold rounded-xl flex items-center gap-1.5">
                                <span>✅</span> Session Active
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Grid: Messaging Tool (Left) & Activity Logs (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Direct & Group Messaging Tool */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-6 shadow-sm">
                        <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2">
                            <span>🚀</span> Dispatch WhatsApp Message
                        </h2>

                        {/* Dispatch Type Selector */}
                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted dark:bg-[#202022] rounded-xl mb-5">
                            <button
                                type="button"
                                onClick={() => setDispatchType('GROUP')}
                                className={`py-2 px-2 text-[11px] font-semibold rounded-lg transition-all ${dispatchType === 'GROUP' ? 'bg-card dark:bg-[#2c2c2e] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                👥 Group Text
                            </button>
                            <button
                                type="button"
                                onClick={() => setDispatchType('DIRECT')}
                                className={`py-2 px-2 text-[11px] font-semibold rounded-lg transition-all ${dispatchType === 'DIRECT' ? 'bg-card dark:bg-[#2c2c2e] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                💬 Direct 1-on-1
                            </button>
                            <button
                                type="button"
                                onClick={() => setDispatchType('POLL')}
                                className={`py-2 px-2 text-[11px] font-semibold rounded-lg transition-all ${dispatchType === 'POLL' ? 'bg-card dark:bg-[#2c2c2e] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                📊 Interactive Poll
                            </button>
                        </div>

                        <form onSubmit={handleSendMessage} className="space-y-4">
                            {dispatchType === 'POLL' ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Poll Title / Question</label>
                                        <input
                                            type="text"
                                            value={pollTitle}
                                            onChange={(e) => setPollTitle(e.target.value)}
                                            placeholder="Ask a question..."
                                            className="w-full px-3.5 py-2.5 text-sm bg-muted/50 dark:bg-[#202022] border border-border dark:border-[#3a3a3c] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#25d366]"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground">Poll Options</label>
                                            <button
                                                type="button"
                                                onClick={() => setPollOptions([...pollOptions, `Option ${pollOptions.length + 1}`])}
                                                className="text-[11px] text-[#25d366] font-semibold hover:underline"
                                            >
                                                + Add Option
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {pollOptions.map((opt, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={opt}
                                                        onChange={(e) => {
                                                            const copy = [...pollOptions];
                                                            copy[idx] = e.target.value;
                                                            setPollOptions(copy);
                                                        }}
                                                        placeholder={`Option ${idx + 1}`}
                                                        className="w-full px-3 py-2 text-xs bg-muted/50 dark:bg-[#202022] border border-border dark:border-[#3a3a3c] rounded-xl focus:outline-none"
                                                    />
                                                    {pollOptions.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                                                            className="px-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {dispatchType === 'DIRECT' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Recipient Phone Number (with Country Code)</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={directPhone}
                                                    onChange={(e) => setDirectPhone(e.target.value)}
                                                    placeholder="919360546810"
                                                    className="w-full px-3.5 py-2.5 text-sm bg-muted/50 dark:bg-[#202022] border border-border dark:border-[#3a3a3c] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#25d366]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setDirectPhone('919360546810')}
                                                    className="px-3 py-2 text-xs bg-muted hover:bg-muted/80 font-medium rounded-xl whitespace-nowrap"
                                                >
                                                    Ayush
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Quick Templates */}
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Quick Templates</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {templates.map((tpl, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => setMessageText(tpl.text)}
                                                    className="text-left text-xs p-2.5 bg-muted/40 hover:bg-muted dark:bg-[#202022] dark:hover:bg-[#3a3a3c] border border-border dark:border-[#3a3a3c] rounded-xl transition-all truncate"
                                                >
                                                    {tpl.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Message Input */}
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Message Content</label>
                                        <textarea
                                            rows={5}
                                            value={messageText}
                                            onChange={(e) => setMessageText(e.target.value)}
                                            placeholder="Type message or tag team members using @91XXXXXXXXXX..."
                                            className="w-full p-3.5 text-sm bg-muted/50 dark:bg-[#202022] border border-border dark:border-[#3a3a3c] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#25d366]"
                                        ></textarea>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Tip: Add <code className="text-[#25d366] font-mono">@91XXXXXXXXXX</code> in text to automatically tag specific users.
                                        </p>
                                    </div>
                                </>
                            )}

                            {toast && (
                                <div className={`p-3 rounded-xl text-xs font-medium ${toast.type === 'success' ? 'bg-[#25d366]/10 text-[#25d366]' : 'bg-destructive/10 text-destructive'}`}>
                                    {toast.message}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={sending || !messageText.trim()}
                                className="w-full py-3 bg-[#25d366] hover:bg-[#20bd5a] disabled:opacity-50 text-white font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                {sending ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        <span>Dispatching...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>📤 Dispatch WhatsApp Message</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Active Rules Status */}
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Automated Trigger Rules</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-muted/30 dark:bg-[#202022] rounded-xl border border-border dark:border-[#3a3a3c]">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">📦</span>
                                    <div>
                                        <p className="text-sm font-medium">Equipment Checkout Alert</p>
                                        <p className="text-xs text-muted-foreground">Alert group when item is checked out</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 text-[11px] font-semibold bg-[#25d366]/10 text-[#25d366] rounded-full">ACTIVE</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-muted/30 dark:bg-[#202022] rounded-xl border border-border dark:border-[#3a3a3c]">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">↩️</span>
                                    <div>
                                        <p className="text-sm font-medium">Equipment Return Alert</p>
                                        <p className="text-xs text-muted-foreground">Alert group when return is verified</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 text-[11px] font-semibold bg-[#25d366]/10 text-[#25d366] rounded-full">ACTIVE</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-muted/30 dark:bg-[#202022] rounded-xl border border-border dark:border-[#3a3a3c]">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">🎬</span>
                                    <div>
                                        <p className="text-sm font-medium">Daily Shoot Reminders</p>
                                        <p className="text-xs text-muted-foreground">Cron reminder before shoot dates</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 text-[11px] font-semibold bg-[#25d366]/10 text-[#25d366] rounded-full">ACTIVE</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Sent Activity Logs Table */}
                <div className="lg:col-span-7">
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-6 shadow-sm h-full flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                                    <span>📋</span> Activity & Sent Logs
                                </h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Real-time log of all dispatched messages</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Search logs..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="px-3 py-1.5 text-xs bg-muted/50 dark:bg-[#202022] border border-border dark:border-[#3a3a3c] rounded-xl focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex gap-2 mb-4 border-b border-border dark:border-[#3a3a3c] pb-3">
                            <button
                                onClick={() => setFilterType('ALL')}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterType === 'ALL' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                            >
                                All ({logs.length})
                            </button>
                            <button
                                onClick={() => setFilterType('GROUP')}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterType === 'GROUP' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                            >
                                Group Dispatches
                            </button>
                            <button
                                onClick={() => setFilterType('DIRECT')}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterType === 'DIRECT' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                            >
                                Direct Messages
                            </button>
                        </div>

                        {/* Logs List */}
                        <div className="flex-1 overflow-y-auto max-h-[600px] space-y-3 pr-1">
                            {loadingLogs ? (
                                <div className="p-8 text-center text-xs text-muted-foreground">Loading activity logs...</div>
                            ) : filteredLogs.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground">No dispatch logs found.</div>
                            ) : (
                                filteredLogs.map((log) => (
                                    <div key={log.id} className="p-4 bg-muted/30 dark:bg-[#202022] border border-border dark:border-[#3a3a3c] rounded-xl space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${log.type === 'DIRECT' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                    {log.type}
                                                </span>
                                                <span className="font-semibold text-foreground">{log.recipient}</span>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground">
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        <p className="text-xs text-foreground whitespace-pre-line font-mono bg-background/50 dark:bg-[#1a1a1c] p-2.5 rounded-lg border border-border/50 dark:border-[#3a3a3c]/50">
                                            {log.message}
                                        </p>

                                        <div className="flex items-center justify-between text-[11px] pt-1">
                                            {log.mentions && log.mentions.length > 0 ? (
                                                <span className="text-[#25d366] font-medium">🏷️ Tagged: {log.mentions.join(', ')}</span>
                                            ) : (
                                                <span></span>
                                            )}
                                            <span className={`font-semibold ${log.status === 'SUCCESS' ? 'text-[#25d366]' : 'text-destructive'}`}>
                                                {log.status === 'SUCCESS' ? '✓ Dispatched' : '✗ Failed'}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* QR Code Scan Modal */}
            {showQrModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl relative">
                        <button
                            onClick={() => setShowQrModal(false)}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-xl font-bold"
                        >
                            ✕
                        </button>

                        <h3 className="text-lg font-bold">Scan WhatsApp QR Code</h3>
                        <p className="text-xs text-muted-foreground mt-1 mb-4">Open WhatsApp → Linked Devices → Link a Device</p>

                        {status?.qrDataUrl ? (
                            <div className="flex justify-center">
                                <img src={status.qrDataUrl} alt="WhatsApp QR Code" className="w-64 h-64 border-4 border-white rounded-xl shadow-md" />
                            </div>
                        ) : (
                            <div className="p-8 bg-muted rounded-xl text-xs text-muted-foreground">
                                Session active or waiting for QR generator on gateway...
                            </div>
                        )}

                        <button
                            onClick={() => setShowQrModal(false)}
                            className="mt-6 w-full py-2.5 bg-muted hover:bg-muted/80 text-sm font-semibold rounded-xl"
                        >
                            Close Modal
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
