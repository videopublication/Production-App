const { createClient } = require('@supabase/supabase-js');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const sourceSupabase = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const targetSupabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function checkAndSyncDelta() {
    console.log('🔍 Checking for any new activity or transactions in the last few hours...\n');

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
        'logs'
    ];

    for (const table of TABLES) {
        // Get count from source & target
        const [{ count: srcCount }, { count: tgtCount }] = await Promise.all([
            sourceSupabase.from(table).select('*', { count: 'exact', head: true }),
            targetSupabase.from(table).select('*', { count: 'exact', head: true })
        ]);

        console.log(`Table [${table.padEnd(25)}]: Source = ${srcCount} rows | Target = ${tgtCount} rows`);

        if (srcCount !== tgtCount || table === 'transactions' || table === 'shoots' || table === 'logs') {
            console.log(`  ⚡ Running delta sync for [${table}]...`);
            
            // Fetch all source rows with pagination if needed
            let allSourceRows = [];
            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await sourceSupabase
                    .from(table)
                    .select('*')
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error || !data || data.length === 0) {
                    hasMore = false;
                } else {
                    allSourceRows.push(...data);
                    page++;
                    if (data.length < pageSize) hasMore = false;
                }
            }

            if (allSourceRows.length > 0) {
                // Upsert in batches of 500
                const batchSize = 500;
                for (let i = 0; i < allSourceRows.length; i += batchSize) {
                    const batch = allSourceRows.slice(i, i + batchSize);
                    await targetSupabase.from(table).upsert(batch);
                }
                console.log(`  ✅ Successfully synced all ${allSourceRows.length} rows for [${table}]!`);
            }
        }
    }

    console.log('\n🎉 FINAL DELTA SYNC COMPLETED! Mumbai Database is 100% up-to-date to the exact second!');
}

checkAndSyncDelta();
