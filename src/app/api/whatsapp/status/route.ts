import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');
    const groupJid = process.env.WHATSAPP_GROUP_JID || '120363424310845566@g.us';
    const instanceName = process.env.WHATSAPP_EVOLUTION_INSTANCE || 'vp-app-1';

    try {
        // 1. Health check from local microservice or gateway
        const healthRes = await fetch(`${gatewayUrl}/health`, {
            cache: 'no-store',
            headers: {
                'apikey': process.env.WHATSAPP_EVOLUTION_API_KEY || ''
            }
        });

        if (!healthRes.ok) {
            return NextResponse.json({
                status: 'offline',
                connected: false,
                gatewayUrl,
                groupJid,
                instanceName,
                error: `Gateway returned status ${healthRes.status}`
            });
        }

        const healthData = await healthRes.json();

        // 2. Fetch QR if available
        let qrDataUrl = null;
        if (!healthData.connected) {
            try {
                const qrRes = await fetch(`${gatewayUrl}/qr`, { cache: 'no-store' });
                if (qrRes.ok) {
                    const html = await qrRes.text();
                    const match = html.match(/src="(data:image\/png;base64,[^"]+)"/);
                    if (match && match[1]) {
                        qrDataUrl = match[1];
                    }
                }
            } catch (qrErr) {
                console.warn('[WhatsApp Status API] Could not fetch QR HTML:', qrErr);
            }
        }

        return NextResponse.json({
            status: healthData.connected ? 'connected' : (healthData.state || 'qr_ready'),
            connected: Boolean(healthData.connected),
            gatewayUrl,
            groupJid,
            instanceName,
            qrDataUrl,
            lastChecked: new Date().toISOString()
        });
    } catch (err: any) {
        return NextResponse.json({
            status: 'offline',
            connected: false,
            gatewayUrl,
            groupJid,
            instanceName,
            error: err.message || 'Connection refused'
        });
    }
}
