'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/Button';
import { useToast } from '@/lib/toast-context';
import { Send, X, ExternalLink, MessageSquareText } from 'lucide-react';

interface WhatsAppDispatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    initialMessage: string;
    mentions?: string[];
    targetName?: string;
    targetPhone?: string;
    departmentId?: string;
    onSuccess?: () => void;
}

export const WhatsAppDispatchModal: React.FC<WhatsAppDispatchModalProps> = (props) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!props.isOpen || !mounted) return null;

    return createPortal(<WhatsAppDispatchModalInner {...props} />, document.body);
};

const WhatsAppDispatchModalInner: React.FC<WhatsAppDispatchModalProps> = ({
    isOpen,
    onClose,
    title = 'Dispatch WhatsApp Notification',
    initialMessage,
    mentions,
    targetName,
    targetPhone,
    departmentId,
    onSuccess
}) => {
    const { showToast } = useToast();
    const [message, setMessage] = useState(initialMessage || '');
    const [isSending, setIsSending] = useState(false);
    const [resolvedGroupName, setResolvedGroupName] = useState<string>(targetName || 'VP Media Production Group');

    // Keep message synced when modal opens or initialMessage changes
    useEffect(() => {
        if (isOpen) {
            setMessage(initialMessage || '');
        }
    }, [isOpen, initialMessage]);

    // Fetch actual target group subject name if default or not provided
    useEffect(() => {
        if (!isOpen) return;

        if (targetPhone) {
            setResolvedGroupName(`Direct (${targetPhone})`);
            return;
        }

        if (targetName && targetName !== 'Configured WhatsApp Group' && targetName !== 'Production Group') {
            setResolvedGroupName(targetName);
            return;
        }

        const fetchTargetGroup = async () => {
            try {
                // 1. Fetch current configured group JID from status API
                const statusRes = await fetch('/api/whatsapp/status');
                let targetJid = '';
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    targetJid = statusData.groupJid || '';
                }

                // 2. Fetch groups list from API to resolve target group subject name
                const res = await fetch('/api/whatsapp/groups');
                if (res.ok) {
                    const data = await res.json();
                    if (data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
                        const matchedGroup = targetJid ? data.groups.find((g: any) => g.id === targetJid) : null;
                        if (matchedGroup && matchedGroup.subject) {
                            setResolvedGroupName(matchedGroup.subject);
                        } else {
                            setResolvedGroupName(data.groups[0].subject || 'VP Media Production Group');
                        }
                    }
                }
            } catch (e) {
                console.warn('Could not fetch target group subject:', e);
            }
        };
        fetchTargetGroup();
    }, [isOpen, targetName, targetPhone]);

    if (!isOpen) return null;

    const handleSendDirect = async () => {
        if (!message.trim() || isSending) return;
        setIsSending(true);
        try {
            const payload: any = {
                message,
                mentions,
                departmentId,
                type: targetPhone ? 'DIRECT' : 'GROUP',
                target: targetPhone || undefined
            };

            const res = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok && data.success) {
                showToast(`Message dispatched to ${resolvedGroupName}!`, 'success');
                if (onSuccess) onSuccess();
                onClose();
            } else {
                showToast(data.error || 'Gateway offline. Opening WhatsApp App...', 'warning');
                window.open(`https://wa.me/${targetPhone ? targetPhone.replace(/[^\d]/g, '') : ''}?text=${encodeURIComponent(message)}`, '_blank');
                onClose();
            }
        } catch {
            showToast('Gateway connection error. Opening WhatsApp App...', 'warning');
            window.open(`https://wa.me/${targetPhone ? targetPhone.replace(/[^\d]/g, '') : ''}?text=${encodeURIComponent(message)}`, '_blank');
            onClose();
        } finally {
            setIsSending(false);
        }
    };

    const handleOpenExternal = () => {
        window.open(`https://wa.me/${targetPhone ? targetPhone.replace(/[^\d]/g, '') : ''}?text=${encodeURIComponent(message)}`, '_blank');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="px-5 py-4 bg-secondary/30 border-b border-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-3.5 min-w-0">
                        {/* WhatsApp Icon Circle */}
                        <div className="w-10 h-10 rounded-full bg-[#25d366] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#25d366]/20">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                            </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base font-bold text-foreground tracking-tight truncate">{title}</h3>
                            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                <span className="text-xs text-muted-foreground shrink-0">Destination Group:</span>
                                <span className="inline-flex items-center text-xs font-semibold text-[#25d366] bg-[#25d366]/10 px-2.5 py-0.5 rounded-full border border-[#25d366]/20 truncate max-w-[280px]">
                                    {resolvedGroupName}
                                </span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
                        title="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-5 space-y-3 flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-foreground tracking-wide uppercase flex items-center gap-1.5">
                            <MessageSquareText className="w-3.5 h-3.5 text-muted-foreground" />
                            Message Content (Preview & Edit)
                        </label>
                        <span className="text-[11px] text-muted-foreground">Editable text</span>
                    </div>

                    <textarea
                        rows={10}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Message content preview..."
                        className="w-full bg-secondary/40 border border-border/80 rounded-xl p-3.5 text-xs text-foreground font-mono leading-relaxed outline-none focus:ring-2 focus:ring-[#25d366]/40 focus:border-[#25d366]/50 transition-all resize-none shadow-inner"
                    />
                </div>

                {/* Footer Bar */}
                <div className="px-5 py-4 bg-secondary/20 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleOpenExternal}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer whitespace-nowrap shrink-0"
                    >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Open in WhatsApp App instead</span>
                    </button>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            disabled={isSending}
                            className="px-4 text-xs font-semibold hover:bg-secondary"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSendDirect}
                            isLoading={isSending}
                            className="bg-[#25d366] hover:bg-[#20bd5a] text-white font-bold text-xs h-10 px-5 rounded-xl shadow-md shadow-[#25d366]/20 transition-all whitespace-nowrap"
                        >
                            <Send className="w-3.5 h-3.5 mr-2" />
                            Send to Group
                        </Button>
                    </div>
                </div>

            </div>
        </div>
    );
};
