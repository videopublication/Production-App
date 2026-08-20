import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { updateIssueComment, deleteIssueComment, isJiraConfigured, isValidIssueKey, JiraError } from '@/lib/jira';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/jira/ticket/<KEY>/comments/<COMMENT_ID>
 * Updates a comment on a Jira ticket.
 */
export async function PUT(
    request: Request,
    props: { params: Promise<{ key: string; commentId: string }> }
) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { key: rawKey, commentId } = await props.params;
    const key = decodeURIComponent(rawKey || '').trim().toUpperCase();

    if (!isValidIssueKey(key)) {
        return NextResponse.json({ error: 'Invalid Jira ticket key' }, { status: 400 });
    }

    if (!commentId) {
        return NextResponse.json({ error: 'Invalid comment ID' }, { status: 400 });
    }

    if (!isJiraConfigured(auth.actor.jiraToken)) {
        return NextResponse.json({ error: 'Jira is not configured' }, { status: 503 });
    }

    try {
        const body = await request.json();
        const commentText = (body?.comment || body?.body || '').trim();

        if (!commentText) {
            return NextResponse.json({ error: 'Comment body cannot be empty' }, { status: 400 });
        }

        const authorName = auth.actor?.email ? auth.actor.email.split('@')[0] : 'Production App User';
        const result = await updateIssueComment(key, commentId, commentText, authorName, auth.actor.jiraToken);

        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira comment PUT] failed:', err);
        return NextResponse.json({ error: 'Failed to update comment' }, { status: 502 });
    }
}

/**
 * DELETE /api/jira/ticket/<KEY>/comments/<COMMENT_ID>
 * Deletes a comment from a Jira ticket.
 */
export async function DELETE(
    request: Request,
    props: { params: Promise<{ key: string; commentId: string }> }
) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { key: rawKey, commentId } = await props.params;
    const key = decodeURIComponent(rawKey || '').trim().toUpperCase();

    if (!isValidIssueKey(key)) {
        return NextResponse.json({ error: 'Invalid Jira ticket key' }, { status: 400 });
    }

    if (!commentId) {
        return NextResponse.json({ error: 'Invalid comment ID' }, { status: 400 });
    }

    if (!isJiraConfigured(auth.actor.jiraToken)) {
        return NextResponse.json({ error: 'Jira is not configured' }, { status: 503 });
    }

    try {
        const result = await deleteIssueComment(key, commentId, auth.actor.jiraToken);
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira comment DELETE] failed:', err);
        return NextResponse.json({ error: 'Failed to delete comment' }, { status: 502 });
    }
}
