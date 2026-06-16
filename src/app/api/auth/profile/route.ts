import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Fetches user profile bypassing RLS — only returns data for the currently authenticated user
export async function GET(request: Request) {
    try {
        // 1. Verify the requesting user is authenticated
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

        // 2. Only allow fetching own profile (security: userId param must match auth user)
        const { searchParams } = new URL(request.url);
        const requestedUserId = searchParams.get('userId');

        if (requestedUserId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 3. Fetch profile using service role (bypasses RLS)
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
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // 4. Transform snake_case to camelCase for frontend
        const result = {
            ...profile,
            avatarUrl: profile.avatar_url,
            departmentId: profile.department_id,
            canManageExpenses: profile.can_manage_expenses,
            isPrimaryLeaveApprover: profile.is_primary_leave_approver,
            canBeAssignedToShoots: profile.can_be_assigned_to_shoots
        };

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in /api/auth/profile:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
