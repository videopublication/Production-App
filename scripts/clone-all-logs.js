const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const sourceSupabase = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const targetSupabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function cloneTablePaginated(tableName) {
    console.log(`\n⏳ Fetching ALL records for [${tableName}] from Source Supabase...`);

    let allRows = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await sourceSupabase
            .from(tableName)
            .select('*')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error(`Error fetching [${tableName}] page ${page}:`, error.message);
            break;
        }

        if (data.length > 0) {
            allRows.push(...data);
            console.log(`  Fetched page ${page + 1}: ${data.length} rows (Total so far: ${allRows.length})`);
            page++;
            if (data.length < pageSize) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    console.log(`📦 Total fetched for [${tableName}]: ${allRows.length} rows. Inserting into Target Supabase...`);

    if (allRows.length === 0) return;

    // Batch insert 500 rows at a time
    const batchSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < allRows.length; i += batchSize) {
        const batch = allRows.slice(i, i + batchSize);
        const { error: insertErr } = await targetSupabase
            .from(tableName)
            .upsert(batch);

        if (insertErr) {
            console.error(`  ❌ Error inserting batch into Target [${tableName}]:`, insertErr.message);
        } else {
            insertedCount += batch.length;
            console.log(`  ✅ Inserted batch: ${insertedCount}/${allRows.length} rows`);
        }
    }

    console.log(`🎉 Finished [${tableName}]: ${insertedCount}/${allRows.length} rows migrated!`);
}

async function runFullMigration() {
    console.log('🚀 Starting FULL Paginated Database Migration for Logs & Notifications...');
    
    // Migrate logs and notifications completely
    await cloneTablePaginated('logs');
    await cloneTablePaginated('notifications');
    
    console.log('\n🎉 ALL LOGS & NOTIFICATIONS MIGRATED 100%!');
}

runFullMigration();
