import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { verifyJiraPat, JiraError } from '@/lib/jira';

export const dynamic = 'force-dynamic';

/**
 * POST /api/jira/verify-token
 * Body: { token: string }
 *
 * Verifies a Personal Access Token against Jira ServiceDesk.
 */
export async function POST(req: Request) {
    const auth = await requireUser();
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const body = await req.json().catch(() => null);
        const token = body?.token?.trim();

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        const result = await verifyJiraPat(token);
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira Verify Token API Error]:', err);
        return NextResponse.json({ error: 'Failed to verify token with Jira' }, { status: 500 });
    }
}
