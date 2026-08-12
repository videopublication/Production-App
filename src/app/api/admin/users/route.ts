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

// Create admin client for admin operations (create user, change password, toggle status)
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

// Helper to check for admin session
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

    // Verify role against database source of truth
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

export async function GET() {
    // 1. Verify User is Admin
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        console.log('Fetching users using admin client...');

        const supabaseAdmin = getSupabaseAdmin();
        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('id, name, email, phone, whatsapp_number, can_self_edit_profile, role, status, department_id, is_primary_leave_approver, can_manage_expenses, can_be_assigned_to_shoots, department:departments(name)')
            .order('name', { ascending: true });

        if (error) {
            console.error('Supabase error fetching users:', error);
            return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
        }

        console.log('Successfully fetched users, count:', users?.length || 0);
        return NextResponse.json(users || []);
    } catch (error: unknown) {
        console.error('API Route Error:', error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    phone: z.string().optional().nullable(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE_MANAGER', 'DATA_MANAGER', 'CREW']),
    departmentId: z.string().nullable().optional(),
    canBeAssignedToShoots: z.boolean().optional(),
    canSelfEditProfile: z.boolean().optional()
});

export async function POST(request: Request) {
    // 1. Verify User is Admin
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const body = await request.json();

        // Validate Input
        const result = createUserSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { email, password, name, phone, role, departmentId, canBeAssignedToShoots, canSelfEditProfile } = result.data;
        const requester = authCheck.profile;
        if (!requester) {
            return NextResponse.json({ error: 'Admin profile not found' }, { status: 403 });
        }

        if (requester.role !== 'SUPER_ADMIN' && role === 'SUPER_ADMIN') {
            return NextResponse.json({ error: 'Only super admins can create super admin users' }, { status: 403 });
        }

        const assignedDepartmentId = requester.role === 'SUPER_ADMIN'
            ? (departmentId || null)
            : requester.department_id;

        if (requester.role !== 'SUPER_ADMIN' && !assignedDepartmentId) {
            return NextResponse.json({ error: 'Your admin account is not assigned to a department' }, { status: 400 });
        }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (authError) throw authError;

        if (authData.user) {
            // 2. Create user profile in public.users table
            const { error: profileError } = await supabaseAdmin
                .from('users')
                .insert([
                    {
                        id: authData.user.id,
                        email,
                        name,
                        phone: phone || null,
                        whatsapp_number: phone || null,
                        role,
                        status: 'ACTIVE', // Admin created users are active by default
                        department_id: assignedDepartmentId,
                        can_be_assigned_to_shoots: canBeAssignedToShoots ?? role === 'CREW',
                        can_self_edit_profile: canSelfEditProfile !== false
                    }
                ]);

            if (profileError) {
                // Cleanup auth user if profile creation fails
                await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
                throw profileError;
            }
        }

        return NextResponse.json({ message: 'User created successfully' });
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

const updateUserSchema = z.object({
    id: z.string(),
    password: z.string().min(6).optional(),
    status: z.string().optional(),
    role: z.string().optional(),
    phone: z.string().optional().nullable(),
    departmentId: z.string().optional().nullable(),
    isPrimaryLeaveApprover: z.boolean().optional(),
    canManageExpenses: z.boolean().optional(),
    canBeAssignedToShoots: z.boolean().optional(),
    canSelfEditProfile: z.boolean().optional()
});

export async function PUT(request: Request) {
    // 1. Verify User is Admin
    const authCheck = await ensureAdmin();
    if (authCheck.error) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const body = await request.json();

        // Validate Input
        const result = updateUserSchema.safeParse(body);
        if (!result.success) {
            console.error('Validation failed for update user:', result.error.format());
            return NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
        }

        const { id, password, status, role, phone, departmentId, isPrimaryLeaveApprover, canManageExpenses, canBeAssignedToShoots, canSelfEditProfile } = result.data;

        if (password) {
            const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(id, {
                password
            });
            if (passwordError) throw passwordError;
        }

        const updates: {
            status?: string;
            role?: string;
            phone?: string | null;
            whatsapp_number?: string | null;
            department_id?: string | null;
            is_primary_leave_approver?: boolean;
            can_manage_expenses?: boolean;
            can_be_assigned_to_shoots?: boolean;
            can_self_edit_profile?: boolean;
        } = {};
        if (status) updates.status = status;
        if (role) updates.role = role;
        if (phone !== undefined) {
            updates.phone = phone || null;
            updates.whatsapp_number = phone || null;
        }
        if (departmentId !== undefined) updates.department_id = departmentId;
        if (isPrimaryLeaveApprover !== undefined) updates.is_primary_leave_approver = isPrimaryLeaveApprover;
        if (canManageExpenses !== undefined) updates.can_manage_expenses = canManageExpenses;
        if (canBeAssignedToShoots !== undefined) updates.can_be_assigned_to_shoots = canBeAssignedToShoots;
        if (canSelfEditProfile !== undefined) updates.can_self_edit_profile = canSelfEditProfile;

        if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabaseAdmin
                .from('users')
                .update(updates)
                .eq('id', id);

            if (updateError) throw updateError;
        }

        return NextResponse.json({ message: 'User updated successfully' });
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
