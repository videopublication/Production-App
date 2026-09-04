/**
 * Service to dispatch automated messages to a WhatsApp Group.
 * Supports both Evolution API (recommended for future-proofing) and Custom WhatsApp Gateway.
 */

import { supabase } from '@/lib/supabase';

export async function sendWhatsAppGroupMessage(
    message: string,
    mentions?: string[],
    departmentId?: string
): Promise<boolean> {
    let gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL;
    let groupJid = process.env.WHATSAPP_GROUP_JID || process.env.NEXT_PUBLIC_WHATSAPP_GROUP_JID;
    let apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY || process.env.WHATSAPP_BOT_SECRET;
    let instanceName = process.env.WHATSAPP_EVOLUTION_INSTANCE || 'vp-app';

    // If departmentId is specified, check department feature flags & custom settings
    if (departmentId) {
        try {
            const { data: dept } = await supabase
                .from('departments')
                .select('enabled_features, settings')
                .eq('id', departmentId)
                .single();

            if (dept) {
                const enabledFeatures: string[] = dept.enabled_features || [];
                const settings = dept.settings || {};

                // Skip if WhatsApp feature is not enabled for this department
                if (!enabledFeatures.includes('whatsapp') || settings.whatsappEnabled === false) {
                    console.log(`[WhatsApp Service] Skipping dispatch: WhatsApp feature is disabled for department ${departmentId}.`);
                    return false;
                }

                if (settings.whatsappGatewayUrl) gatewayUrl = settings.whatsappGatewayUrl as string;
                if (settings.whatsappGroupJid) groupJid = settings.whatsappGroupJid as string;
                if (settings.whatsappApiKey) apiKey = settings.whatsappApiKey as string;
                if (settings.whatsappInstanceName) instanceName = settings.whatsappInstanceName as string;
            }
        } catch (deptErr) {
            console.warn('[WhatsApp Service] Could not fetch department settings, falling back to default:', deptErr);
        }
    }

    const isEvolution = Boolean(
        (apiKey || process.env.WHATSAPP_GATEWAY_TYPE === 'evolution') &&
        !gatewayUrl?.includes('localhost') &&
        !gatewayUrl?.includes('127.0.0.1')
    );

    if (!gatewayUrl || !groupJid) {
        console.warn('[WhatsApp Service] Gateway URL or Group JID not configured in environment variables.');
        return false;
    }

    const candidateUrls = Array.from(new Set([
        gatewayUrl?.replace(/\/$/, ''),
        'http://localhost:3001',
        'https://vp-whatsapp-gateway.onrender.com'
    ])).filter(Boolean) as string[];

    for (const baseUrl of candidateUrls) {
        try {
            // 1. Try Custom Gateway format
            const endpoint = `${baseUrl}/send-group-message`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    groupJid,
                    message,
                    mentions,
                    secret: apiKey || '',
                }),
            });

            if (response.ok) {
                console.log(`[WhatsApp Service] Message successfully dispatched via ${baseUrl}.`);
                return true;
            }

            // 2. Try Evolution API format
            const evoEndpoint = `${baseUrl}/message/sendText/${instanceName}`;
            const evoResponse = await fetch(evoEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey || '',
                },
                body: JSON.stringify({
                    number: groupJid,
                    text: message,
                    options: mentions && mentions.length > 0 ? { mentions } : undefined,
                }),
            });

            if (evoResponse.ok) {
                console.log(`[WhatsApp Service] Message successfully dispatched via Evolution API (${baseUrl}).`);
                return true;
            }
        } catch (error: any) {
            console.warn(`[WhatsApp Service] Candidate ${baseUrl} failed:`, error.message);
        }
    }

    console.error('[WhatsApp Service] Failed to send message via all available gateways.');
    return false;
}

/**
 * Dispatch a native interactive WhatsApp Poll to a WhatsApp Group.
 */
export async function sendWhatsAppPoll(
    pollName: string,
    options: string[],
    selectableCount: number = 1,
    departmentId?: string
): Promise<boolean> {
    let gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL;
    let groupJid = process.env.WHATSAPP_GROUP_JID || process.env.NEXT_PUBLIC_WHATSAPP_GROUP_JID;
    let apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY || process.env.WHATSAPP_BOT_SECRET;

    if (departmentId) {
        try {
            const { data: dept } = await supabase
                .from('departments')
                .select('enabled_features, settings')
                .eq('id', departmentId)
                .single();

            if (dept) {
                const enabledFeatures: string[] = dept.enabled_features || [];
                const settings = dept.settings || {};

                if (!enabledFeatures.includes('whatsapp') || settings.whatsappEnabled === false) {
                    console.log(`[WhatsApp Service] Skipping poll: WhatsApp disabled for department ${departmentId}.`);
                    return false;
                }

                if (settings.whatsappGatewayUrl) gatewayUrl = settings.whatsappGatewayUrl as string;
                if (settings.whatsappGroupJid) groupJid = settings.whatsappGroupJid as string;
                if (settings.whatsappApiKey) apiKey = settings.whatsappApiKey as string;
            }
        } catch (deptErr) {
            console.warn('[WhatsApp Service] Could not fetch department settings for poll:', deptErr);
        }
    }

    if (!gatewayUrl || !groupJid) {
        console.warn('[WhatsApp Service] Gateway URL or Group JID missing for poll.');
        return false;
    }

    const candidateUrls = Array.from(new Set([
        gatewayUrl?.replace(/\/$/, ''),
        'http://localhost:3001',
        'https://vp-whatsapp-gateway.onrender.com'
    ])).filter(Boolean) as string[];

    for (const baseUrl of candidateUrls) {
        try {
            const endpoint = `${baseUrl}/send-poll`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groupJid,
                    pollName,
                    options,
                    selectableCount,
                    secret: apiKey || '',
                }),
            });

            if (response.ok) {
                console.log(`[WhatsApp Service] Native WhatsApp Poll dispatched successfully via ${baseUrl}.`);
                return true;
            }
        } catch (error: any) {
            console.warn(`[WhatsApp Service] Poll candidate ${baseUrl} failed:`, error.message);
        }
    }

    console.error('[WhatsApp Service] Failed to send WhatsApp Poll via all available gateways.');
    return false;
}
