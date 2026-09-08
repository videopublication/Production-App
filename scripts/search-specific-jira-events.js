const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || 'https://servicedesk.isha.in').replace(/\/+$/, '');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

function searchJiraJql(jql, maxResults = 5) {
    return new Promise((resolve) => {
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,created,reporter&maxResults=${maxResults}`;
        
        const req = https.get(url, {
            headers: {
                'Authorization': `Bearer ${JIRA_TOKEN}`,
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.issues || []);
                    } catch (e) {
                        resolve([]);
                    }
                } else {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
    });
}

const SPECIFIC_EVENTS = [
    { num: 763, query: 'Naga Panchami' },
    { num: 545, query: 'IDY' },
    { num: 565, query: 'Patna' },
    { num: 596, query: 'Koppal' },
    { num: 617, query: 'Valluvan' },
    { num: 737, query: 'Delhi' },
    { num: 721, query: 'Anukampa' },
    { num: 686, query: 'Samskriti Performance' },
    { num: 131, query: 'Mulapari' },
    { num: 168, query: 'Rudraksha Procession' },
    { num: 170, query: 'Maha Arthi' },
    { num: 185, query: 'IRHC' },
    { num: 286, query: 'Tirupur' },
    { num: 458, query: 'Hatayoga' }
];

async function main() {
    console.log('Searching for specific major event matches in Jira...\n');
    for (const ev of SPECIFIC_EVENTS) {
        const issues = await searchJiraJql(`project in (VP) AND (summary ~ "${ev.query}" OR text ~ "${ev.query}") AND created >= "2026-01-01"`, 3);
        console.log(`Shoot #${ev.num} (Query: "${ev.query}"):`);
        if (issues.length === 0) {
            console.log('   ↳ No matching Jira ticket created in 2026');
        } else {
            issues.forEach(iss => {
                console.log(`   ↳ [${iss.key}] "${iss.fields?.summary}" (Created: ${iss.fields?.created?.split('T')[0]}, Status: ${iss.fields?.status?.name})`);
            });
        }
    }
}

main();
