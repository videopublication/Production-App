import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { getIssue, isJiraConfigured, isValidIssueKey, JiraError, updateJiraIssue, JiraIssueUpdateInput } from '@/lib/jira';

export const dynamic = 'force-dynamic';

/**
 * Ticket lookup for the shoot form.
 *
 * Replaces the browser's direct call to a Supabase Edge Function on a hardcoded
 * project. Being a route in this app, the client fetches the relative path
 * `/api/jira/ticket/<KEY>` — nothing to configure per environment, and the Jira
 * credentials stay on the server behind this session check.
 */
export async function GET(request: Request, props: { params: Promise<{ key: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { key: rawKey } = await props.params;
    const key = decodeURIComponent(rawKey || '').trim().toUpperCase();

    // Validate before building the upstream URL: the key becomes part of a path
    // on an internal host, so it never goes through unchecked.
    if (!isValidIssueKey(key)) {
        return NextResponse.json({ error: 'That does not look like a Jira ticket ID (e.g. VP-54984)' }, { status: 400 });
    }

    if (isJiraConfigured(auth.actor.jiraToken)) {
        try {
            const ticket = await getIssue(key, auth.actor.jiraToken);
            return NextResponse.json(ticket, {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                },
            });
        } catch (err) {
            if (err instanceof JiraError) {
                return NextResponse.json({ error: err.message }, { status: err.status });
            }
            console.error('[Jira ticket] lookup failed:', err);
            return NextResponse.json({ error: 'Could not reach Jira' }, { status: 502 });
        }
    }

    // ── TEMPORARY ────────────────────────────────────────────────────────────
    // Until JIRA_TOKEN is set, fall through to the legacy Supabase Edge Function
    // so ticket import keeps working. This call now happens server-side behind
    // the session check above, instead of from the browser.
    //
    // DELETE THIS BLOCK once the Personal Access Token is in place, and lock the
    // edge function down (it is currently deployed --no-verify-jwt, i.e. callable
    // by anyone on the internet with our Jira credentials behind it).
    const legacyBase = process.env.JIRA_LEGACY_FUNCTIONS_URL
        || process.env.NEXT_PUBLIC_JIRA_FUNCTIONS_URL;
    if (!legacyBase) {
        return NextResponse.json(
            { error: 'Jira is not configured on this server' },
            { status: 503 }
        );
    }

    try {
        const res = await fetch(`${legacyBase}/functions/v1/fetch-ticket-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: key }),
            cache: 'no-store',
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            let message = `Jira lookup failed (${res.status})`;
            try {
                const parsed = JSON.parse(body);
                if (parsed.error) message = parsed.error;
            } catch {
                // keep the generic message
            }
            return NextResponse.json({ error: message }, { status: res.status });
        }

        return NextResponse.json(await res.json());
    } catch (err) {
        console.error('[Jira ticket] legacy lookup failed:', err);
        return NextResponse.json({ error: 'Could not reach Jira' }, { status: 502 });
    }
}

/**
 * Update Jira ticket fields (Requester Notes/Description, Event Location, Event Venue, Schedule, Title).
 */
export async function PATCH(request: Request, props: { params: Promise<{ key: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { key: rawKey } = await props.params;
    const key = decodeURIComponent(rawKey || '').trim().toUpperCase();

    if (!isValidIssueKey(key)) {
        return NextResponse.json({ error: 'Invalid Jira ticket ID' }, { status: 400 });
    }

    try {
        const body = (await request.json()) as JiraIssueUpdateInput;
        const result = await updateJiraIssue(key, body, auth.actor.jiraToken);
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira ticket update] failed:', err);
        return NextResponse.json({ error: 'Failed to update Jira ticket' }, { status: 500 });
    }
}
