import { supabase } from '@/lib/supabase';
import { Shoot, User } from '@/types';

export const GOOGLE_CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.events';

/**
 * Checks if the current session has the required Google Calendar provider token.
 */
export async function getGoogleProviderToken(): Promise<string | null> {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session || !session.provider_token) {
        return null;
    }

    // Note: Supabase stores the provider token in the session.
    // However, we can't easily check scopes here without making a call.
    // We assume if they linked via our linkGoogleCalendar flow, they have it.
    return session.provider_token;
}

interface CalendarEvent {
    summary: string;
    description: string;
    location: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    attendees: { email: string }[];
}

/**
 * Creates a Google Calendar event using the current user's provider token.
 * Returns the created event data or throws an error.
 */
export async function createGoogleCalendarEvent(
    shoot: Partial<Shoot>,
    crew: User[],
    token: string
) {
    if (!shoot.startTime || !shoot.endTime) {
        throw new Error('Shoot must have start and end times');
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
        ? `${window.location.origin}/admin/shoots/${shoot.id}`
        : `${window.location.origin}/admin/shoots`;
    descriptionParts.push(`\n🔗 View Shoot Details:\n${appUrl}`);

    const event: CalendarEvent = {
        summary: `🎥 SHOOT: ${shoot.title}`, // Added emoji for visibility
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

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Google Calendar API Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to create Google Calendar event');
    }

    return await response.json();
}

/**
 * Updates an existing Google Calendar event.
 */
export async function updateGoogleCalendarEvent(
    eventId: string,
    shoot: Partial<Shoot>,
    crew: User[],
    token: string
) {
    if (!shoot.startTime || !shoot.endTime) {
        throw new Error('Shoot must have start and end times');
    }

    const descriptionParts = [];
    if (shoot.description) descriptionParts.push(`${shoot.description}`);

    if (shoot.pocName || shoot.pocContact) {
        descriptionParts.push(`POC: ${shoot.pocName || 'N/A'} (${shoot.pocContact || 'N/A'})`);
    }

    // App Link
    const appUrl = shoot.id
        ? `${window.location.origin}/admin/shoots/${shoot.id}`
        : `${window.location.origin}/admin/shoots`;
    descriptionParts.push(`\n🔗 View Shoot Details:\n${appUrl}`);

    const event: CalendarEvent = {
        summary: `🎥 SHOOT: ${shoot.title}`,
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

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
        method: 'PUT', // PUT updates the entire resource
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
    });

    if (!response.ok) {
        // If 410 (Gone) or 404 (Not Found), we usually assume it's lost and maybe return null or throw specific error
        if (response.status === 410 || response.status === 404) {
            throw new Error('Event not found in calendar');
        }

        const errorData = await response.json();
        console.error('Google Calendar Update Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to update Google Calendar event');
    }

    return await response.json();
}

/**
 * Deletes a Google Calendar event.
 */
export async function deleteGoogleCalendarEvent(eventId: string, token: string) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        // 410 Gone means it's already deleted, which is fine
        if (response.status === 410) return;

        const errorData = await response.json().catch(() => ({}));
        console.error('Google Calendar Delete Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to delete event');
    }
}
