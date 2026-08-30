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

function searchJiraJql(jql, maxResults = 10) {
    return new Promise((resolve) => {
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,created,reporter,customfield_10000,description&maxResults=${maxResults}`;
        
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

function cleanTitleForJql(title) {
    if (!title) return '';
    return title
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\b(shoot|request|video|coverage|for|the|and|in|at|of|on|a|an)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function main() {
    const { data: shoots, error } = await supabase
        .from('shoots')
        .select('id, shoot_number, title, start_time, end_time, location, poc_name, status, jira_ticket_id')
        .order('shoot_number', { ascending: true });

    if (error) {
        console.error('Error fetching shoots:', error);
        return;
    }

    const unlinked = shoots.filter(s => (!s.jira_ticket_id || s.jira_ticket_id.trim() === '') && s.shoot_number !== 1171);
    console.log(`Total Unlinked Shoots: ${unlinked.length}`);

    // Sample the first 10 shoots to see match results
    const sample = unlinked.slice(0, 15);
    const results = [];

    for (const s of sample) {
        const keywords = cleanTitleForJql(s.title);
        let matchedIssues = [];

        if (keywords.length >= 3) {
            // Search Jira by summary keywords
            const jql = `project in (VP) AND summary ~ "${keywords}"`;
            matchedIssues = await searchJiraJql(jql, 3);
        }

        results.push({
            shootNumber: s.shoot_number,
            title: s.title,
            date: s.start_time ? s.start_time.split('T')[0] : 'N/A',
            keywords,
            matches: matchedIssues.map(i => ({
                key: i.key,
                summary: i.fields?.summary,
                status: i.fields?.status?.name,
                created: i.fields?.created?.split('T')[0]
            }))
        });
    }

    console.log('\n--- MATCHING RESULTS PREVIEW ---');
    for (const r of results) {
        console.log(`\nShoot #${r.shootNumber}: "${r.title}" (Date: ${r.date})`);
        if (r.matches.length === 0) {
            console.log('   ↳ No direct Jira matches found');
        } else {
            r.matches.forEach(m => {
                console.log(`   ↳ [${m.key}] "${m.summary}" (Created: ${m.created}, Status: ${m.status})`);
            });
        }
    }
}

main();
