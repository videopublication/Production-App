import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

const tokenSchema = z.object({
    token: z.string().min(1),
});

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase service role environment variables');
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const result = tokenSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const { error: clearDuplicateError } = await admin
            .from('users')
            .update({ fcm_token: null })
            .eq('fcm_token', result.data.token)
            .neq('id', user.id);

        if (clearDuplicateError) {
            console.error('[register-token] Failed to clear duplicate token owners:', clearDuplicateError);
            return NextResponse.json({ error: clearDuplicateError.message }, { status: 500 });
        }

        const { error } = await admin
            .from('users')
            .update({ fcm_token: result.data.token })
            .eq('id', user.id);

        if (error) {
            console.error('[register-token] Failed to update token:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('[register-token] Error:', err);
        return NextResponse.json({ error: err.message || 'Failed to register token' }, { status: 500 });
    }
}
