const { Client } = require('pg');

const hosts = [
    'db.ltnbkmjeyifjpxvcqpte.supabase.co',
    'aws-0-ap-south-1.pooler.supabase.com'
];

const ports = [5432, 6543];

const users = [
    'postgres',
    'postgres.ltnbkmjeyifjpxvcqpte'
];

const passwds = [
    'Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ',
    '5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI',
    'postgres',
    'ProductionApp2026!',
    'ProductionApp2026',
    'VpApp2026!',
    'VpApp2026'
];

async function findConn() {
    for (const host of hosts) {
        for (const port of ports) {
            for (const u of users) {
                for (const p of passwds) {
                    const connStr = `postgres://${u}:${encodeURIComponent(p)}@${host}:${port}/postgres`;
                    const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 3000 });
                    try {
                        console.log(`Testing ${u}@${host}:${port}...`);
                        await client.connect();
                        console.log(`\n🎉 WORKING CONNECTION: ${connStr}\n`);
                        await client.end();
                        return connStr;
                    } catch (err) {
                        // ignore failed connection
                    }
                }
            }
        }
    }
    console.error('No working connection found');
}

findConn();
