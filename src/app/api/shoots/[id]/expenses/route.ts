import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type Expense = {
    id?: string;
    type: string;
    amount?: number;
    campaign?: string;
};

const getExpenseAmount = (expenses: Expense[], type: string) =>
    Number(expenses.find(expense => expense.type === type)?.amount) || 0;

const describeExpenseChanges = (oldExpenses: Expense[], newExpenses: Expense[]) => {
    const expenseTypes = Array.from(new Set([
        ...oldExpenses.map(expense => expense.type),
        ...newExpenses.map(expense => expense.type)
    ])).filter(Boolean);

    const amountChanges = expenseTypes
        .map(type => {
            const oldAmount = getExpenseAmount(oldExpenses, type);
            const newAmount = getExpenseAmount(newExpenses, type);
            return oldAmount !== newAmount ? `${type}: Rs ${oldAmount} -> Rs ${newAmount}` : null;
        })
        .filter(Boolean);

    const oldCampaign = oldExpenses.find(expense => expense.campaign)?.campaign || '';
    const newCampaign = newExpenses.find(expense => expense.campaign)?.campaign || '';
    const campaignChange = oldCampaign !== newCampaign
        ? `Category: ${oldCampaign || 'None'} -> ${newCampaign || 'None'}`
        : null;

    const changes = [...amountChanges, campaignChange].filter(Boolean);
    return changes.length > 0 ? `Updated shoot expenses (${changes.join(', ')})` : 'Updated shoot expenses';
};

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const { id } = params;
        const { expenses } = await request.json();
        if (!Array.isArray(expenses)) {
            return NextResponse.json({ error: 'Invalid expenses payload' }, { status: 400 });
        }

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

        const { data: shoot, error: shootError } = await supabaseAdmin
            .from('shoots')
            .select('id, expenses, department_id')
            .eq('id', id)
            .single();

        if (shootError || !shoot) {
            return NextResponse.json({ error: 'Shoot not found' }, { status: 404 });
        }

        const oldExpenses = (shoot.expenses || []) as Expense[];
        const newExpenses = expenses as Expense[];

        // 3. Update the shoot expenses using service role to bypass restrictive RLS
        const { error: updateError } = await supabaseAdmin
            .from('shoots')
            .update({ expenses: newExpenses })
            .eq('id', id);

        if (updateError) {
            console.error('Error updating shoot expenses:', updateError);
            return NextResponse.json({ error: 'Failed to update expenses' }, { status: 500 });
        }

        const log = {
            id: crypto.randomUUID(),
            action: 'EDIT',
            entity_id: id,
            user_id: user.id,
            timestamp: new Date().toISOString(),
            details: describeExpenseChanges(oldExpenses, newExpenses),
            old_value: oldExpenses,
            new_value: newExpenses,
            department_id: shoot.department_id
        };

        const { error: logError } = await supabaseAdmin
            .from('logs')
            .insert(log);

        if (logError) {
            console.error('Error logging shoot expense update:', logError);
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Error in PUT /api/shoots/[id]/expenses:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
