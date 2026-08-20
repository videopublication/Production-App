const { createClient } = require('@supabase/supabase-js');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const src = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

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

async function fetchAll(client, table) {
    let rows = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await client
            .from(table)
            .select('*')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error || !data || data.length === 0) break;
        rows.push(...data);
        page++;
        if (data.length < pageSize) break;
    }
    return rows;
}

async function findMissing() {
    console.log('=== COMPREHENSIVE OLD DB vs NEW DB ID COMPARISON ===\n');

    for (const table of TABLES) {
        const srcRows = await fetchAll(src, table);
        const tgtRows = await fetchAll(tgt, table);

        const tgtIds = new Set(tgtRows.map(r => r.id));
        const missingInTgt = srcRows.filter(r => !tgtIds.has(r.id));

        console.log(`Table [${table.padEnd(25)}]: Old DB = ${srcRows.length} | New DB = ${tgtRows.length} | Missing from New: ${missingInTgt.length}`);
        
        if (missingInTgt.length > 0) {
            console.log(`  -> Recovering ${missingInTgt.length} missing rows into New DB...`);
            const batchSize = 100;
            for (let i = 0; i < missingInTgt.length; i += batchSize) {
                const batch = missingInTgt.slice(i, i + batchSize);
                const { error } = await tgt.from(table).upsert(batch);
                if (error) {
                    console.error(`     Error inserting into ${table}:`, error.message);
                } else {
                    console.log(`     ✅ Successfully inserted batch ${i / batchSize + 1}`);
                }
            }
        }
    }
    console.log('\n=== COMPLETED RECOVERY CHECK ===');
}

findMissing().catch(console.error);
