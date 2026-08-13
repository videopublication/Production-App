'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import Link from 'next/link';

interface WhatsAppLog {
    id: string;
    timestamp: string;
    type: 'GROUP' | 'DIRECT' | 'POLL' | 'SYSTEM_ALERT';
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

interface WhatsAppGroup {
    id: string;
    subject: string;
    participantsCount: number;
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
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    // Group Discovery & Target JID State
    const [targetJid, setTargetJid] = useState('120363424310845566@g.us');
    const [joinedGroups, setJoinedGroups] = useState<WhatsAppGroup[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupSearchQuery, setGroupSearchQuery] = useState('');

    // Form state
    const [dispatchType, setDispatchType] = useState<'GROUP' | 'DIRECT' | 'POLL'>('GROUP');
    const [directPhone, setDirectPhone] = useState('');
    const [messageText, setMessageText] = useState('');
    const [pollTitle, setPollTitle] = useState("Who is available for scheduled shoot?");
    const [pollOptions, setPollOptions] = useState<string[]>(['Available 🟢', 'Busy 🔴', 'Tentative 🟡']);
    const [sending, setSending] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Logs filtering
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'ALL' | 'GROUP' | 'DIRECT' | 'POLL'>('ALL');

    // Clean, customizable templates (no hardcoded numbers)
    const templates = [
        {
            title: '🎬 Shoot Call Sheet Alert',
            text: `Namaskaram Team 🙏\n\n🎬 *SHOOT CALL SHEET REMINDER* 🎬\n\nShoot Location: Studio 1\nCall Time: 09:00 AM\n\nPlease confirm gear checkout status.\n\nPranam 🙏`
        },
        {
            title: '📦 Equipment Checkout Notice',
            text: `Namaskaram 🙏\n\n📦 *EQUIPMENT CHECKOUT NOTICE* 📦\n\nGear checked out from inventory.\nPlease verify return time before shoot conclusion.\n\nPranam 🙏`
        },
        {
            title: '↩️ Equipment Return Confirmation',
            text: `Namaskaram 🙏\n\n↩️ *EQUIPMENT RETURN CONFIRMED* ↩️\n\nAll gear has been verified and returned to storage.\n\nPranam 🙏`
        },
        {
            title: '📢 Production Announcement',
            text: `Namaskaram Team 🙏\n\n📢 *PRODUCTION ANNOUNCEMENT* 📢\n\nPlease update your availability calendar in the app.\n\nPranam 🙏`
        }
    ];

    const fetchStatus = async () => {
        setLoadingStatus(true);
        try {
            const res = await fetch('/api/whatsapp/status');
            const data = await res.json();
            setStatus(data);

            if (data.groupJid && data.groupJid !== targetJid) {
                setTargetJid(data.groupJid);
            }

            // Auto-close QR modal as soon as connection is verified
            if (data.connected || data.status === 'connected' || data.state === 'connected') {
                if (showQrModal) {
                    setShowQrModal(false);
                    setToast({ type: 'success', message: '✅ WhatsApp Connected & Live!' });
                }
            }
        } catch (err) {
            console.error('Failed to fetch status:', err);
            setStatus({
                status: 'offline',
                connected: false,
                gatewayUrl: 'http://localhost:3001',
                groupJid: targetJid,
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

        const pollInterval = showQrModal ? 3000 : 15000;
        const interval = setInterval(fetchStatus, pollInterval);
        return () => clearInterval(interval);
    }, [showQrModal]);

    const [showDisconnectModal, setShowDisconnectModal] = useState(false);

    const handleDisconnectWhatsApp = () => {
        setShowDisconnectModal(true);
    };

    const executeDisconnectWhatsApp = async () => {
        setShowDisconnectModal(false);
        setIsDisconnecting(true);
        try {
            const res = await fetch('/api/whatsapp/status', { method: 'DELETE' });
            if (res.ok) {
                setToast({ type: 'success', message: 'WhatsApp session logged out! Scan new QR code to pair.' });
                setStatus(prev => prev ? { ...prev, connected: false, status: 'disconnected', qrDataUrl: null } : null);
                setShowQrModal(true);
                setTimeout(fetchStatus, 2000);
            } else {
                const errData = await res.json().catch(() => ({}));
                setToast({ type: 'error', message: errData.error || 'Failed to log out session' });
            }
        } catch (err: any) {
            setToast({ type: 'error', message: err.message || 'Error disconnecting session' });
        } finally {
            setIsDisconnecting(false);
        }
    };

    const fetchJoinedGroups = async () => {
        if (!status?.connected) {
            setToast({ type: 'error', message: 'WhatsApp Gateway must be connected to discover groups.' });
            return;
        }

        setLoadingGroups(true);
        try {
            const res = await fetch('/api/whatsapp/groups');
            const data = await res.json();
            if (data.groups && Array.isArray(data.groups)) {
                setJoinedGroups(data.groups);
                setShowGroupModal(true);
            } else {
                setToast({ type: 'error', message: data.error || 'No active groups found on connected account' });
            }
        } catch (err: any) {
            console.error('Failed to discover groups:', err);
            setToast({ type: 'error', message: 'Could not connect to gateway group discovery' });
        } finally {
            setLoadingGroups(false);
        }
    };

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
                target: targetJid,
                departmentId: department?.id
            } : {
                type: dispatchType,
                target: dispatchType === 'DIRECT' ? directPhone : targetJid,
                message: messageText,
                departmentId: department?.id
            };

            const res = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setToast({ type: 'success', message: 'Message dispatched successfully!' });
                if (dispatchType !== 'POLL') setMessageText('');
                fetchLogs();
            } else {
                setToast({ type: 'error', message: data.error || 'Failed to send message' });
            }
        } catch (err: any) {
            console.error('Dispatch error:', err);
            setToast({ type: 'error', message: err.message || 'Error communicating with gateway' });
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
                            <p className="text-sm text-muted-foreground">Monitor gateway status, manage WhatsApp connection & dispatch announcements</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {status?.connected && (
                        <button
                            onClick={fetchJoinedGroups}
                            disabled={loadingGroups}
                            className="px-3.5 py-2 text-xs font-semibold bg-muted hover:bg-muted/80 rounded-xl flex items-center gap-1.5 transition-colors border border-border"
                        >
                            <span>🔍</span> {loadingGroups ? 'Discovering...' : 'Discover Groups'}
                        </button>
                    )}
                    <button
                        onClick={fetchStatus}
                        disabled={loadingStatus}
                        className="px-3.5 py-2 text-xs font-semibold bg-muted hover:bg-muted/80 rounded-xl flex items-center gap-1.5 transition-colors border border-border"
                    >
                        <svg className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh Health
                    </button>
                </div>
            </div>

            {/* Gateway Connection Control Banner */}
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
                                    <span className="h-3.5 w-3.5 rounded-full bg-amber-500 animate-pulse"></span>
                                    <span className="font-semibold text-base text-amber-500">
                                        {status?.status === 'qr_ready' ? 'Scan QR Code' : 'Gateway Offline'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Gateway URL</span>
                        <p className="font-mono text-xs mt-1 text-foreground font-medium truncate bg-muted/40 p-1.5 rounded-lg">{status?.gatewayUrl || 'http://localhost:3001'}</p>
                    </div>

                    <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target WhatsApp Group</span>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="text"
                                value={targetJid}
                                onChange={(e) => setTargetJid(e.target.value)}
                                placeholder="Group JID (e.g. 120363...@g.us)"
                                className="font-mono text-xs text-foreground bg-muted/40 px-2 py-1.5 rounded-lg border border-border outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                            onClick={executeDisconnectWhatsApp}
                            disabled={isDisconnecting}
                            className="px-3.5 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 border border-destructive/20 transition-all cursor-pointer"
                            title="Reset WhatsApp session & generate fresh pairing QR"
                        >
                            <span>🔌</span> {isDisconnecting ? 'Resetting...' : 'Reset Session'}
                        </button>

                        {!status?.connected && (
                            <button
                                onClick={() => setShowQrModal(true)}
                                className="px-3.5 py-2 bg-[#25d366] hover:bg-[#20bd5a] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                            >
                                <span>📷</span> Scan QR Code
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {toast && (
                <div className={`mb-6 p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm border ${toast.type === 'success' ? 'bg-[#25d366]/10 text-[#25d366] border-[#25d366]/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} className="text-current hover:opacity-75">✕</button>
                </div>
            )}

            {/* Main Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Form & Automation Controls */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Dispatch Form Card */}
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-6 shadow-sm">
                        <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
                            <span>🚀</span> Dispatch WhatsApp Message
                        </h2>

                        {/* Dispatch Type Tabs */}
                        <div className="flex bg-muted p-1 rounded-xl mb-5 text-xs font-semibold">
                            <button
                                onClick={() => setDispatchType('GROUP')}
                                className={`flex-1 py-2 rounded-lg transition-all ${dispatchType === 'GROUP' ? 'bg-background dark:bg-[#1c1c1e] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                👥 Group Dispatch
                            </button>
                            <button
                                onClick={() => setDispatchType('DIRECT')}
                                className={`flex-1 py-2 rounded-lg transition-all ${dispatchType === 'DIRECT' ? 'bg-background dark:bg-[#1c1c1e] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                📞 Direct 1-on-1
                            </button>
                            <button
                                onClick={() => setDispatchType('POLL')}
                                className={`flex-1 py-2 rounded-lg transition-all ${dispatchType === 'POLL' ? 'bg-background dark:bg-[#1c1c1e] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                📊 Group Poll
                            </button>
                        </div>

                        {/* Templates Selector */}
                        {dispatchType !== 'POLL' && (
                            <div className="mb-5 space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Templates</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {templates.map((tpl, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setMessageText(tpl.text)}
                                            className="p-2.5 text-left bg-muted/40 hover:bg-muted border border-border rounded-xl text-xs font-medium text-foreground transition-all truncate"
                                        >
                                            {tpl.title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleSendMessage} className="space-y-4">
                            {dispatchType === 'DIRECT' && (
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Recipient Phone Number</label>
                                    <input
                                        type="tel"
                                        required
                                        placeholder="e.g. +91 9876543210 or 919876543210"
                                        value={directPhone}
                                        onChange={e => setDirectPhone(e.target.value)}
                                        className="w-full bg-background dark:bg-[#1c1c1e] border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground font-mono outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                            )}

                            {dispatchType === 'POLL' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Poll Question / Title</label>
                                        <input
                                            type="text"
                                            required
                                            value={pollTitle}
                                            onChange={e => setPollTitle(e.target.value)}
                                            placeholder="Enter poll question..."
                                            className="w-full bg-background dark:bg-[#1c1c1e] border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary font-medium"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Poll Options (Min 2)</label>
                                        <div className="space-y-2">
                                            {pollOptions.map((opt, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-muted-foreground w-4">{idx + 1}.</span>
                                                    <input
                                                        type="text"
                                                        value={opt}
                                                        onChange={e => {
                                                            const copy = [...pollOptions];
                                                            copy[idx] = e.target.value;
                                                            setPollOptions(copy);
                                                        }}
                                                        className="flex-1 bg-background dark:bg-[#1c1c1e] border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    {pollOptions.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                                                            className="p-1.5 text-muted-foreground hover:text-destructive"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {pollOptions.length < 5 && (
                                            <button
                                                type="button"
                                                onClick={() => setPollOptions([...pollOptions, `Option ${pollOptions.length + 1}`])}
                                                className="mt-2 text-xs font-semibold text-primary hover:underline"
                                            >
                                                + Add Option
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Message Content</label>
                                    <textarea
                                        required
                                        rows={5}
                                        placeholder="Type message or tag team members using @91XXXXXXXXXX..."
                                        value={messageText}
                                        onChange={e => setMessageText(e.target.value)}
                                        className="w-full bg-background dark:bg-[#1c1c1e] border border-border rounded-xl p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary font-mono leading-relaxed"
                                    />
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Tip: Type <code className="bg-muted px-1 rounded">@91XXXXXXXXXX</code> in text to automatically tag specific team members.
                                    </p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={sending || (!status?.connected && dispatchType !== 'DIRECT')}
                                className="w-full py-3 bg-[#25d366] hover:bg-[#20bd5a] disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                <span>{sending ? '⏳ Dispatches Sending...' : '📤 Dispatch WhatsApp Message'}</span>
                            </button>
                        </form>
                    </div>

                    {/* Active Rules Status */}
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-6 shadow-sm">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Automated Trigger Rules</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-muted/30 dark:bg-[#202022] rounded-xl border border-border dark:border-[#3a3a3c]">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">📦</span>
                                    <div>
                                        <p className="text-xs font-medium">Equipment Checkout Alert</p>
                                        <p className="text-[11px] text-muted-foreground">Alert group when item is checked out</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 text-[10px] font-semibold bg-[#25d366]/10 text-[#25d366] rounded-full">ACTIVE</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-muted/30 dark:bg-[#202022] rounded-xl border border-border dark:border-[#3a3a3c]">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">↩️</span>
                                    <div>
                                        <p className="text-xs font-medium">Equipment Return Alert</p>
                                        <p className="text-[11px] text-muted-foreground">Alert group when return is verified</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 text-[10px] font-semibold bg-[#25d366]/10 text-[#25d366] rounded-full">ACTIVE</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-muted/30 dark:bg-[#202022] rounded-xl border border-border dark:border-[#3a3a3c]">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">🎬</span>
                                    <div>
                                        <p className="text-xs font-medium">Daily Shoot Reminders</p>
                                        <p className="text-[11px] text-muted-foreground">Cron reminder before shoot dates</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 text-[10px] font-semibold bg-[#25d366]/10 text-[#25d366] rounded-full">ACTIVE</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Activity Logs Table */}
                <div className="lg:col-span-7">
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl p-6 shadow-sm h-full flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                                    <span>📋</span> Activity & Sent Logs
                                </h2>
                                <p className="text-xs text-muted-foreground">Real-time log of dispatched messages</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Search logs..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="bg-background dark:bg-[#1c1c1e] border border-border text-xs px-3 py-1.5 rounded-xl outline-none focus:ring-1 focus:ring-primary w-40"
                                />
                            </div>
                        </div>

                        {/* Filter Pills */}
                        <div className="flex items-center gap-2 mb-4 text-xs font-semibold">
                            {(['ALL', 'GROUP', 'DIRECT', 'POLL'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFilterType(type)}
                                    className={`px-3 py-1.5 rounded-xl transition-all ${filterType === type ? 'bg-[#25d366] text-white shadow-sm' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}
                                >
                                    {type === 'ALL' ? `All (${logs.length})` : type}
                                </button>
                            ))}
                        </div>

                        {/* Logs List */}
                        <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-1">
                            {loadingLogs ? (
                                <div className="p-8 text-center text-xs text-muted-foreground">Loading activity logs...</div>
                            ) : filteredLogs.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
                                    No dispatched WhatsApp logs found.
                                </div>
                            ) : (
                                filteredLogs.map((log) => (
                                    <div key={log.id} className="p-4 bg-muted/20 dark:bg-[#202022] border border-border dark:border-[#3a3a3c] rounded-xl space-y-2.5 text-xs">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${log.type === 'POLL' ? 'bg-purple-500/10 text-purple-500' : log.type === 'DIRECT' ? 'bg-blue-500/10 text-blue-500' : 'bg-[#25d366]/10 text-[#25d366]'}`}>
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

                        {status?.connected ? (
                            <div className="py-6 space-y-3">
                                <div className="w-16 h-16 bg-[#25d366]/20 text-[#25d366] rounded-full flex items-center justify-center mx-auto text-3xl animate-bounce">
                                    ✓
                                </div>
                                <h3 className="text-lg font-bold text-[#25d366]">WhatsApp Connected!</h3>
                                <p className="text-xs text-muted-foreground">Session paired & live. Closing window...</p>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-lg font-bold">Scan WhatsApp QR Code</h3>
                                <p className="text-xs text-muted-foreground mt-1 mb-4">Open WhatsApp → Linked Devices → Link a Device</p>

                                {status?.qrDataUrl ? (
                                    <div className="flex justify-center">
                                        <img src={status.qrDataUrl} alt="WhatsApp QR Code" className="w-64 h-64 border-4 border-white rounded-xl shadow-md" />
                                    </div>
                                ) : (
                                    <div className="p-8 bg-muted rounded-xl text-xs text-muted-foreground flex flex-col items-center gap-2">
                                        <span className="animate-pulse text-lg">⏳</span>
                                        <span>Connecting to gateway & generating QR code...</span>
                                        <button
                                            onClick={fetchStatus}
                                            className="mt-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-xs rounded-lg transition-all"
                                        >
                                            🔄 Refresh QR Code Status
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={() => setShowQrModal(false)}
                                    className="mt-6 w-full py-2.5 bg-muted hover:bg-muted/80 text-sm font-semibold rounded-xl"
                                >
                                    Close Modal
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Group Discovery Modal */}
            {showGroupModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card dark:bg-[#2c2c2e] border border-border dark:border-[#3a3a3c] rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold flex items-center gap-2">
                                <span>🔍</span> Discovered WhatsApp Groups
                            </h3>
                            <button onClick={() => setShowGroupModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
                        </div>

                        {/* Search Input Bar */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search groups by name or JID..."
                                value={groupSearchQuery}
                                onChange={e => setGroupSearchQuery(e.target.value)}
                                className="w-full bg-background dark:bg-[#1c1c1e] border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[#25d366] pl-9 font-medium"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">🔎</span>
                            {groupSearchQuery && (
                                <button
                                    onClick={() => setGroupSearchQuery('')}
                                    className="absolute right-3 top-2.5 text-xs text-muted-foreground hover:text-foreground font-bold"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                            <span>Click any group to set as active target:</span>
                            <span className="font-semibold text-[#25d366]">
                                {joinedGroups.filter(g => g.subject.toLowerCase().includes(groupSearchQuery.toLowerCase()) || g.id.toLowerCase().includes(groupSearchQuery.toLowerCase())).length} of {joinedGroups.length} groups
                            </span>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {joinedGroups.filter(g => g.subject.toLowerCase().includes(groupSearchQuery.toLowerCase()) || g.id.toLowerCase().includes(groupSearchQuery.toLowerCase())).length === 0 ? (
                                <p className="text-xs text-muted-foreground p-6 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                                    {groupSearchQuery ? `No groups matching "${groupSearchQuery}"` : 'No joined groups found.'}
                                </p>
                            ) : (
                                joinedGroups
                                    .filter(g => g.subject.toLowerCase().includes(groupSearchQuery.toLowerCase()) || g.id.toLowerCase().includes(groupSearchQuery.toLowerCase()))
                                    .map((g) => (
                                        <div
                                            key={g.id}
                                            onClick={() => {
                                                setTargetJid(g.id);
                                                setShowGroupModal(false);
                                                setToast({ type: 'success', message: `Target group updated to "${g.subject}"` });
                                            }}
                                            className="p-3 bg-muted/40 hover:bg-muted/80 border border-border rounded-xl cursor-pointer transition-all flex items-center justify-between text-xs group"
                                        >
                                            <div className="min-w-0 pr-2">
                                                <span className="font-semibold text-foreground block truncate group-hover:text-[#25d366] transition-colors">{g.subject}</span>
                                                <span className="text-[11px] font-mono text-muted-foreground truncate block">{g.id}</span>
                                            </div>
                                            <span className="px-2.5 py-1 bg-[#25d366]/10 text-[#25d366] font-bold rounded-lg text-[10px] shrink-0">
                                                {g.participantsCount} members
                                            </span>
                                        </div>
                                    ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Disconnect Confirmation Modal */}
            {showDisconnectModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card dark:bg-[#2c2c2e] border border-destructive/30 dark:border-destructive/40 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl relative space-y-4 animate-in fade-in zoom-in duration-150">
                        <div className="w-14 h-14 bg-destructive/15 text-destructive rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                            ⚠️
                        </div>

                        <div>
                            <h3 className="text-base font-bold text-foreground">Disconnect WhatsApp Account?</h3>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                This will un-pair the currently active WhatsApp session and clear credentials. You will need to scan a new QR code to link another phone number.
                            </p>
                        </div>

                        <div className="pt-2 flex items-center gap-3">
                            <button
                                onClick={() => setShowDisconnectModal(false)}
                                className="flex-1 py-2.5 bg-muted hover:bg-muted/80 text-xs font-semibold rounded-xl text-foreground transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeDisconnectWhatsApp}
                                className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                            >
                                🔌 Yes, Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
