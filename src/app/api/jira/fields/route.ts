import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { isJiraConfigured, JiraError, listFields } from '@/lib/jira';

export const dynamic = 'force-dynamic';

/**
 * Lists Jira's field catalogue so the JIRA_FIELD_* ids can be filled in from
 * reality. The old sync guessed `customfield_10015` for location, which is why
 * imported locations came back wrong.
 *
 * Admin-only: field names describe the internal Jira configuration.
 */
export async function GET() {
    const auth = await requireRole(['ADMIN', 'SUPER_ADMIN']);
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!isJiraConfigured()) {
        return NextResponse.json({ error: 'Jira is not configured on this server' }, { status: 503 });
    }

    try {
        const fields = await listFields();
        // Custom fields first — those are the ones we need ids for.
        const custom = fields.filter(f => f.custom).map(f => ({ id: f.id, name: f.name }));
        const system = fields.filter(f => !f.custom).map(f => ({ id: f.id, name: f.name }));
        return NextResponse.json({ custom, system });
    } catch (err) {
        if (err instanceof JiraError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('[Jira fields] failed:', err);
        return NextResponse.json({ error: 'Could not reach Jira' }, { status: 502 });
    }
}
