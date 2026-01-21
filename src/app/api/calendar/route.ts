import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export async function POST(req: NextRequest) {
    return handleRequest(req, 'POST');
}

export async function PUT(req: NextRequest) {
    return handleRequest(req, 'PUT');
}

export async function DELETE(req: NextRequest) {
    return handleRequest(req, 'DELETE');
}

async function handleRequest(req: NextRequest, method: string) {
    try {
        const body = await req.json();
        const { eventId, event, accessToken, refreshToken } = body;

        let token = accessToken;
        let url = GOOGLE_CALENDAR_API_BASE;

        if (eventId) {
            url += `/${eventId}`;
        }

        // Needed for sendUpdates=all param
        url += '?sendUpdates=all';

        // 1. Try Request with current Access Token
        let response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: method !== 'DELETE' ? JSON.stringify(event) : undefined,
        });

        // 2. If 401 Unauthorized AND we have a Refresh Token, try to refresh
        if (response.status === 401 && refreshToken) {
            console.log('Access token expired. Attempting refresh...');

            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in server env');
                return NextResponse.json({
                    error: { message: 'Server configuration error: Missing Google Credentials' }
                }, { status: 500 });
            }

            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                }),
            });

            if (!refreshResponse.ok) {
                const err = await refreshResponse.text();
                console.error('Failed to refresh token:', err);
                // Return the ORIGINAL 401 response so the frontend knows auth failed completely
                return NextResponse.json({ error: { message: 'Session expired. Please log in again.' } }, { status: 401 });
            }

            const newTokens = await refreshResponse.json();
            token = newTokens.access_token;

            console.log('Token refreshed successfully. Retrying request...');

            // 3. Retry Request with NEW Access Token
            response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: method !== 'DELETE' ? JSON.stringify(event) : undefined,
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                return NextResponse.json(errorJson, { status: response.status });
            } catch {
                return NextResponse.json({ error: { message: errorText } }, { status: response.status });
            }
        }

        // For DELETE, response might be empty
        if (method === 'DELETE') {
            return NextResponse.json({ success: true });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('API Route Error:', error);
        return NextResponse.json({ error: { message: error.message || 'Internal Server Error' } }, { status: 500 });
    }
}
