import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { getIssueComments, addIssueComment, isJiraConfigured, isValidIssueKey, JiraError } from '@/lib/jira';

export const dynamic = 'force-dynamic';

/**
 * GET /api/jira/ticket/<KEY>/comments
 * Fetches all comments on a Jira ticket.
 */
export async function GET(request: Request, props: { params: Promise<{ key: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { key: rawKey } = await props.params;
    const key = decodeURIComponent(rawKey || '').trim().toUpperCase();

    if (!isValidIssueKey(key)) {
        return NextResponse.json({ error: 'Invalid Jira ticket key' }, { status: 400 });
    }

    if (!isJiraConfigured()) {
        return NextResponse.json({ error: 'Jira is not configured' }, { status: 503 });
    }

    try {
        const comments = await getIssueComments(key);
        return NextResponse.json({ comments });
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira comments GET] failed:', err);
        return NextResponse.json({ error: 'Failed to fetch Jira comments' }, { status: 502 });
    }
}

/**
 * POST /api/jira/ticket/<KEY>/comments
 * Posts a new comment to a Jira ticket.
 */
export async function POST(request: Request, props: { params: Promise<{ key: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { key: rawKey } = await props.params;
    const key = decodeURIComponent(rawKey || '').trim().toUpperCase();

    if (!isValidIssueKey(key)) {
        return NextResponse.json({ error: 'Invalid Jira ticket key' }, { status: 400 });
    }

    if (!isJiraConfigured()) {
        return NextResponse.json({ error: 'Jira is not configured' }, { status: 503 });
    }

    try {
        const body = await request.json();
        const commentText = (body?.comment || body?.body || '').trim();
        const isInternal = Boolean(body?.isInternal);

        if (!commentText) {
            return NextResponse.json({ error: 'Comment body cannot be empty' }, { status: 400 });
        }

        const authorName = auth.actor?.email ? auth.actor.email.split('@')[0] : 'Production App User';
        const result = await addIssueComment(key, commentText, authorName, isInternal);

        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira comments POST] failed:', err);
        return NextResponse.json({ error: 'Failed to post comment to Jira' }, { status: 502 });
    }
}
