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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, title, message, link } = body;

        if (!token) {
            return NextResponse.json({ error: 'Missing FCM token' }, { status: 400 });
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

        await admin.messaging().send(payload);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error sending notification:', error);
        return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
    }
}
