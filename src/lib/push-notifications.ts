export interface PushNotificationPayload {
    token: string;
    title: string;
    message: string;
    link?: string;
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

export async function sendPushNotification(payload: PushNotificationPayload) {
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
