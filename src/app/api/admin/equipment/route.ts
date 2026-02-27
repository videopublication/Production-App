import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Service role client - bypasses RLS for admin operations
const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase env vars');
    }
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
};

// Verify the calling user is an authenticated Admin or Super Admin
async function ensureAdmin() {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const serverClient = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            get(name: string) { return cookieStore.get(name)?.value; },
            set() {},
            remove() {},
        },
    });

    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) return null;

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
        .from('users')
        .select('role, department_id')
        .eq('id', user.id)
        .single();

    if (!profile || !['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(profile.role)) return null;

    return { userId: user.id, role: profile.role, departmentId: profile.department_id };
}

// POST /api/admin/equipment — bulk upsert equipment items
export async function POST(request: Request) {
    try {
        const caller = await ensureAdmin();
        if (!caller) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { items } = await request.json();
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'No items provided' }, { status: 400 });
        }

        // Security: for non-Super Admins, enforce that all items belong to their department
        const processedItems = items.map((item: any) => {
            if (caller.role !== 'SUPER_ADMIN' && caller.departmentId) {
                // Override department_id to always be the caller's department
                return { ...item, department_id: caller.departmentId };
            }
            return item;
        });

        const admin = getSupabaseAdmin();
        const { error } = await admin
            .from('equipment')
            .upsert(processedItems);

        if (error) {
            console.error('[API] Equipment bulk save error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, count: processedItems.length });
    } catch (err: any) {
        console.error('[API] Equipment POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
