import { supabase } from '@/lib/supabase';
import { Shoot, User } from '@/types';
import { DepartmentLabels, getDepartmentLabels } from '@/lib/department-labels';

export const GOOGLE_CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.events';

/**
 * Checks if the current session has the required Google Calendar provider token.
 * Returns both access and refresh tokens.
 */
export async function getGoogleProviderToken() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session || !session.provider_token) {
        return null;
    }

    return {
        accessToken: session.provider_token,
        refreshToken: session.provider_refresh_token
    };
}

interface CalendarEvent {
    summary: string;
    description: string;
    location: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    attendees: { email: string }[];
}

// Helper to call our internal API
async function callCalendarApi(method: 'POST' | 'PUT' | 'DELETE', payload: any) {
    const response = await fetch('/api/calendar', {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error(`Calendar API ${method} Error:`, errorData);
        throw new Error(errorData.error?.message || 'Calendar API operation failed');
    }

    return await response.json();
}

/**
 * Creates a Google Calendar event via Backend API
 */
export async function createGoogleCalendarEvent(
    shoot: Partial<Shoot>,
    crew: User[],
    tokens: { accessToken: string; refreshToken?: string | null },
    labels: DepartmentLabels = getDepartmentLabels(null)
) {
    if (!shoot.startTime || !shoot.endTime) {
        throw new Error(`${labels.workSingular} must have start and end times`);
    }

    const descriptionParts = [];
    if (shoot.description) descriptionParts.push(`${shoot.description}`);

    if (shoot.pocName || shoot.pocContact) {
        descriptionParts.push(`POC: ${shoot.pocName || 'N/A'} (${shoot.pocContact || 'N/A'})`);
    }

    // App Link
    // Note: shoot.id might be undefined if we are creating a new shoot and haven't saved it to our DB yet.
    // Ideally, we save to DB first, get ID, then add to Calendar. But our current flow is flexible.
    // If ID is missing, we point to the main shoots list.
    const appUrl = shoot.id
        ? `${window.location.origin}/shoots/${shoot.id}`
        : `${window.location.origin}/shoots`;
    descriptionParts.push(`\n🔗 View ${labels.workSingular} Details:\n${appUrl}`);

    const event: CalendarEvent = {
        summary: `🎥 ${labels.workSingular.toUpperCase()}: ${shoot.title}`, // Added emoji for visibility
        description: descriptionParts.join('\n\n'),
        location: shoot.location || '',
        start: {
            dateTime: new Date(shoot.startTime).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
            dateTime: new Date(shoot.endTime).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: crew
            .filter(u => u.email) // Ensure email exists
            .map(u => ({ email: u.email! })),
    };

    return await callCalendarApi('POST', {
        event,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
    });
}

/**
 * Updates an existing Google Calendar event via Backend API
 */
export async function updateGoogleCalendarEvent(
    eventId: string,
    shoot: Partial<Shoot>,
    crew: User[],
    tokens: { accessToken: string; refreshToken?: string | null },
    labels: DepartmentLabels = getDepartmentLabels(null)
) {
    if (!shoot.startTime || !shoot.endTime) {
        throw new Error(`${labels.workSingular} must have start and end times`);
    }

    const descriptionParts = [];
    if (shoot.description) descriptionParts.push(`${shoot.description}`);

    if (shoot.pocName || shoot.pocContact) {
        descriptionParts.push(`POC: ${shoot.pocName || 'N/A'} (${shoot.pocContact || 'N/A'})`);
    }

    // App Link
    const appUrl = shoot.id
        ? `${window.location.origin}/shoots/${shoot.id}`
        : `${window.location.origin}/shoots`;
    descriptionParts.push(`\n🔗 View ${labels.workSingular} Details:\n${appUrl}`);

    const event: CalendarEvent = {
        summary: `🎥 ${labels.workSingular.toUpperCase()}: ${shoot.title}`,
        description: descriptionParts.join('\n\n'),
        location: shoot.location || '',
        start: {
            dateTime: new Date(shoot.startTime).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
            dateTime: new Date(shoot.endTime).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: crew
            .filter(u => u.email)
            .map(u => ({ email: u.email! })),
    };

    return await callCalendarApi('PUT', {
        eventId,
        event,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
    });
}

/**
 * Deletes a Google Calendar event via Backend API
 */
export async function deleteGoogleCalendarEvent(
    eventId: string,
    tokens: { accessToken: string; refreshToken?: string | null }
) {
    return await callCalendarApi('DELETE', {
        eventId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
    });
}
