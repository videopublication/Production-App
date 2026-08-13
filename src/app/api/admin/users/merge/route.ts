import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
    try {
        const { duplicateEmail, primaryEmail } = await request.json();

        if (!duplicateEmail || !primaryEmail) {
            return NextResponse.json(
                { error: 'Both duplicateEmail and primaryEmail are required' },
                { status: 400 }
            );
        }

        const dupEmail = duplicateEmail.trim().toLowerCase();
        const primEmail = primaryEmail.trim().toLowerCase();

        if (dupEmail === primEmail) {
            return NextResponse.json(
                { error: 'Cannot merge an email into itself' },
                { status: 400 }
            );
        }

        // 1. Fetch both users by email
        const { data: dupUser, error: dupErr } = await supabaseAdmin
            .from('users')
            .select('id, name, email')
            .ilike('email', dupEmail)
            .maybeSingle();

        if (dupErr || !dupUser) {
            return NextResponse.json(
                { error: `Duplicate user with email "${duplicateEmail}" not found.` },
                { status: 404 }
            );
        }

        const { data: primUser, error: primErr } = await supabaseAdmin
            .from('users')
            .select('id, name, email')
            .ilike('email', primEmail)
            .maybeSingle();

        if (primErr || !primUser) {
            return NextResponse.json(
                { error: `Primary user with email "${primaryEmail}" not found.` },
                { status: 404 }
            );
        }

        const dupId = dupUser.id;
        const primId = primUser.id;

        // 2. Re-assign all related records from duplicate ID to primary ID
        // Assignments
        await supabaseAdmin
            .from('assignments')
            .update({ user_id: primId })
            .eq('user_id', dupId);

        // Transactions
        await supabaseAdmin
            .from('transactions')
            .update({ user_id: primId })
            .eq('user_id', dupId);

        // Leaves
        await supabaseAdmin
            .from('leaves')
            .update({ user_id: primId })
            .eq('user_id', dupId);

        // Leaves (Primary Approver)
        await supabaseAdmin
            .from('leaves')
            .update({ primary_approver_id: primId })
            .eq('primary_approver_id', dupId);

        // Activity Logs
        await supabaseAdmin
            .from('activity_logs')
            .update({ user_id: primId })
            .eq('user_id', dupId);

        // Shoots (Created By)
        await supabaseAdmin
            .from('shoots')
            .update({ created_by: primId })
            .eq('created_by', dupId);

        // 3. Delete duplicate user record from public.users table
        const { error: deleteErr } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', dupId);

        if (deleteErr) {
            console.error('Error deleting duplicate user record:', deleteErr);
            return NextResponse.json({ error: deleteErr.message }, { status: 500 });
        }

        // 4. Optionally delete duplicate user from Supabase Auth
        try {
            await supabaseAdmin.auth.admin.deleteUser(dupId);
        } catch (authErr) {
            console.warn('Could not delete duplicate user from Auth (may not exist in Auth):', authErr);
        }

        return NextResponse.json({
            success: true,
            message: `Successfully merged "${dupUser.name}" (${dupEmail}) into "${primUser.name}" (${primEmail}). All associated records have been transferred.`
        });
    } catch (error: any) {
        console.error('Error in user merge API:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
