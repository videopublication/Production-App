import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Bypass SSL for local development windows issues
if (process.env.NODE_ENV === 'development') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, title, message, link } = body;

        console.log('[send-notification] Request received:', { token: token?.substring(0, 20) + '...', title, message, link });

        if (!token) {
            return NextResponse.json({ error: 'Missing FCM token' }, { status: 400 });
        }

        // Check if Firebase Admin is initialized
        if (!admin.apps.length) {
            console.error('[send-notification] Firebase Admin not initialized!');
            console.log('[send-notification] Env vars:', {
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY
            });
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

        const result = await admin.messaging().send(payload);
        console.log('[send-notification] Success! Message ID:', result);

        return NextResponse.json({ success: true, messageId: result });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('[send-notification] Error:', err.message);
        console.error('[send-notification] Stack:', err.stack);
        return NextResponse.json({ error: 'Failed to send notification', details: err.message }, { status: 500 });
    }
}
