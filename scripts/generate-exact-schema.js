const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const supabase = createClient(sourceUrl, sourceKey);

async function inspectTables() {
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

    console.log('Inspecting source tables columns...\n');
    let fullSql = '-- PERFECT AUTOMATED SCHEMA FROM SOURCE DATABASE\n\n';

    for (const table of TABLES) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (data && data.length > 0) {
            const sample = data[0];
            const cols = Object.keys(sample);
            console.log(`Table [${table}] columns (${cols.length}):`, cols.join(', '));

            fullSql += `CREATE TABLE IF NOT EXISTS public.${table} (\n`;
            const colDefs = cols.map(col => {
                const val = sample[col];
                let colType = 'TEXT';
                if (col === 'id') colType = 'UUID PRIMARY KEY DEFAULT gen_random_uuid()';
                else if (typeof val === 'boolean') colType = 'BOOLEAN';
                else if (typeof val === 'number') colType = Number.isInteger(val) ? 'INTEGER' : 'NUMERIC';
                else if (Array.isArray(val)) colType = 'TEXT[]';
                else if (val !== null && typeof val === 'object') colType = 'JSONB';
                return `    "${col}" ${colType}`;
            });
            fullSql += colDefs.join(',\n') + '\n);\n\n';
            fullSql += `ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY;\n\n`;
        }
    }

    fs.writeFileSync('complete_office_supabase_schema.sql', fullSql);
    console.log('\n✅ Updated complete_office_supabase_schema.sql with EXACT source columns!');
}

inspectTables();
