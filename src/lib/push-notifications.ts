export interface PushNotificationPayload {
    token?: string;
    userId?: string;
    userIds?: string[];
    title: string;
    message: string;
    link?: string;
}

export interface PushNotificationResult {
    success: boolean;
    attempted: number;
    sent: number;
    failed: number;
    staleTokens: number;
    missingTokens: number;
    message?: string;
}

export class PushNotificationError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = 'PushNotificationError';
        this.status = status;
        this.code = code;
    }
}

export async function sendPushNotification(payload: PushNotificationPayload): Promise<PushNotificationResult> {
    const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const message = body?.details || body?.error || `Push request failed with status ${response.status}`;
        throw new PushNotificationError(message, response.status, body?.code);
    }

    return body;
}
