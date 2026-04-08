import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const { id } = params;
        const { expenses } = await request.json();

        // 1. Verify authenticated user
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) => {
                                cookieStore.set(name, value, options)
                            })
                        } catch {}
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Fetch the user's profile to check permissions bypassing RLS
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('role, can_manage_expenses')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        const canManageExpenses = profile.can_manage_expenses === true || ['FINANCE_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(profile.role);

        if (!canManageExpenses) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 3. Update the shoot expenses using service role to bypass restrictive RLS
        const { error: updateError } = await supabaseAdmin
            .from('shoots')
            .update({ expenses: expenses })
            .eq('id', id);

        if (updateError) {
            console.error('Error updating shoot expenses:', updateError);
            return NextResponse.json({ error: 'Failed to update expenses' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in PUT /api/shoots/[id]/expenses:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
