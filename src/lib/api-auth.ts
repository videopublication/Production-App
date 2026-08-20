import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Session checks for route handlers. Reads the Supabase session from cookies, so
 * a route using these is only reachable by a signed-in user of this app — the
 * thing an externally-hosted function with `--no-verify-jwt` cannot offer.
 */

export interface ApiActor {
    id: string;
    email?: string;
    role: string;
    departmentId: string | null;
}

const sessionClient = async () => {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // Route handlers cannot always write cookies; harmless here.
                    }
                },
            },
        }
    );
};

/** Any signed-in, non-suspended user. */
export const requireUser = async (): Promise<{ actor: ApiActor } | { error: string; status: number }> => {
    const supabase = await sessionClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { error: 'Unauthorized', status: 401 };

    // Role and status come from the database, never from client-supplied claims.
    const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role, status, department_id')
        .eq('id', user.id)
        .single();

    if (!profile) return { error: 'Profile not found', status: 403 };
    if (profile.status === 'SUSPENDED') return { error: 'Account suspended', status: 403 };

    return {
        actor: {
            id: user.id,
            email: user.email,
            role: profile.role,
            departmentId: profile.department_id ?? null,
        },
    };
};

/** Signed-in and holding one of the given roles. */
export const requireRole = async (
    roles: string[]
): Promise<{ actor: ApiActor } | { error: string; status: number }> => {
    const result = await requireUser();
    if ('error' in result) return result;
    if (!roles.includes(result.actor.role)) {
        return { error: 'Forbidden', status: 403 };
    }
    return result;
};

/**
 * Shared secret for scheduled callers (Vercel cron), matching the check already
 * used by /api/cron/shoot-reminders.
 */
export const hasCronSecret = (req: Request) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const url = new URL(req.url);
    return req.headers.get('authorization') === `Bearer ${secret}`
        || url.searchParams.get('secret') === secret;
};
