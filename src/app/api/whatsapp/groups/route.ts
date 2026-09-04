import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const configuredUrl = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';
    const candidateUrls = Array.from(new Set([
        configuredUrl.replace(/\/$/, ''),
        'http://localhost:3001',
        'https://vp-whatsapp-gateway.onrender.com'
    ])).filter(Boolean);

    let lastError: string = '';

    for (const gatewayUrl of candidateUrls) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(`${gatewayUrl}/groups`, {
                cache: 'no-store',
                headers: {
                    'apikey': process.env.WHATSAPP_EVOLUTION_API_KEY || ''
                },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                return NextResponse.json(data);
            } else {
                const errText = await res.text();
                lastError = `Gateway (${gatewayUrl}) returned status ${res.status}: ${errText}`;
            }
        } catch (err: any) {
            lastError = err.message || 'Connection failed';
        }
    }

    return NextResponse.json({
        error: lastError || 'Failed to fetch groups from any available WhatsApp gateway'
    }, { status: 500 });
}
