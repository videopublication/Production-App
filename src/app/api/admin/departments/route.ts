import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Create admin client for admin operations
const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

// Helper to verify admin session
// Helper to verify admin session
async function ensureAdmin() {
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

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return { error: 'Unauthorized', status: 401 };
    }

    // Use admin client to bypass RLS for role check
    const supabaseAdmin = getSupabaseAdmin();

    // Check role in public.users table (source of truth)
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
        console.error('Error fetching user profile for admin check:', profileError);
        return { error: 'Forbidden: Could not verify permissions', status: 403 };
    }

    // Check if role is SUPER_ADMIN
    // Profile role might be mixed case or strictly SUPER_ADMIN depending on DB enum/text
    if (profile.role !== 'SUPER_ADMIN') {
        console.warn(`Access denied: User ${user.email} (role: ${profile.role}) attempted to access SUPER_ADMIN only route.`);
        return { error: 'Forbidden: Super Admin access required', status: 403 };
    }

    return { success: true };
}

export async function GET(request: Request) {
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data, error } = await supabaseAdmin
            .from('departments')
            .select('*')
            .order('name');

        if (error) throw error;

        // Transform snake_case to camelCase
        const departments = data.map(d => ({
            id: d.id,
            name: d.name,
            slug: d.slug,
            enabledFeatures: d.enabled_features,
            settings: d.settings
        }));

        return NextResponse.json(departments);
    } catch (error: any) {
        console.error('Error fetching departments:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const body = await request.json();

        // Basic validation
        if (!body.name || !body.slug) {
            return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
        }

        const dbDept = {
            id: body.id || crypto.randomUUID(),
            name: body.name,
            slug: body.slug,
            enabled_features: body.enabledFeatures || [],
            settings: body.settings || {}
        };

        const { error } = await supabaseAdmin
            .from('departments')
            .insert(dbDept);

        if (error) throw error;

        return NextResponse.json({ message: 'Department created successfully' });
    } catch (error: any) {
        console.error('Error creating department:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const body = await request.json();

        if (!body.id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const dbUpdates: any = {};
        if (body.name) dbUpdates.name = body.name;
        if (body.slug) dbUpdates.slug = body.slug;
        if (body.enabledFeatures) dbUpdates.enabled_features = body.enabledFeatures;
        if (body.settings) dbUpdates.settings = body.settings;

        const { error } = await supabaseAdmin
            .from('departments')
            .update(dbUpdates)
            .eq('id', body.id);

        if (error) throw error;

        return NextResponse.json({ message: 'Department updated successfully' });
    } catch (error: any) {
        console.error('Error updating department:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
