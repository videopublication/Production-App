import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { transitionJiraIssue, isValidIssueKey, JiraError } from '@/lib/jira';
import { ShootStatus } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/jira/status
 * Body: { ticketKey: string, status: ShootStatus }
 *
 * Transitions a Jira ticket's workflow status.
 * STRICT SAFETY GUARD: If JIRA_WRITE_ENABLED is not 'true', it runs in DRY RUN mode
 * and returns success without touching Jira.
 */
export async function POST(req: Request) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const body = await req.json().catch(() => null);
        if (!body || !body.ticketKey || !body.status) {
            return NextResponse.json({ error: 'Missing ticketKey or status' }, { status: 400 });
        }

        const ticketKey = String(body.ticketKey).trim().toUpperCase();
        if (!isValidIssueKey(ticketKey)) {
            return NextResponse.json({ error: 'Invalid Jira ticket key' }, { status: 400 });
        }

        const result = await transitionJiraIssue(ticketKey, body.status as ShootStatus);
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira Status API Error]:', err);
        return NextResponse.json({ error: 'Failed to update Jira ticket status' }, { status: 500 });
    }
}
