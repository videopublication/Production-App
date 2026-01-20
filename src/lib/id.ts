/**
 * Generates a human-readable, unique transaction ID.
 * Format: TXN-XXXXXX (where X is an uppercase alphanumeric character)
 * Confusing characters (0, O, 1, I, L) are excluded for better readability.
 */
export function generateTransactionId(): string {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const length = 6;
    let result = '';

    // Using crypto.getRandomValues for better randomness
    const randomArray = new Uint8Array(length);
    if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(randomArray);
    } else {
        // Fallback for non-browser environments if needed
        for (let i = 0; i < length; i++) {
            randomArray[i] = Math.floor(Math.random() * 256);
        }
    }

    for (let i = 0; i < length; i++) {
        result += chars.charAt(randomArray[i] % chars.length);
    }

    return `TXN-${result}`;
}

/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID if available (Secure Context), otherwise falls back to Math.random.
 */
export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID && typeof window !== 'undefined' && window.isSecureContext) {
        return crypto.randomUUID();
    }

    // Fallback for insecure contexts (http) or older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
