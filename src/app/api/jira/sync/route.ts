import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hasCronSecret, requireRole } from '@/lib/api-auth';
import { isJiraConfigured, jiraConfig, jiraStatusToAppStatus } from '@/lib/jira';

export const dynamic = 'force-dynamic';

interface SyncTicket {
    ticketId?: string;
    key?: string;
    title?: string;
    description?: string;
    statusName?: string;
    location?: string;
    reporter?: string;
    startTime?: string;
    endTime?: string;
}

interface RawSearchIssue {
    key: string;
    fields?: {
        summary?: string;
        description?: string;
        environment?: string;
        status?: { name?: string };
        reporter?: { displayName?: string };
        [key: string]: unknown;
    };
}

interface ExistingShoot {
    id: string;
    jira_ticket_id: string | null;
    status: string;
}

const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return null;
    return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Creates and updates shoots from Jira, so it is POST-only and gated. It was
 * previously reachable by anyone, on GET as well as POST, while holding the
 * service-role key — meaning an anonymous request could insert shoots, and a
 * browser prefetch could trigger a sync.
 */
export async function POST(req: Request) {
    if (!hasCronSecret(req)) {
        const auth = await requireRole(['ADMIN', 'SUPER_ADMIN']);
        if ('error' in auth) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
    }
    return handleJiraSync();
}

async function handleJiraSync() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ error: 'Database service unavailable' }, { status: 500 });
        }

        const edgeFunctionUrl = process.env.NEXT_PUBLIC_JIRA_FUNCTIONS_URL || '';

        let remoteTickets: SyncTicket[] = [];

        // 1. Attempt fetching from Supabase Edge Function if configured
        if (edgeFunctionUrl) {
            try {
                const res = await fetch(`${edgeFunctionUrl}/functions/v1/sync-jira-tickets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store'
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.tickets && Array.isArray(data.tickets)) {
                        remoteTickets = data.tickets;
                    }
                }
            } catch (edgeErr) {
                console.warn('[Jira Sync] Edge function sync skipped:', edgeErr);
            }
        }

        // 2. Direct Jira REST API fallback search
        if (remoteTickets.length === 0 && isJiraConfigured()) {
            try {
                const config = jiraConfig();
                const defaultJql = process.env.JIRA_SYNC_JQL || 'project = "VP" AND issuetype = "Video Shoot Request" order by created DESC';
                const jql = encodeURIComponent(defaultJql);
                const jiraUrl = `${config!.baseUrl}/rest/api/2/search?jql=${jql}&maxResults=100`;

                const jiraRes = await fetch(jiraUrl, {
                    headers: {
                        'Authorization': config!.authHeader,
                        'Accept': 'application/json'
                    },
                    cache: 'no-store'
                });

                if (jiraRes.ok) {
                    const data = await jiraRes.json();
                    if (data.issues && Array.isArray(data.issues)) {
                        remoteTickets = data.issues
                            .filter((issue: RawSearchIssue) => {
                                const title = (issue.fields?.summary || issue.key || '').toLowerCase();
                                return !title.includes('trim backup');
                            })
                            .map((issue: RawSearchIssue) => {
                            const f = (issue.fields || {}) as Record<string, any>;
                            const locObj = f.customfield_63416;
                            const eventLocation = typeof locObj === 'object' && locObj?.value ? locObj.value : (typeof locObj === 'string' ? locObj : '');
                            const eventVenue = f.customfield_63402 || f.environment || '';
                            const combinedLoc = eventLocation && eventVenue && eventLocation !== eventVenue
                                ? `${eventLocation} • ${eventVenue}`
                                : (eventLocation || eventVenue || 'Spandha Hall / Main Studio');

                            const rawDesc = f.customfield_63425 || f.description || '';
                            const descStr = typeof rawDesc === 'string' ? rawDesc : (typeof rawDesc === 'object' && rawDesc?.value ? rawDesc.value : '');

                            return {
                                ticketId: issue.key,
                                title: f.summary || issue.key,
                                description: descStr || '',
                                statusName: f.status?.name || 'Open',
                                location: combinedLoc,
                                reporter: f.reporter?.displayName || 'Customer',
                                startTime: f.customfield_63400 || f.created || new Date().toISOString(),
                                endTime: f.customfield_63401 || null,
                            };
                        });
                    }
                }
            } catch (directErr) {
                console.warn('[Jira Sync] Direct Jira API search skipped:', directErr);
            }
        }

        // 3. Fetch existing shoots with jira_ticket_id
        const { data: existingShoots, error: fetchErr } = await supabase
            .from('shoots')
            .select('id, jira_ticket_id, status, start_time, end_time, location');

        if (fetchErr) {
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        const existingJiraMap = new Map<string, ExistingShoot>();
        (existingShoots || []).forEach(s => {
            if (s.jira_ticket_id) {
                existingJiraMap.set(s.jira_ticket_id, s);
            }
        });

        let newShootsCount = 0;
        let updatedCount = 0;

        for (const ticket of remoteTickets) {
            const ticketKey = ticket.ticketId || ticket.key;
            if (!ticketKey) continue;

            const targetStatus = jiraStatusToAppStatus(ticket.statusName);

            const existing = existingJiraMap.get(ticketKey);
            if (existing) {
                // Update status and timing if changed
                const updateData: Record<string, unknown> = {
                    status: targetStatus,
                };
                if (ticket.startTime) updateData.start_time = ticket.startTime;
                if (ticket.endTime !== undefined) updateData.end_time = ticket.endTime;
                if (ticket.location) updateData.location = ticket.location;

                await supabase
                    .from('shoots')
                    .update(updateData)
                    .eq('id', existing.id);
                updatedCount++;
            } else {
                // Get next sequential shoot_number
                let nextShootNumber = 1;
                const { data: maxShoot } = await supabase
                    .from('shoots')
                    .select('shoot_number')
                    .not('shoot_number', 'is', null)
                    .order('shoot_number', { ascending: false })
                    .limit(1);

                if (maxShoot && maxShoot.length > 0 && maxShoot[0]?.shoot_number) {
                    nextShootNumber = maxShoot[0].shoot_number + 1;
                }

                // Auto-create new shoot from Jira ticket
                const { error: insertErr } = await supabase
                    .from('shoots')
                    .insert({
                        title: ticket.title || `Jira Request: ${ticketKey}`,
                        description: ticket.description || `Customer Jira Ticket ${ticketKey}`,
                        location: ticket.location || 'Spandha Hall / Main Studio',
                        status: targetStatus,
                        start_time: ticket.startTime || new Date().toISOString(),
                        end_time: ticket.endTime || null,
                        jira_ticket_id: ticketKey,
                        shoot_number: nextShootNumber,
                        poc_name: ticket.reporter || 'Jira Customer',
                        department_id: '00000000-0000-0000-0000-000000000001'
                    });

                if (!insertErr) {
                    newShootsCount++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            syncedCount: remoteTickets.length,
            newShootsCount,
            updatedCount,
            message: remoteTickets.length > 0 
                ? `Synced ${remoteTickets.length} Jira tickets (${newShootsCount} new created, ${updatedCount} status updated).`
                : 'Jira sync verified. System ready for incoming requests.'
        });
    } catch (err) {
        console.error('[Jira Sync API Error]:', err);
        const message = err instanceof Error ? err.message : 'Internal Jira Sync Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
