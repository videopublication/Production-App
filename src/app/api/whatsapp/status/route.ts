import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return null;
    return createClient(supabaseUrl, supabaseServiceKey);
};

export async function GET() {
    const configuredUrl = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';
    const groupJid = process.env.WHATSAPP_GROUP_JID || '120363424310845566@g.us';
    const instanceName = process.env.WHATSAPP_EVOLUTION_INSTANCE || 'vp-app-1';

    const candidateUrls = Array.from(new Set([
        configuredUrl.replace(/\/$/, ''),
        'http://localhost:3001',
        'https://vp-whatsapp-gateway.onrender.com'
    ])).filter(Boolean);

    let lastStatusResult: any = null;

    for (const gatewayUrl of candidateUrls) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const healthRes = await fetch(`${gatewayUrl}/health`, {
                cache: 'no-store',
                headers: {
                    'apikey': process.env.WHATSAPP_EVOLUTION_API_KEY || ''
                },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (healthRes.ok) {
                const healthData = await healthRes.json();
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

                const result = {
                    status: healthData.connected ? 'connected' : (healthData.state || 'qr_ready'),
                    connected: Boolean(healthData.connected),
                    gatewayUrl,
                    groupJid,
                    instanceName,
                    qrDataUrl,
                    lastChecked: new Date().toISOString()
                };

                // If this candidate is connected, immediately choose it
                if (healthData.connected) {
                    return NextResponse.json(result);
                }

                if (!lastStatusResult) {
                    lastStatusResult = result;
                }
            }
        } catch {
            // Keep trying other candidates
        }
    }

    if (lastStatusResult) {
        return NextResponse.json(lastStatusResult);
    }

    return NextResponse.json({
        status: 'offline',
        connected: false,
        gatewayUrl: configuredUrl,
        groupJid,
        instanceName,
        error: 'WhatsApp Gateway offline. Please start local gateway or verify network.'
    });
}

// DELETE Handler to Disconnect / Reset WhatsApp Session
export async function DELETE() {
    const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');

    try {
        // 1. Clear Supabase whatsapp_sessions table directly as double safety
        const supabase = getSupabaseAdmin();
        if (supabase) {
            try {
                await supabase.from('whatsapp_sessions').delete().neq('id', 'keep_table_alive');
            } catch (sErr) {
                console.warn('[WhatsApp Status API] Could not clear Supabase session rows:', sErr);
            }
        }

        // 2. Clear local auth folder if running locally
        try {
            const authDir = process.env.AUTH_DIR || path.join(os.tmpdir(), 'vp_whatsapp_auth_info');
            if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
            }
        } catch (fErr) {
            console.warn('[WhatsApp Status API] Could not clear local auth dir:', fErr);
        }

        // 3. Trigger gateway reset endpoint
        try {
            await fetch(`${gatewayUrl}/logout`, {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (gErr) {
            console.warn('[WhatsApp Status API] Gateway reset trigger offline:', gErr);
        }

        return NextResponse.json({
            success: true,
            message: 'WhatsApp session reset cleanly. Fresh QR generating...'
        });
    } catch (err: any) {
        return NextResponse.json({
            success: true,
            message: 'Session cleared locally.',
            warning: err.message
        });
    }
}
