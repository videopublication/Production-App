import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');

    try {
        const res = await fetch(`${gatewayUrl}/groups`, {
            cache: 'no-store',
            headers: {
                'apikey': process.env.WHATSAPP_EVOLUTION_API_KEY || ''
            }
        });

        if (!res.ok) {
            if (res.status === 404) {
                return NextResponse.json({
                    error: 'The live Render gateway is running an older build without /groups endpoint. Please push to update Render!'
                }, { status: 404 });
            }
            const errText = await res.text();
            return NextResponse.json({ error: `Gateway returned status ${res.status}: ${errText}` }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        console.error('[WhatsApp Groups Proxy] Error:', err);
        return NextResponse.json({ error: err.message || 'Failed to fetch groups from gateway' }, { status: 500 });
    }
}
