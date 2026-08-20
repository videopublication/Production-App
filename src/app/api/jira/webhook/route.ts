import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normaliseIssue, jiraStatusToAppStatus } from '@/lib/jira';

export const dynamic = 'force-dynamic';

const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return null;
    return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Jira Webhook Endpoint: /api/jira/webhook
 *
 * Configured in Jira Webhooks settings (e.g. https://servicedesk.isha.in/plugins/servlet/webhooks)
 * Listens for:
 *   - jira:issue_created
 *   - jira:issue_updated
 *   - jira:issue_deleted
 *
 * Real-time automatic synchronization into Supabase `shoots` table.
 */
export async function POST(req: Request) {
    try {
        // Optional webhook secret check
        const webhookSecret = process.env.JIRA_WEBHOOK_SECRET;
        if (webhookSecret) {
            const url = new URL(req.url);
            const secretQuery = url.searchParams.get('secret');
            const authHeader = req.headers.get('x-jira-webhook-token') || req.headers.get('authorization');
            if (secretQuery !== webhookSecret && authHeader !== webhookSecret) {
                return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 401 });
            }
        }

        const body = await req.json().catch(() => null);
        if (!body || !body.issue || !body.issue.key) {
            return NextResponse.json({ error: 'Invalid Jira webhook payload' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ error: 'Database service unavailable' }, { status: 500 });
        }

        const webhookEvent = body.webhookEvent || 'jira:issue_updated';
        const issue = body.issue;
        const normalized = normaliseIssue(issue);
        const ticketKey = normalized.key;
        const targetStatus = jiraStatusToAppStatus(normalized.status);

        if (normalized.issueType && normalized.issueType !== 'Video Shoot Request') {
            console.log(`[Jira Webhook] Ignored non-shoot issue type: ${ticketKey} (Type: ${normalized.issueType})`);
            return NextResponse.json({ message: `Ignored: ${normalized.issueType} is not a shoot request`, skipped: true });
        }

        if ((normalized.title || '').toLowerCase().includes('trim backup')) {
            console.log(`[Jira Webhook] Ignored Trim Backup ticket: ${ticketKey} (${normalized.title})`);
            return NextResponse.json({ message: 'Ignored: Trim Backup ticket is not a shoot', skipped: true });
        }

        console.log(`[Jira Webhook] Event: ${webhookEvent}, Ticket: ${ticketKey}, Status: ${normalized.status} -> ${targetStatus}`);

        // Check if shoot already exists in DB
        const { data: existingShoot, error: searchErr } = await supabase
            .from('shoots')
            .select('id, shoot_number, status, title')
            .eq('jira_ticket_id', ticketKey)
            .maybeSingle();

        if (searchErr) {
            console.error('[Jira Webhook] Error finding shoot:', searchErr);
            return NextResponse.json({ error: searchErr.message }, { status: 500 });
        }

        if (webhookEvent === 'jira:issue_deleted') {
            if (existingShoot) {
                await supabase
                    .from('shoots')
                    .update({ status: 'CANCELLED' })
                    .eq('id', existingShoot.id);
                return NextResponse.json({ success: true, action: 'cancelled_deleted_ticket', key: ticketKey });
            }
            return NextResponse.json({ success: true, action: 'ignored_unlinked_deleted_ticket' });
        }

        if (existingShoot) {
            // Update existing shoot details and status
            const updatePayload: Record<string, unknown> = {
                title: normalized.title || existingShoot.title,
                description: normalized.description || '',
                status: targetStatus,
            };

            if (normalized.location) updatePayload.location = normalized.location;
            if (normalized.pocName) updatePayload.poc_name = normalized.pocName;
            if (normalized.pocContact) updatePayload.poc_contact = normalized.pocContact;
            if (normalized.startTime) updatePayload.start_time = normalized.startTime;
            if (normalized.endTime) updatePayload.end_time = normalized.endTime;

            const { error: updateErr } = await supabase
                .from('shoots')
                .update(updatePayload)
                .eq('id', existingShoot.id);

            if (updateErr) {
                console.error('[Jira Webhook] Update error:', updateErr);
                return NextResponse.json({ error: updateErr.message }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                action: 'updated',
                shootId: existingShoot.id,
                status: targetStatus,
                key: ticketKey
            });
        }

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

        // Create new shoot from Jira ticket
        const insertPayload: Record<string, unknown> = {
            title: normalized.title || `Jira Request: ${ticketKey}`,
            description: normalized.description || '',
            location: normalized.location || 'Spandha Hall / Main Studio',
            status: targetStatus,
            start_time: normalized.startTime || new Date().toISOString(),
            end_time: normalized.endTime || null,
            poc_name: normalized.pocName || normalized.reporter || 'Jira Requester',
            poc_contact: normalized.pocContact || '',
            jira_ticket_id: ticketKey,
            shoot_number: nextShootNumber,
            required_roles: [],
            department_id: '00000000-0000-0000-0000-000000000001'
        };

        const { data: createdShoot, error: insertErr } = await supabase
            .from('shoots')
            .insert(insertPayload)
            .select('id, shoot_number')
            .single();

        if (insertErr) {
            console.error('[Jira Webhook] Insert error:', insertErr);
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            action: 'created',
            shootId: createdShoot?.id,
            shootNumber: createdShoot?.shoot_number,
            status: targetStatus,
            key: ticketKey
        });

    } catch (err) {
        console.error('[Jira Webhook Exception]:', err);
        const msg = err instanceof Error ? err.message : 'Internal server error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
