/**
 * Server-only Jira client. The ONLY place in the codebase that knows the Jira
 * host, the auth scheme, or which custom fields carry shoot data.
 *
 * Never import this from a client component: it reads secrets from the server
 * environment. Browser code should call `/api/jira/...` instead, which is a
 * relative path and therefore correct in local, beta and production without any
 * per-environment URL to configure.
 *
 * `servicedesk.isha.in` is Jira Data Center / Server, verified by probe:
 *   - GET /status              → {"state":"RUNNING"}   (Server/DC only)
 *   - GET /rest/api/3/…        → 302 to login          (no v3 ⇒ not Cloud)
 *   - GET /rest/api/2/…        → 401 + Jira error JSON (v2 present, anon off)
 * Hence REST v2 and a Bearer Personal Access Token, not Cloud's email + token
 * Basic scheme. `JIRA_AUTH_MODE=basic` stays available in case that ever changes.
 */

export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

export const isValidIssueKey = (key: string) => JIRA_ISSUE_KEY.test(key);

export interface JiraConfig {
    baseUrl: string;
    authHeader: string;
}

/** Custom-field ids, configured rather than guessed. Defaults match Isha ServiceDesk. */
const customFields = () => ({
    startTime: process.env.JIRA_FIELD_START_TIME || 'customfield_63400',
    endTime: process.env.JIRA_FIELD_END_TIME || 'customfield_63401',
    location: process.env.JIRA_FIELD_LOCATION || 'customfield_63402',
    pocName: process.env.JIRA_FIELD_POC_NAME || '',
    pocContact: process.env.JIRA_FIELD_POC_CONTACT || '',
    crew: process.env.JIRA_FIELD_CREW || '',
});

/**
 * Returns null when Jira is not configured, so callers can answer 503 instead of
 * failing in a way that looks like a Jira outage. The previous implementation
 * swallowed this case and silently fell through, which is why nobody noticed the
 * direct REST path had never been wired up.
 */
export const jiraConfig = (): JiraConfig | null => {
    const baseUrl = (process.env.JIRA_BASE_URL || 'https://servicedesk.isha.in').replace(/\/+$/, '');
    const mode = (process.env.JIRA_AUTH_MODE || 'bearer').toLowerCase();

    if (mode === 'basic') {
        const email = process.env.JIRA_EMAIL;
        const token = process.env.JIRA_API_TOKEN;
        if (!email || !token) return null;
        return {
            baseUrl,
            authHeader: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
        };
    }

    // Server/DC Personal Access Token.
    const token = process.env.JIRA_TOKEN || process.env.JIRA_API_TOKEN;
    if (!token) return null;
    return { baseUrl, authHeader: `Bearer ${token}` };
};

export const isJiraConfigured = () => jiraConfig() !== null;

export class JiraError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'JiraError';
    }
}

async function jiraFetch<T>(path: string): Promise<T> {
    const config = jiraConfig();
    if (!config) throw new JiraError('Jira is not configured on this server', 503);

    const res = await fetch(`${config.baseUrl}${path}`, {
        headers: {
            Authorization: config.authHeader,
            Accept: 'application/json',
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        // Jira's own message is useful for 400s (bad JQL, unknown field) but its
        // auth failures should not leak upstream detail to the browser.
        let detail = '';
        if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
            const body = await res.text().catch(() => '');
            try {
                const parsed = JSON.parse(body);
                detail = (parsed.errorMessages?.[0] as string) || '';
            } catch {
                detail = '';
            }
        }
        const message = res.status === 404 ? 'Ticket not found in Jira'
            : res.status === 401 || res.status === 403 ? 'Jira rejected the app credentials'
                : detail || `Jira request failed (${res.status})`;
        throw new JiraError(message, res.status);
    }

    return res.json() as Promise<T>;
}

interface RawIssue {
    key: string;
    fields?: Record<string, unknown> & {
        summary?: string;
        description?: string;
        environment?: string;
        created?: string;
        updated?: string;
        duedate?: string;
        status?: { name?: string; statusCategory?: { key?: string; name?: string } };
        priority?: { name?: string };
        issuetype?: { name?: string };
        reporter?: { displayName?: string; emailAddress?: string };
        assignee?: { displayName?: string };
    };
}

export interface JiraTicket {
    key: string;
    /** Fields the shoot form pre-fills from. */
    title: string;
    description: string;
    location: string;
    eventLocation?: string;
    eventVenue?: string;
    pocName: string;
    pocContact: string;
    startTime: string;
    endTime: string;
    crewString: string;
    /** Ticket state, for showing Jira's own status inside the app. */
    status: string;
    statusCategory: string;
    priority: string;
    issueType: string;
    reporter: string;
    reporterEmail?: string;
    assignee: string;
    jiraCreatedAt: string;
    jiraUpdatedAt: string;
    language?: string;
    indoorOutdoor?: string;
    audienceSize?: string;
    liveTranslation?: string;
    requestType?: string;
}

/** Reads a configured custom field as a plain string, whatever shape Jira returns. */
const fieldText = (fields: Record<string, unknown>, id: string): string => {
    if (!id) return '';
    const value = fields[id];
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
        return value.map(v => typeof v === 'object' && v ? (v.value ?? v.name ?? v.displayName ?? '') : String(v)).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const named = obj.value ?? obj.name ?? obj.displayName;
        if (typeof named === 'string') return named;
    }
    return '';
};

export const normaliseIssue = (issue: RawIssue): JiraTicket => {
    const f = (issue.fields || {}) as Record<string, unknown>;
    const cf = customFields();

    const eventLocation = fieldText(f, 'customfield_63416') || fieldText(f, cf.location) || 'Inside Ashram';
    const eventVenue = fieldText(f, 'customfield_63402') || (typeof f.environment === 'string' ? f.environment : '') || '';
    const combinedLocation = eventLocation && eventVenue && eventLocation !== eventVenue
        ? `${eventLocation} • ${eventVenue}`
        : (eventLocation || eventVenue || '');

    const detailedDescription = fieldText(f, 'customfield_63425') || (typeof f.description === 'string' ? f.description : '') || '';
    const requestTypeObj = f['customfield_10000'] as Record<string, unknown> | undefined;
    const requestTypeName = (requestTypeObj?.requestType as Record<string, unknown> | undefined)?.name as string | undefined;

    return {
        key: issue.key,
        title: (f.summary as string) || issue.key,
        description: detailedDescription,
        location: combinedLocation,
        eventLocation,
        eventVenue,
        pocName: fieldText(f, cf.pocName) || (f.reporter as { displayName?: string } | undefined)?.displayName || '',
        pocContact: fieldText(f, cf.pocContact) || '',
        startTime: fieldText(f, cf.startTime) || '',
        endTime: fieldText(f, cf.endTime) || (f.duedate as string) || '',
        crewString: fieldText(f, cf.crew) || '',
        status: (f.status as { name?: string } | undefined)?.name || '',
        statusCategory: (f.status as { statusCategory?: { key?: string } } | undefined)?.statusCategory?.key || '',
        priority: (f.priority as { name?: string } | undefined)?.name || '',
        issueType: (f.issuetype as { name?: string } | undefined)?.name || '',
        reporter: (f.reporter as { displayName?: string } | undefined)?.displayName || '',
        reporterEmail: (f.reporter as { emailAddress?: string } | undefined)?.emailAddress || '',
        assignee: (f.assignee as { displayName?: string } | undefined)?.displayName || '',
        jiraCreatedAt: (f.created as string) || '',
        jiraUpdatedAt: (f.updated as string) || '',
        language: fieldText(f, 'customfield_12301') || fieldText(f, 'customfield_106756') || '',
        indoorOutdoor: fieldText(f, 'customfield_109508') || '',
        audienceSize: fieldText(f, 'customfield_109503') || '',
        liveTranslation: fieldText(f, 'customfield_109507') || '',
        requestType: requestTypeName || fieldText(f, 'customfield_10000') || (f.issuetype as { name?: string } | undefined)?.name || '',
    };
};

export interface JiraIssueUpdateInput {
    description?: string;
    location?: string; // Event Location dropdown ('Inside Ashram' | 'Outside Ashram - India' | 'Outside Ashram - Overseas')
    venue?: string; // Event Venue text
    startTime?: string; // ISO date string
    endTime?: string; // ISO date string
    title?: string;
}

export function formatJiraDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const pad3 = (n: number) => String(n).padStart(3, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    const millis = pad3(d.getMilliseconds());

    const tzOffset = -d.getTimezoneOffset();
    const sign = tzOffset >= 0 ? '+' : '-';
    const absOffset = Math.abs(tzOffset);
    const tzHours = pad(Math.floor(absOffset / 60));
    const tzMins = pad(absOffset % 60);
    const offsetStr = `${sign}${tzHours}${tzMins}`;

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}${offsetStr}`;
}

/**
 * Safely updates fields of a Jira ticket.
 * STRICT SAFETY GUARD: Respects JIRA_WRITE_ENABLED.
 */
export const updateJiraIssue = async (
    key: string,
    updates: JiraIssueUpdateInput
): Promise<{ success: boolean; dryRun?: boolean; message?: string }> => {
    const isWriteEnabled = process.env.JIRA_WRITE_ENABLED === 'true';

    const fields: Record<string, unknown> = {};

    if (updates.description !== undefined) {
        fields['customfield_63425'] = updates.description;
    }
    if (updates.location !== undefined) {
        fields['customfield_63416'] = { value: updates.location };
    }
    if (updates.venue !== undefined) {
        fields['customfield_63402'] = updates.venue;
    }
    if (updates.startTime !== undefined && updates.startTime) {
        fields['customfield_63400'] = formatJiraDateTime(updates.startTime);
    }
    if (updates.endTime !== undefined && updates.endTime) {
        fields['customfield_63401'] = formatJiraDateTime(updates.endTime);
    }
    if (updates.title !== undefined) {
        fields['summary'] = updates.title;
    }

    if (Object.keys(fields).length === 0) {
        return { success: true, message: 'No fields to update' };
    }

    if (!isWriteEnabled) {
        console.log(`[Jira Safety Guard] DRY RUN: Issue update for ticket ${key} was skipped because JIRA_WRITE_ENABLED is not enabled. Fields:`, fields);
        return {
            success: true,
            dryRun: true,
            message: `Dry Run: Jira ticket ${key} was NOT modified. (Enable JIRA_WRITE_ENABLED=true in production to apply).`
        };
    }

    const config = jiraConfig();
    if (!config) throw new JiraError('Jira is not configured on this server', 503);

    const res = await fetch(`${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: {
            Authorization: config.authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ fields }),
        cache: 'no-store',
    });

    if (!res.ok) {
        let detail = '';
        try {
            const errJson = await res.json();
            detail = errJson.errorMessages?.join(', ') || JSON.stringify(errJson.errors || {});
        } catch {
            detail = await res.text().catch(() => '');
        }
        throw new JiraError(`Failed to update Jira ticket ${key}: ${detail || res.statusText}`, res.status);
    }

    return { success: true, dryRun: false };
};

/** One issue by key. Callers must validate the key first. */
export const getIssue = async (key: string): Promise<JiraTicket> => {
    const raw = await jiraFetch<RawIssue>(`/rest/api/2/issue/${encodeURIComponent(key)}`);
    return normaliseIssue(raw);
};

/** Paged JQL search, used by the background sync. */
export const searchIssues = async (
    jql: string,
    options?: { startAt?: number; maxResults?: number }
): Promise<{ issues: JiraTicket[]; total: number; startAt: number }> => {
    const startAt = options?.startAt ?? 0;
    const maxResults = Math.min(options?.maxResults ?? 50, 100);
    const query = `jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`;
    const data = await jiraFetch<{ issues?: RawIssue[]; total?: number }>(`/rest/api/2/search?${query}`);
    return {
        issues: (data.issues || []).map(normaliseIssue),
        total: data.total ?? 0,
        startAt,
    };
};

/**
 * Field catalogue, so the custom-field ids above can be filled in from reality
 * instead of guessed. Admin-only; see /api/jira/fields.
 */
export const listFields = () =>
    jiraFetch<Array<{ id: string; name: string; custom: boolean }>>('/rest/api/2/field');

import { ShootStatus } from '@/types';
import { jiraStatusToAppStatus, appStatusToJiraStatus } from '@/lib/jira-utils';
export { jiraStatusToAppStatus, appStatusToJiraStatus };

/**
 * Checks available transitions for a Jira ticket.
 */
export const getIssueTransitions = async (key: string) => {
    return jiraFetch<{ transitions: Array<{ id: string; name: string; to: { id: string; name: string } }> }>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`
    );
};

/**
 * Safely transitions a Jira ticket to a new status.
 * STRICT SAFETY GUARD: If JIRA_WRITE_ENABLED !== 'true', runs in DRY RUN mode
 * and NEVER modifies Jira tickets.
 */
export const transitionJiraIssue = async (
    key: string,
    targetAppStatus: ShootStatus
): Promise<{ success: boolean; dryRun?: boolean; message?: string }> => {
    const isWriteEnabled = process.env.JIRA_WRITE_ENABLED === 'true';
    const targetStatusName = appStatusToJiraStatus(targetAppStatus);

    if (!isWriteEnabled) {
        console.log(`[Jira Safety Guard] DRY RUN: Status change for ticket ${key} -> "${targetStatusName}" (${targetAppStatus}) was prevented because JIRA_WRITE_ENABLED is not enabled.`);
        return {
            success: true,
            dryRun: true,
            message: `Dry Run: Jira ticket ${key} was NOT modified. (Enable JIRA_WRITE_ENABLED=true in production to apply).`
        };
    }

    const config = jiraConfig();
    if (!config) throw new JiraError('Jira is not configured on this server', 503);

    // 1. Fetch valid transitions for this ticket
    const { transitions } = await getIssueTransitions(key);
    const match = transitions.find(t =>
        t.name.toLowerCase().includes(targetStatusName.toLowerCase()) ||
        t.to.name.toLowerCase().includes(targetStatusName.toLowerCase())
    );

    if (!match) {
        throw new JiraError(`No valid transition to "${targetStatusName}" available for ${key}`, 400);
    }

    // 2. Perform the transition
    const res = await fetch(`${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}/transitions`, {
        method: 'POST',
        headers: {
            Authorization: config.authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ transition: { id: match.id } }),
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new JiraError(`Failed to update Jira ticket ${key} status to ${targetStatusName} (${res.status})`, res.status);
    }

    return { success: true, dryRun: false };
};

export interface JiraComment {
    id: string;
    author: {
        displayName: string;
        name?: string;
        emailAddress?: string;
        avatarUrls?: Record<string, string>;
    };
    body: string;
    created: string;
    updated?: string;
    isInternal?: boolean;
}

/**
 * Fetches comments for a specific Jira ticket.
 */
export const getIssueComments = async (key: string): Promise<JiraComment[]> => {
    const data = await jiraFetch<{ comments?: Array<any> }>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/comment?expand=properties`
    );
    return (data.comments || [])
        .map(c => {
            const internalProp = Array.isArray(c.properties)
                ? c.properties.find((p: any) => p.key === 'sd.public.comment')?.value?.internal
                : c.properties?.['sd.public.comment']?.internal;
            return {
                id: c.id,
                author: {
                    displayName: c.author?.displayName || c.author?.name || 'Jira User',
                    name: c.author?.name,
                    emailAddress: c.author?.emailAddress,
                    avatarUrls: c.author?.avatarUrls,
                },
                body: typeof c.body === 'string' ? c.body : JSON.stringify(c.body),
                created: c.created || '',
                updated: c.updated,
                isInternal: Boolean(internalProp),
            };
        })
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
};

/**
 * Posts a comment to a Jira ticket.
 */
export const addIssueComment = async (
    key: string,
    body: string,
    authorName?: string,
    isInternal?: boolean
): Promise<{ success: boolean; comment?: JiraComment; dryRun?: boolean }> => {
    const isWriteEnabled = process.env.JIRA_WRITE_ENABLED === 'true';
    const finalBody = body;

    if (!isWriteEnabled) {
        console.log(`[Jira Safety Guard] DRY RUN: Comment on ticket ${key} was skipped because JIRA_WRITE_ENABLED is not enabled.`);
        return {
            success: true,
            dryRun: true,
            comment: {
                id: `dry-run-${Date.now()}`,
                author: { displayName: authorName || 'You (Dry Run)' },
                body: finalBody,
                created: new Date().toISOString(),
                isInternal: Boolean(isInternal),
            }
        };
    }

    const config = jiraConfig();
    if (!config) throw new JiraError('Jira is not configured on this server', 503);

    const payload: Record<string, unknown> = { body: finalBody };
    if (isInternal) {
        payload.properties = [{ key: 'sd.public.comment', value: { internal: true } }];
    }

    const res = await fetch(`${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}/comment`, {
        method: 'POST',
        headers: {
            Authorization: config.authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new JiraError(`Failed to post comment to Jira ticket ${key} (${res.status})`, res.status);
    }

    const created = await res.json();
    return {
        success: true,
        dryRun: false,
        comment: {
            id: created.id,
            author: {
                displayName: created.author?.displayName || authorName || 'Jira User',
                name: created.author?.name,
                emailAddress: created.author?.emailAddress,
                avatarUrls: created.author?.avatarUrls,
            },
            body: created.body,
            created: created.created,
            isInternal: Boolean(isInternal),
        }
    };
};

/**
 * Updates an existing comment on a Jira ticket.
 */
export const updateIssueComment = async (
    key: string,
    commentId: string,
    body: string,
    authorName?: string
): Promise<{ success: boolean; comment?: JiraComment; dryRun?: boolean }> => {
    const isWriteEnabled = process.env.JIRA_WRITE_ENABLED === 'true';
    const finalBody = body;

    if (!isWriteEnabled) {
        console.log(`[Jira Safety Guard] DRY RUN: Update comment ${commentId} on ticket ${key} was skipped.`);
        return { success: true, dryRun: true };
    }

    const config = jiraConfig();
    if (!config) throw new JiraError('Jira is not configured on this server', 503);

    const res = await fetch(`${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}/comment/${encodeURIComponent(commentId)}`, {
        method: 'PUT',
        headers: {
            Authorization: config.authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ body: finalBody }),
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new JiraError(`Failed to update comment ${commentId} (${res.status})`, res.status);
    }

    const updated = await res.json();
    return {
        success: true,
        dryRun: false,
        comment: {
            id: updated.id,
            author: {
                displayName: updated.author?.displayName || authorName || 'Jira User',
                name: updated.author?.name,
                emailAddress: updated.author?.emailAddress,
                avatarUrls: updated.author?.avatarUrls,
            },
            body: updated.body,
            created: updated.created,
            updated: updated.updated,
        }
    };
};

/**
 * Deletes a comment from a Jira ticket.
 */
export const deleteIssueComment = async (
    key: string,
    commentId: string
): Promise<{ success: boolean; dryRun?: boolean }> => {
    const isWriteEnabled = process.env.JIRA_WRITE_ENABLED === 'true';

    if (!isWriteEnabled) {
        console.log(`[Jira Safety Guard] DRY RUN: Delete comment ${commentId} on ticket ${key} was skipped.`);
        return { success: true, dryRun: true };
    }

    const config = jiraConfig();
    if (!config) throw new JiraError('Jira is not configured on this server', 503);

    const res = await fetch(`${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}/comment/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers: {
            Authorization: config.authHeader,
            Accept: 'application/json',
        },
        cache: 'no-store',
    });

    if (!res.ok && res.status !== 204) {
        throw new JiraError(`Failed to delete comment ${commentId} (${res.status})`, res.status);
    }

    return { success: true, dryRun: false };
};

export interface JiraHistoryItem {
    id: string;
    author: {
        displayName: string;
        name?: string;
        avatarUrls?: Record<string, string>;
    };
    created: string;
    items: Array<{
        field: string;
        fieldtype?: string;
        from?: string;
        fromString?: string;
        to?: string;
        toString?: string;
    }>;
}

/**
 * Fetches the changelog / activity history of a Jira ticket.
 */
export const getIssueChangelog = async (key: string): Promise<JiraHistoryItem[]> => {
    const data = await jiraFetch<{ changelog?: { histories?: Array<any> } }>(
        `/rest/api/2/issue/${encodeURIComponent(key)}?expand=changelog&fields=summary,status`
    );
    const histories = data.changelog?.histories || [];
    return histories
        .map(h => ({
            id: h.id,
            author: {
                displayName: h.author?.displayName || h.author?.name || 'Jira User',
                name: h.author?.name,
                avatarUrls: h.author?.avatarUrls,
            },
            created: h.created || '',
            items: (h.items || []).map((item: any) => ({
                field: item.field,
                fieldtype: item.fieldtype,
                from: item.from,
                fromString: item.fromString,
                to: item.to,
                toString: item.toString,
            })),
        }))
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
};


