import { NextResponse } from 'next/server';
import { sendWhatsAppGroupMessage, sendWhatsAppPoll } from '@/lib/whatsapp-service';

export const dynamic = 'force-dynamic';

// Memory store for recent activity logs (persisted across page reloads in server process memory)
export interface WhatsAppLogItem {
    id: string;
    timestamp: string;
    type: 'GROUP' | 'DIRECT' | 'POLL' | 'SYSTEM_ALERT';
    recipient: string;
    message: string;
    status: 'SUCCESS' | 'FAILED';
    mentions?: string[];
    error?: string;
}

// Global activity logs store
const globalLogs: WhatsAppLogItem[] = [
    {
        id: 'init-1',
        timestamp: new Date().toISOString(),
        type: 'DIRECT',
        recipient: 'Ayush (919360546810)',
        message: 'Namaskaram Ayush 🙏\n\nDirect 1-on-1 test message delivered.',
        status: 'SUCCESS',
        mentions: ['919360546810@s.whatsapp.net']
    },
    {
        id: 'init-2',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        type: 'GROUP',
        recipient: 'VP App Testing Group',
        message: 'Namaskaram @919360546810! Automatic user tagging verified.',
        status: 'SUCCESS',
        mentions: ['919360546810@s.whatsapp.net']
    }
];

export async function GET() {
    return NextResponse.json({ logs: globalLogs });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { type = 'GROUP', target, message, mentions, options, pollName, selectableCount, departmentId } = body;

        const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');
        const groupJid = process.env.WHATSAPP_GROUP_JID || '120363424310845566@g.us';

        let success = false;
        let recipientLabel = '';
        let errorMsg = '';
        let logMessageText = message || '';

        if (type === 'POLL') {
            const question = pollName || message;
            if (!question || !options || !Array.isArray(options) || options.length < 2) {
                return NextResponse.json({ error: 'Poll title and at least 2 options are required' }, { status: 400 });
            }

            recipientLabel = 'VP App Testing Group (Poll)';
            logMessageText = `📊 POLL: ${question}\nOptions: ${options.map((o: string, idx: number) => `\n ${idx + 1}. ${o}`).join('')}`;

            success = await sendWhatsAppPoll(question, options, selectableCount || 1, departmentId);
        } else if (type === 'DIRECT') {
            if (!message || !message.trim()) {
                return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
            }
            const cleanNumber = (target || '').replace(/[^\d]/g, '');
            if (!cleanNumber) {
                return NextResponse.json({ error: 'Valid recipient phone number is required for direct message' }, { status: 400 });
            }
            const jid = `${cleanNumber}@s.whatsapp.net`;
            recipientLabel = `Direct (${cleanNumber})`;

            // Dispatch direct message to gateway
            const endpoint = `${gatewayUrl}/message/sendText/vp-app-1`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: jid, text: message, mentions })
            });

            if (res.ok) {
                success = true;
            } else {
                errorMsg = await res.text();
                // Fallback to custom gateway format
                const altRes = await fetch(`${gatewayUrl}/send-group-message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupJid: jid, message, mentions })
                });
                if (altRes.ok) success = true;
            }
        } else {
            // Group Dispatch
            if (!message || !message.trim()) {
                return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
            }
            recipientLabel = 'VP App Testing Group';
            success = await sendWhatsAppGroupMessage(message, mentions, departmentId);
        }

        const logEntry: WhatsAppLogItem = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            timestamp: new Date().toISOString(),
            type: type === 'POLL' ? 'POLL' : (type === 'DIRECT' ? 'DIRECT' : 'GROUP'),
            recipient: recipientLabel,
            message: logMessageText.substring(0, 300),
            status: success ? 'SUCCESS' : 'FAILED',
            mentions: mentions || [],
            error: success ? undefined : (errorMsg || 'Failed to dispatch message to gateway')
        };

        globalLogs.unshift(logEntry);
        // Keep max 100 recent logs
        if (globalLogs.length > 100) globalLogs.pop();

        if (!success) {
            return NextResponse.json({ error: errorMsg || 'Failed to send message via gateway' }, { status: 500 });
        }

        return NextResponse.json({ success: true, log: logEntry });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
