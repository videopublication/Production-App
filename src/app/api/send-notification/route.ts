import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

const allowedDirectTokenSenderRoles = new Set(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);
const elevatedSenderRoles = new Set(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);
const operationalRecipientRoles = new Set(['ADMIN', 'MANAGER', 'SUPER_ADMIN']);

const notificationSchema = z.object({
    token: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    userIds: z.array(z.string().min(1)).min(1).max(500).optional(),
    title: z.string().min(1).max(120),
    message: z.string().min(1).max(1000),
    link: z.string().optional(),
}).refine((value) => {
    const targets = [
        value.token,
        value.userId,
        value.userIds && value.userIds.length > 0 ? value.userIds : undefined,
    ].filter(Boolean);

    return targets.length === 1;
}, {
    message: 'Provide exactly one target: token, userId, or userIds',
    path: ['target'],
});

type SenderProfile = {
    id: string;
    role: string;
    status: string;
    department_id: string | null;
};

type TargetUser = {
    id: string;
    role: string;
    status: string;
    department_id: string | null;
    fcm_token: string | null;
};

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

async function clearInvalidTokens(tokens: string[]) {
    if (tokens.length === 0) return;

    const supabaseAdmin = getSupabaseAdmin();

    const { error: tokenError } = await supabaseAdmin
        .from('push_tokens')
        .delete()
        .in('token', tokens);

    if (tokenError) {
        console.error('[send-notification] Failed to delete invalid push tokens:', tokenError);
    }

    const { error: userError } = await supabaseAdmin
        .from('users')
        .update({ fcm_token: null })
        .in('fcm_token', tokens);

    if (userError) {
        console.error('[send-notification] Failed to clear invalid legacy FCM tokens:', userError);
    }
}

async function ensureAuthenticatedSender() {
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
        .select('id, role, status, department_id')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
        console.error('[send-notification] Sender profile lookup failed:', profileError);
        return { error: 'Sender profile not found', status: 403 } as const;
    }

    if (profile.status !== 'ACTIVE') {
        return { error: 'Sender is not active', status: 403 } as const;
    }

    return { profile: profile as SenderProfile } as const;
}

async function getAuthorizedTargetUsers(sender: SenderProfile, requestedUserIds: string[]) {
    const uniqueUserIds = Array.from(new Set(requestedUserIds));
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, role, status, department_id, fcm_token')
        .in('id', uniqueUserIds);

    if (error) {
        throw new Error(`Target user lookup failed: ${error.message}`);
    }

    const users = (data || []) as TargetUser[];
    const foundIds = new Set(users.map((target) => target.id));
    const missingIds = uniqueUserIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
        return { error: 'One or more target users were not found', status: 404 } as const;
    }

    const unauthorized = users.filter((target) => {
        if (target.status !== 'ACTIVE') return true;
        if (sender.role === 'SUPER_ADMIN') return false;
        if (target.role === 'SUPER_ADMIN') return false;
        if (target.department_id !== sender.department_id) return true;
        if (elevatedSenderRoles.has(sender.role)) return false;
        return !operationalRecipientRoles.has(target.role);
    });

    if (unauthorized.length > 0) {
        return { error: 'Cannot notify users outside your department', status: 403 } as const;
    }

    return { users } as const;
}

async function getTokensForUsers(users: TargetUser[]) {
    const userIds = users.map((target) => target.id);
    const tokensByUserId = new Map<string, Set<string>>();
    users.forEach((target) => {
        const tokens = new Set<string>();
        if (target.fcm_token) tokens.add(target.fcm_token);
        tokensByUserId.set(target.id, tokens);
    });

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
        .from('push_tokens')
        .select('token, user_id')
        .in('user_id', userIds);

    if (error) {
        console.error('[send-notification] Push token lookup failed, using legacy tokens only:', error);
    } else {
        (data || []).forEach((row: { token?: string | null; user_id?: string | null }) => {
            if (!row.token || !row.user_id) return;
            const tokens = tokensByUserId.get(row.user_id) || new Set<string>();
            tokens.add(row.token);
            tokensByUserId.set(row.user_id, tokens);
        });
    }

    const tokens = Array.from(tokensByUserId.values()).flatMap((userTokens) => Array.from(userTokens));
    const missingUserCount = Array.from(tokensByUserId.values()).filter((userTokens) => userTokens.size === 0).length;

    return {
        tokens: Array.from(new Set(tokens)),
        missingUserCount,
    };
}

function getNotificationLinks(link?: string) {
    const rawLink = link || '/notifications';
    if (/^https?:\/\//i.test(rawLink)) {
        return {
            dataLink: rawLink,
            webPushLink: rawLink,
        };
    }

    const dataLink = rawLink.startsWith('/') ? rawLink : `/${rawLink}`;
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    const origin = configuredOrigin.replace(/\/$/, '');

    return {
        dataLink,
        webPushLink: origin ? `${origin}${dataLink}` : dataLink,
    };
}

function buildMessage(token: string, title: string, message: string, link?: string): admin.messaging.Message {
    const { dataLink, webPushLink } = getNotificationLinks(link);
    const timestamp = Date.now().toString();
    const tag = `vp-app-${dataLink}`;

    return {
        token,
        notification: {
            title,
            body: message,
        },
        data: {
            link: dataLink,
            title,
            message,
            body: message,
            timestamp,
            tag,
        },
        webpush: {
            headers: {
                Urgency: 'high',
            },
            notification: {
                title,
                body: message,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag,
                data: {
                    link: dataLink,
                },
                requireInteraction: false,
                silent: false,
            },
            fcmOptions: {
                link: webPushLink,
            },
        },
    };
}

async function sendToTokens(tokens: string[], title: string, message: string, link?: string) {
    const messaging = getFirebaseMessaging();
    const results = await Promise.all(tokens.map(async (token) => {
        try {
            const messageId = await messaging.send(buildMessage(token, title, message, link));
            return { token, success: true, messageId };
        } catch (error: unknown) {
            const err = error as Error;
            return {
                token,
                success: false,
                stale: isUnregisteredTokenError(error),
                error: err.message || 'Unknown push send error',
            };
        }
    }));

    const staleTokens = results
        .filter((result) => !result.success && 'stale' in result && result.stale)
        .map((result) => result.token);

    await clearInvalidTokens(staleTokens);

    return {
        results,
        sent: results.filter((result) => result.success).length,
        failed: results.filter((result) => !result.success).length,
        staleTokens: staleTokens.length,
    };
}

export async function POST(request: Request) {
    const auth = await ensureAuthenticatedSender();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const body = await request.json();
        const result = notificationSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { token, userId, userIds, title, message, link } = result.data;
        let tokens: string[] = [];
        let targetUserCount = 0;
        let missingTokenUsers = 0;

        if (token) {
            if (!allowedDirectTokenSenderRoles.has(auth.profile.role)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            tokens = [token];
        } else {
            const requestedUserIds = userId ? [userId] : userIds!;
            targetUserCount = requestedUserIds.length;
            const targets = await getAuthorizedTargetUsers(auth.profile, requestedUserIds);
            if ('error' in targets) {
                return NextResponse.json({ error: targets.error }, { status: targets.status });
            }

            const tokenResult = await getTokensForUsers(targets.users);
            tokens = tokenResult.tokens;
            missingTokenUsers = tokenResult.missingUserCount;
        }

        if (tokens.length === 0) {
            return NextResponse.json({
                success: false,
                attempted: 0,
                sent: 0,
                failed: 0,
                staleTokens: 0,
                missingTokens: targetUserCount || 1,
                message: 'No registered push devices found',
            });
        }

        console.log('[send-notification] Sending push:', {
            sender: auth.profile.id,
            senderRole: auth.profile.role,
            targetUserCount,
            deviceCount: tokens.length,
            title,
            link: link || '/notifications',
        });

        const sendResult = await sendToTokens(tokens, title, message, link);

        return NextResponse.json({
            success: sendResult.sent > 0,
            attempted: tokens.length,
            sent: sendResult.sent,
            failed: sendResult.failed,
            staleTokens: sendResult.staleTokens,
            missingTokens: missingTokenUsers,
            failures: sendResult.results
                .filter((result) => !result.success)
                .map((result) => ({
                    token: `${result.token.substring(0, 12)}...`,
                    error: 'error' in result ? result.error : 'Unknown push send error',
                })),
        });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('[send-notification] Error:', err.message);
        return NextResponse.json({ error: 'Failed to send notification', details: err.message }, { status: 500 });
    }
}
