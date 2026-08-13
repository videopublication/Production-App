/**
 * Automated Supabase Database Migration Tool
 * Copies all tables, users, equipment, transactions, shoots, leaves, and logs 
 * from Source Supabase Project to Target Office Supabase Project.
 *
 * Usage:
 *   node scripts/clone-supabase-db.js --target-url="https://OFFICE_REF.supabase.co" --target-key="OFFICE_SERVICE_ROLE_KEY"
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read source credentials from .env.local if available
let sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://esevwmkixggyctwryaov.supabase.co';
let sourceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

try {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
                sourceUrl = trimmed.split('=')[1].replace(/['"]/g, '');
            }
            if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
                sourceKey = trimmed.split('=')[1].replace(/['"]/g, '');
            }
        });
    }
} catch (e) {
    console.warn('Warning: Could not read .env.local directly');
}

// Parse command line arguments
const args = process.argv.slice(2);
let targetUrl = '';
let targetKey = '';

args.forEach(arg => {
    if (arg.startsWith('--target-url=')) targetUrl = arg.split('=')[1];
    if (arg.startsWith('--target-key=')) targetKey = arg.split('=')[1];
    if (arg.startsWith('--source-url=')) sourceUrl = arg.split('=')[1];
    if (arg.startsWith('--source-key=')) sourceKey = arg.split('=')[1];
});

if (!targetUrl || !targetKey) {
    console.log('\n❌ Error: Missing Target Supabase Credentials.\n');
    console.log('Usage:');
    console.log('  node scripts/clone-supabase-db.js --target-url="https://OFFICE_REF.supabase.co" --target-key="OFFICE_SERVICE_ROLE_KEY"\n');
    process.exit(1);
}

const sourceSupabase = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const targetSupabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

// List of tables to clone in order of foreign key dependency
const TABLES = [
    'departments',
    'users',
    'equipment',
    'shoots',
    'assignments',
    'planner_draft_assignments',
    'assignment_segments',
    'transactions',
    'leaves',
    'notifications',
    'logs',
    'user_sessions'
];

async function migrateTable(tableName) {
    console.log(`\n⏳ Fetching [${tableName}] from Source Supabase...`);
    try {
        const { data: rows, error: fetchErr } = await sourceSupabase.from(tableName).select('*');
        if (fetchErr) {
            console.error(`❌ Error fetching table [${tableName}]:`, fetchErr.message);
            return;
        }

        if (!rows || rows.length === 0) {
            console.log(`ℹ️ Table [${tableName}] is empty. Skipping.`);
            return;
        }

        console.log(`📦 Fetched ${rows.length} rows from [${tableName}]. Inserting into Target Supabase...`);
        const { error: insertErr } = await targetSupabase.from(tableName).upsert(rows);

        if (insertErr) {
            console.error(`❌ Error inserting rows into Target [${tableName}]:`, insertErr.message);
        } else {
            console.log(`✅ Successfully cloned ${rows.length} rows into [${tableName}]!`);
        }
    } catch (err) {
        console.error(`❌ Unexpected error processing [${tableName}]:`, err);
    }
}

async function runMigration() {
    console.log('\n🚀 Starting Supabase Automated Database Migration');
    console.log(`Source DB: ${sourceUrl}`);
    console.log(`Target DB: ${targetUrl}\n`);

    for (const table of TABLES) {
        await migrateTable(table);
    }

    console.log('\n🎉 Supabase Database Migration Completed Successfully!\n');
}

runMigration();
