import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatWhatsAppMessage } from '@/lib/whatsapp';
import { sendWhatsAppGroupMessage } from '@/lib/whatsapp-service';
import { getDepartmentLabels } from '@/lib/department-labels';
import { Assignment, Shoot, User } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    // 1. Verify Authorization Token if CRON_SECRET is set
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const authHeader = req.headers.get('authorization');
        const url = new URL(req.url);
        const querySecret = url.searchParams.get('secret');

        const isValidHeader = authHeader === `Bearer ${cronSecret}`;
        const isValidQuery = querySecret === cronSecret;

        if (!isValidHeader && !isValidQuery) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        // 2. Compute date range for tomorrow
        const now = new Date();
        const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
        const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);

        // 3. Query shoots scheduled for tomorrow that are not cancelled
        const { data: rawShoots, error: shootsErr } = await supabaseAdmin
            .from('shoots')
            .select('*')
            .gte('start_time', tomorrowStart.toISOString())
            .lte('start_time', tomorrowEnd.toISOString())
            .neq('status', 'CANCELLED');

        if (shootsErr) {
            console.error('[Shoot Reminder Cron] Error querying shoots:', shootsErr);
            return NextResponse.json({ error: 'Failed to query shoots' }, { status: 500 });
        }

        if (!rawShoots || rawShoots.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No shoots scheduled for tomorrow.',
                count: 0,
            });
        }

        // 4. Fetch assignments & users to format crew details
        const shootIds = rawShoots.map(s => s.id);
        const [assignmentsRes, usersRes] = await Promise.all([
            supabaseAdmin.from('assignments').select('*').in('shoot_id', shootIds),
            supabaseAdmin.from('users').select('*'),
        ]);

        const rawAssignments = assignmentsRes.data || [];
        const rawUsers = usersRes.data || [];

        const users: User[] = rawUsers.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            departmentId: u.department_id,
        }));

        let dispatchedCount = 0;

        // 5. Format and dispatch reminder for each shoot
        for (const s of rawShoots) {
            const shoot: Shoot = {
                id: s.id,
                title: s.title,
                description: s.description,
                location: s.location,
                status: s.status,
                startTime: s.start_time,
                endTime: s.end_time,
                pocName: s.poc_name,
                pocContact: s.poc_contact,
                shootNumber: s.shoot_number,
                jiraTicketId: s.jira_ticket_id,
                departmentId: s.department_id,
                requiredRoles: s.required_roles || [],
                createdBy: s.created_by || 'system',
            };

            const shootAssignments: Assignment[] = rawAssignments
                .filter((a: any) => a.shoot_id === s.id)
                .map((a: any) => ({
                    id: a.id,
                    shootId: a.shoot_id,
                    userId: a.user_id,
                    role: a.role,
                    status: a.status || 'ACCEPTED',
                }));

            const labels = getDepartmentLabels(s.department_id ? ({ id: s.department_id } as any) : null);
            const formattedBrief = formatWhatsAppMessage(shoot, shootAssignments, users, labels);

            const fullReminderMessage = `⏰ *SHOOT REMINDER (TOMORROW)* ⏰\n\n${formattedBrief}`;

            const sent = await sendWhatsAppGroupMessage(fullReminderMessage);
            if (sent) dispatchedCount++;
        }

        return NextResponse.json({
            success: true,
            message: `Dispatched reminders for ${dispatchedCount} shoot(s).`,
            totalShootsFound: rawShoots.length,
            dispatchedCount,
        });
    } catch (err: any) {
        console.error('[Shoot Reminder Cron] Unexpected error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
