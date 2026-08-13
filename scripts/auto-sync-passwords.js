const { Client } = require('pg');

// Direct DB connection strings for source (esevwmkixggyctwryaov) and target (ltnbkmjeyifjpxvcqpte)
// Region: ap-south-1
const sourceConn = 'postgres://postgres.esevwmkixggyctwryaov:5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
const targetConn = 'postgres://postgres.ltnbkmjeyifjpxvcqpte:Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

async function autoSyncPasswords() {
    console.log('🔌 Connecting to Source & Target Databases to automatically copy ALL encrypted passwords...\n');

    const sourceClient = new Client({ connectionString: sourceConn, ssl: { rejectUnauthorized: false } });
    const targetClient = new Client({ connectionString: targetConn, ssl: { rejectUnauthorized: false } });

    try {
        await sourceClient.connect();
        await targetClient.connect();
        console.log('✅ Connected to both databases!');

        const res = await sourceClient.query("SELECT id, email, encrypted_password FROM auth.users WHERE encrypted_password IS NOT NULL AND encrypted_password != ''");
        console.log(`📦 Found ${res.rows.length} password hashes in source auth.users.`);

        let updatedCount = 0;

        for (const row of res.rows) {
            await targetClient.query("UPDATE auth.users SET encrypted_password = $1 WHERE id = $2", [row.encrypted_password, row.id]);
            updatedCount++;
            console.log(`✅ Synced original password hash for: ${row.email}`);
        }

        console.log(`\n🎉 SUCCESS! Automatically copied exact original passwords for all ${updatedCount} team members!`);

    } catch (err) {
        console.error('❌ Error syncing passwords:', err.message);
    } finally {
        await sourceClient.end().catch(() => {});
        await targetClient.end().catch(() => {});
    }
}

autoSyncPasswords();
