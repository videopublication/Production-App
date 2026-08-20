import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { getIssueChangelog, isJiraConfigured, isValidIssueKey, JiraError } from '@/lib/jira';

export const dynamic = 'force-dynamic';

/**
 * GET /api/jira/ticket/<KEY>/changelog
 * Fetches the changelog / activity history of a Jira ticket.
 */
export async function GET(
    request: Request,
    props: { params: Promise<{ key: string }> }
) {
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
        const histories = await getIssueChangelog(key);
        return NextResponse.json(
            { key, histories },
            {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                },
            }
        );
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira changelog GET] failed:', err);
        return NextResponse.json({ error: 'Failed to fetch Jira changelog' }, { status: 502 });
    }
}
