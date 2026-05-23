import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

const allowedSenderRoles = new Set(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);

const notificationSchema = z.object({
    token: z.string().min(1),
    title: z.string().min(1),
    message: z.string().min(1),
    link: z.string().optional(),
});

function isUnregisteredTokenError(error: unknown) {
    const err = error as {
        code?: string;
        message?: string;
        errorInfo?: { code?: string; message?: string };
    };

    const code = err.code || err.errorInfo?.code || '';
    const message = `${err.message || ''} ${err.errorInfo?.message || ''}`.toLowerCase();

    return code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token'
        || message.includes('device unregistered')
        || message.includes('registration-token-not-registered')
        || message.includes('requested entity was not found');
}

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase service role environment variables');
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

function getFirebaseMessaging() {
    if (!admin.apps.length) {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!projectId || !clientEmail || !privateKey) {
            throw new Error('Missing Firebase Admin environment variables');
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }

    return admin.messaging();
}

async function clearInvalidToken(token: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
        .from('users')
        .update({ fcm_token: null })
        .eq('fcm_token', token);

    if (error) {
        console.error('[send-notification] Failed to clear invalid token:', error);
    } else {
        console.warn('[send-notification] Cleared invalid FCM token from user profiles');
    }
}

async function ensureCanSendNotifications() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
            },
        }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { error: 'Unauthorized', status: 401 } as const;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
        console.error('[send-notification] Sender profile lookup failed:', profileError);
        return { error: 'Sender profile not found', status: 403 } as const;
    }

    if (!allowedSenderRoles.has(profile.role)) {
        return { error: 'Forbidden', status: 403 } as const;
    }

    return { userId: user.id, role: profile.role } as const;
}

export async function POST(request: Request) {
    const auth = await ensureCanSendNotifications();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let tokenForCleanup: string | null = null;

    try {
        const body = await request.json();
        const result = notificationSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { token, title, message, link } = result.data;
        tokenForCleanup = token;
        const notificationLink = link || '/notifications';

        const payload: admin.messaging.Message = {
            token,
            notification: {
                title,
                body: message,
            },
            data: {
                link: notificationLink,
                title,
                message,
                body: message,
            },
            webpush: {
                headers: {
                    Urgency: 'high',
                },
                fcmOptions: {
                    link: notificationLink,
                },
                notification: {
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    data: {
                        link: notificationLink,
                    },
                },
            },
        };

        console.log('[send-notification] Sending push:', {
            sender: auth.userId,
            senderRole: auth.role,
            token: `${token.substring(0, 20)}...`,
            title,
            link: notificationLink,
        });

        const messageId = await getFirebaseMessaging().send(payload);
        return NextResponse.json({ success: true, messageId });
    } catch (error: unknown) {
        const err = error as Error;
        if (tokenForCleanup && isUnregisteredTokenError(error)) {
            await clearInvalidToken(tokenForCleanup);
            return NextResponse.json(
                { error: 'Device unregistered', code: 'FCM_TOKEN_UNREGISTERED' },
                { status: 410 }
            );
        }

        console.error('[send-notification] Error:', err.message);
        return NextResponse.json({ error: 'Failed to send notification', details: err.message }, { status: 500 });
    }
}
