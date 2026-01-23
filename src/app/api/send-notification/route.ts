import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// Ideally, use a service account JSON file or individual env vars for the private key
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
    } catch (error) {
        console.error('Firebase Admin Init Error:', error);
    }
}

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ... (imports remain)

import { z } from 'zod';

const notificationSchema = z.object({
    token: z.string().min(1),
    title: z.string().min(1),
    message: z.string().min(1),
    link: z.string().optional()
});

export async function POST(request: Request) {
    // 1. Security Check
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() }
            }
        }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.app_metadata?.role
    if (role !== 'ADMIN' && role !== 'MANAGER') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await request.json();

        const result = notificationSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { token, title, message, link } = result.data;

        console.log('[send-notification] Request received:', { token: token?.substring(0, 20) + '...', title, message, link });


        // Check if Firebase Admin is initialized
        if (!admin.apps.length) {
            console.error('[send-notification] Firebase Admin not initialized!');
            // DO NOT log env vars in production
            return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
        }

        const payload = {
            notification: {
                title,
                body: message,
            },
            data: {
                link: link || '/',
            },
            token: token,
        };

        console.log('[send-notification] Sending with payload:', payload);

        const sendResult = await admin.messaging().send(payload);
        console.log('[send-notification] Success! Message ID:', sendResult);

        return NextResponse.json({ success: true, messageId: sendResult });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('[send-notification] Error:', err.message);
        console.error('[send-notification] Stack:', err.stack);
        return NextResponse.json({ error: 'Failed to send notification', details: err.message }, { status: 500 });
    }
}
