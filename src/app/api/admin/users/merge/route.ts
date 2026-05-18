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

        if (duplicateEmail === primaryEmail) {
            return NextResponse.json(
                { error: 'Cannot merge an email into itself' },
                { status: 400 }
            );
        }

        // Call the database function
        const { error } = await supabaseAdmin.rpc('merge_users', {
            duplicate_email: duplicateEmail,
            primary_email: primaryEmail
        });

        if (error) {
            console.error('RPC merge_users error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in user merge API:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
