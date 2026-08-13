const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Target Supabase direct connection string
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:ctpQRIB35CdHNxSIITkE9szzwpSagKjQdl9N6rM-tgs@db.wnxgdhfwhefjjqziiart.supabase.co:5432/postgres';

async function setupSchema() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔌 Connecting to Office Supabase Database...');
        await client.connect();
        console.log('✅ Connected successfully!');

        const sqlPath = path.join(__dirname, '..', 'complete_office_supabase_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('⚡ Executing complete schema & table creation SQL...');
        await client.query(sql);
        console.log('🎉 All 11 tables, triggers, and functions created in Office Supabase!');

    } catch (err) {
        console.error('❌ Error applying schema:', err.message);
    } finally {
        await client.end();
    }
}

setupSchema();
