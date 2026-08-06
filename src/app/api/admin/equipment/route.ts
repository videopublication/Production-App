import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type EquipmentPayload = Record<string, unknown> & {
    department_id?: string | null;
};

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

// Verify the calling user can manage equipment inventory
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

    if (!profile || !['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DATA_MANAGER'].includes(profile.role)) return null;

    return { userId: user.id, role: profile.role, departmentId: profile.department_id };
}

// POST /api/admin/equipment — bulk upsert equipment items
export async function POST(request: Request) {
    try {
        const caller = await ensureAdmin();
        if (!caller) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { items } = await request.json() as { items?: unknown };
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'No items provided' }, { status: 400 });
        }

        if (!items.every((item): item is EquipmentPayload => typeof item === 'object' && item !== null && !Array.isArray(item))) {
            return NextResponse.json({ error: 'Invalid equipment payload' }, { status: 400 });
        }

        if (caller.role !== 'SUPER_ADMIN' && !caller.departmentId) {
            return NextResponse.json({ error: 'User is not assigned to a department' }, { status: 403 });
        }

        // Security: the custodian boundary. The data team own their items (cards, drives,
        // readers) and equipment managers own the gear; neither may write the other's.
        // Checked against the STORED custodian as well as the incoming one, so an item
        // can't be captured by simply claiming it in the payload.
        if (caller.role === 'DATA_MANAGER' || caller.role === 'MANAGER') {
            const admin = getSupabaseAdmin();
            const ids = items.map(i => i.id).filter((id): id is string => typeof id === 'string');
            const existing = ids.length
                ? (await admin.from('equipment').select('id, metadata').in('id', ids)).data || []
                : [];
            const storedCustodian = new Map<string, unknown>(
                existing.map((row: { id: string; metadata?: { custodian?: unknown } | null }) =>
                    [row.id, row.metadata?.custodian])
            );

            const wantsData = caller.role === 'DATA_MANAGER';
            const allowed = items.every((item) => {
                const incoming = (item.metadata as { custodian?: unknown } | undefined)?.custodian;
                const stored = typeof item.id === 'string' ? storedCustodian.get(item.id) : undefined;
                // A brand-new item has no stored row, so only the incoming value applies.
                const isDataIncoming = incoming === 'DATA';
                const isDataStored = stored === 'DATA';
                const existsAlready = typeof item.id === 'string' && storedCustodian.has(item.id);
                return existsAlready
                    ? isDataStored === wantsData && isDataIncoming === wantsData
                    : isDataIncoming === wantsData;
            });

            if (!allowed) {
                return NextResponse.json(
                    { error: wantsData ? 'Data managers can only manage data team items' : 'Managers cannot manage data team items' },
                    { status: 403 }
                );
            }
        }

        // Security: for non-Super Admins, enforce that all items belong to their department
        const processedItems = items.map((item) => {
            if (caller.role !== 'SUPER_ADMIN') {
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
    } catch (err: unknown) {
        console.error('[API] Equipment POST error:', err);
        const message = err instanceof Error ? err.message : 'Failed to save equipment';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
