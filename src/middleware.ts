import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Create Supabase client
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    // Get User
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname

    // Public paths we always allow without auth
    const isPublicPath = path === '/login' || path === '/auth/callback' || path.startsWith('/_next') || path.startsWith('/static') || path === '/favicon.ico'

    // If no user and trying to access protected route
    if (!user && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // If user exists, check their status/role
    if (user) {
        // FAST PATH: Check Custom Claims (JWT) first
        // If these exist, we save a Database Round-trip!
        const meta = user.app_metadata || {}
        const claimRole = meta.role
        const claimStatus = meta.status

        let role = claimRole
        let status = claimStatus

        // SLOW PATH: If claims missing, fetch from DB (Legacy/Fallback)
        if (!role || !status) {
            console.log("Middleware: Claims missing, fetching from DB (Slow)")
            const { data: profile } = await supabase
                .from('users')
                .select('status, role')
                .eq('id', user.id)
                .single()

            if (profile) {
                role = profile.role
                status = profile.status
            }
        }

        // Handle inactive users
        if (status) {
            const isInactive = status === 'PENDING' || status === 'SUSPENDED'
            const isOnInactivePage = path === '/inactive'

            // If inactive and NOT on inactive page -> Redirect to inactive
            if (isInactive && !isOnInactivePage) {
                const reason = status === 'SUSPENDED' ? 'suspended' : 'pending'
                return NextResponse.redirect(new URL(`/inactive?reason=${reason}`, request.url))
            }

            // If active and ON inactive page -> Redirect to dashboard
            if (!isInactive && isOnInactivePage) {
                return NextResponse.redirect(new URL('/', request.url))
            }

            // If active and ON login page -> Redirect to dashboard
            if (!isInactive && path === '/login') {
                return NextResponse.redirect(new URL('/', request.url))
            }

            // Admin protection for /admin and /api/admin routes
            const isShootsRoute = path.startsWith('/admin/shoots') || path.startsWith('/api/admin/shoots');

            // Allow Managers and Crew to access Shoots, but restrict other Admin routes to Admin only
            if ((path.startsWith('/admin') || path.startsWith('/api/admin')) && role !== 'ADMIN' && !isShootsRoute) {
                if (path.startsWith('/api/')) {
                    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
                }
                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - manifest.json (PWA manifest)
         * - firebase-messaging-sw.js (Firebase service worker)
         * - api (API routes can have their own protection, or included)
         */
        '/((?!_next/static|_next/image|favicon.ico|manifest.json|firebase-messaging-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
