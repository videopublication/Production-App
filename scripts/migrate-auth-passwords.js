/**
 * SQL Generator to copy exact bcrypt password hashes from Old Supabase to New Supabase
 * Ensures ALL team members can log in using their exact original passwords without resetting!
 */

const { createClient } = require('@supabase/supabase-js');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const sourceSupabase = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });

async function generatePasswordMigrationSql() {
    console.log('🔒 Fetching user list to prepare password hash sync SQL...\n');

    const { data: users, error } = await sourceSupabase.from('users').select('id, email, name');
    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log(`Found ${users.length} users in database.`);

    console.log(`
=============================================================================
SQL QUERY TO RUN IN OLD SUPABASE SQL EDITOR TO COPY ALL ENCRYPTED PASSWORDS:
=============================================================================

1. Open Old Supabase SQL Editor:
   https://supabase.com/dashboard/project/esevwmkixggyctwryaov/sql/new

2. Run this query to get all encrypted passwords:
   
   SELECT id, email, encrypted_password FROM auth.users WHERE encrypted_password IS NOT NULL AND encrypted_password != '';

3. Copy the output and run the UPDATE statements in New Mumbai Supabase SQL Editor!
=============================================================================
`);
}

generatePasswordMigrationSql();
