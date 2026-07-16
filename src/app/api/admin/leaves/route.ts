import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
};

// Create admin client for admin operations (bypasses RLS)
const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!supabaseServiceKey) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY - make sure it is set in .env.local');
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

async function ensureAdmin() {
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options)
                        })
                    } catch {
                    }
                },
            },
        }
    )

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return { error: 'Unauthorized', status: 401 }
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role, department_id')
        .eq('id', user.id)
        .single();

    if (!profile || !['ADMIN', 'SUPER_ADMIN'].includes(profile.role)) {
        return { error: 'Forbidden: Admin access required', status: 403 }
    }

    return { success: true, user, profile }
}

const createAdminLeaveSchema = z.object({
    userId: z.string().uuid(),
    departmentId: z.string().uuid().nullable().optional(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    reason: z.string().min(1)
});

// Admin-recorded absence for another user. Must go through the service-role
// client because the leaves RLS insert policy only allows auth.uid() = user_id.
export async function POST(request: Request) {
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const body = await request.json();
        const result = createAdminLeaveSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { userId, departmentId, startDate, endDate, reason } = result.data;
        const supabaseAdmin = getSupabaseAdmin();

        const { error } = await supabaseAdmin.from('leaves').insert({
            user_id: userId,
            department_id: departmentId ?? null,
            start_date: startDate,
            end_date: endDate,
            reason,
            status: 'APPROVED',
            approver_id: authCheck.user!.id
        });

        if (error) throw error;

        return NextResponse.json({ message: 'Absence recorded successfully' });
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

const updateAdminLeaveSchema = z.object({
    id: z.string().uuid(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional()
});

// Admin edit of any leave (e.g. fixing a wrong date on a recorded absence).
// Service-role client bypasses the owner-only RLS update policy.
export async function PUT(request: Request) {
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const body = await request.json();
        const result = updateAdminLeaveSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { id, startDate, endDate, reason, status } = result.data;
        const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (startDate !== undefined) dbUpdates.start_date = startDate;
        if (endDate !== undefined) dbUpdates.end_date = endDate;
        if (reason !== undefined) dbUpdates.reason = reason;
        if (status !== undefined) dbUpdates.status = status;

        const supabaseAdmin = getSupabaseAdmin();
        const { error } = await supabaseAdmin.from('leaves').update(dbUpdates).eq('id', id);
        if (error) throw error;

        return NextResponse.json({ message: 'Leave updated successfully' });
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

// Admin delete of any leave (e.g. removing a wrongly-recorded absence).
// Service-role client bypasses the owner-only RLS delete policy.
export async function DELETE(request: Request) {
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Missing leave id' }, { status: 400 });
        }

        const supabaseAdmin = getSupabaseAdmin();
        const { error } = await supabaseAdmin.from('leaves').delete().eq('id', id);
        if (error) throw error;

        return NextResponse.json({ message: 'Leave deleted successfully' });
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
