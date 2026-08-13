/**
 * Script to populate auth.users in Target Supabase from public.users
 * Ensures Google OAuth and Email users log in with their exact existing UUIDs and roles.
 */

const { createClient } = require('@supabase/supabase-js');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const sourceSupabase = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const targetSupabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function syncAuthUsers() {
    console.log('🚀 Syncing public.users profiles to auth.users in Office Supabase...\n');

    const { data: users, error } = await sourceSupabase.from('users').select('*');
    if (error) {
        console.error('Error fetching source users:', error);
        return;
    }

    console.log(`Found ${users.length} users in public.users. Creating auth accounts...`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const u of users) {
        if (!u.email) continue;

        try {
            const { data: newUser, error: createErr } = await targetSupabase.auth.admin.createUser({
                id: u.id,
                email: u.email,
                email_confirm: true,
                user_metadata: {
                    name: u.name,
                    avatar_url: u.avatar_url
                },
                app_metadata: {
                    role: u.role,
                    status: u.status,
                    provider: 'google',
                    providers: ['google', 'email']
                }
            });

            if (createErr) {
                if (createErr.message.includes('already has been registered') || createErr.message.includes('already exists')) {
                    skippedCount++;
                } else {
                    console.warn(`Warning creating auth user [${u.email}]:`, createErr.message);
                }
            } else {
                createdCount++;
                console.log(`✅ Created auth account for: ${u.email} (${u.role})`);
            }
        } catch (err) {
            console.error(`Error processing user ${u.email}:`, err);
        }
    }

    console.log(`\n🎉 Auth Accounts Sync Completed!`);
    console.log(`Created: ${createdCount} users | Already Exists: ${skippedCount} users`);
}

syncAuthUsers();
