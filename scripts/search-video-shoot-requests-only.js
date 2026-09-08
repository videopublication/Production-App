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
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,created,reporter,description,issuetype&maxResults=${maxResults}`;
        
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

function normalizeWords(str) {
    if (!str) return [];
    return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !['shoot', 'request', 'video', 'coverage', 'for', 'the', 'and', 'in', 'at', 'of', 'on', 'a', 'an', 'with', 'from', 'all', 'setup', 'checking', 'venue'].includes(w));
}

function scoreCandidate(shoot, shootCrewNames, candidate) {
    let score = 0;
    const summary = candidate.fields?.summary?.toLowerCase() || '';
    const desc = (candidate.fields?.description || '').toLowerCase();
    const reporter = (candidate.fields?.reporter?.displayName || candidate.fields?.reporter?.name || '').toLowerCase();
    const createdDate = candidate.fields?.created ? new Date(candidate.fields.created) : null;
    const shootDate = shoot.start_time ? new Date(shoot.start_time) : null;

    // 1. Title Keyword Match
    const shootWords = normalizeWords(shoot.title);
    let matchedWords = 0;
    for (const w of shootWords) {
        if (summary.includes(w) || desc.includes(w)) {
            matchedWords++;
        }
    }
    if (shootWords.length > 0) {
        score += (matchedWords / shootWords.length) * 50;
    }

    // 2. POC / Reporter Match
    if (shoot.poc_name) {
        const poc = shoot.poc_name.toLowerCase().trim();
        if (reporter.includes(poc) || desc.includes(poc) || summary.includes(poc)) {
            score += 25;
        }
    }

    // 3. Crew Mentions Match
    for (const crew of shootCrewNames) {
        const cLower = crew.toLowerCase().trim();
        if (desc.includes(cLower) || summary.includes(cLower)) {
            score += 15;
            break;
        }
    }

    // 4. Date Proximity (+/- 45 days)
    if (shootDate && createdDate) {
        const diffDays = Math.abs((shootDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) score += 20;
        else if (diffDays <= 30) score += 15;
        else if (diffDays <= 60) score += 5;
    }

    return Math.min(100, Math.round(score));
}

async function main() {
    console.log('Fetching 97 unlinked confirmed shoots...');

    const [{ data: shoots }, { data: assignments }, { data: users }] = await Promise.all([
        supabase.from('shoots').select('*').eq('status', 'CONFIRMED').is('jira_ticket_id', null).order('shoot_number', { ascending: true }),
        supabase.from('assignments').select('*'),
        supabase.from('users').select('id, name, email')
    ]);

    const userMap = new Map(users.map(u => [u.id, u.name || u.email]));
    console.log(`Loaded ${shoots.length} unlinked confirmed shoots. Querying ONLY issuetype = 'Video Shoot Request'...\n`);

    const matchesFound = [];
    const internalOrNoMatch = [];

    // Run in parallel chunks of 10
    const chunkSize = 10;
    for (let i = 0; i < shoots.length; i += chunkSize) {
        const chunk = shoots.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (shoot) => {
            if (shoot.shoot_number === 1171) return;

            const shootCrew = assignments.filter(a => a.shootId === shoot.id).map(a => userMap.get(a.userId)).filter(Boolean);
            const keywords = normalizeWords(shoot.title);
            const shootDateStr = shoot.start_time ? shoot.start_time.split('T')[0] : null;

            let jql = `project = VP AND issuetype = "Video Shoot Request"`;

            if (keywords.length > 0) {
                jql += ` AND (summary ~ "${keywords.slice(0, 3).join(' ')}" OR text ~ "${keywords.slice(0, 3).join(' ')}")`;
            }

            if (shootDateStr) {
                const sDate = new Date(shootDateStr);
                const dBefore = new Date(sDate.getTime() - 60 * 86400000).toISOString().split('T')[0];
                const dAfter = new Date(sDate.getTime() + 30 * 86400000).toISOString().split('T')[0];
                jql += ` AND created >= "${dBefore}" AND created <= "${dAfter}"`;
            }

            const candidates = await searchJiraJql(jql, 5);

            const scored = candidates.map(c => ({
                key: c.key,
                summary: c.fields?.summary,
                status: c.fields?.status?.name,
                reporter: c.fields?.reporter?.displayName || c.fields?.reporter?.name,
                created: c.fields?.created?.split('T')[0],
                score: scoreCandidate(shoot, shootCrew, c)
            })).sort((a, b) => b.score - a.score);

            const best = scored[0];

            if (best && best.score >= 50) {
                matchesFound.push({
                    shootNumber: shoot.shoot_number,
                    title: shoot.title,
                    date: shootDateStr || '-',
                    poc: shoot.poc_name || '-',
                    crew: shootCrew.slice(0, 2).join(', ') || '-',
                    matchedKey: best.key,
                    jiraSummary: best.summary,
                    jiraStatus: best.status,
                    confidence: `${best.score}%`
                });
            } else {
                internalOrNoMatch.push({
                    shootNumber: shoot.shoot_number,
                    title: shoot.title,
                    date: shootDateStr || '-',
                    poc: shoot.poc_name || '-',
                    crew: shootCrew.slice(0, 2).join(', ') || '-',
                    topCandidate: best ? `${best.key}: "${best.summary}" (${best.score}%)` : 'No Video Shoot Request'
                });
            }
        }));
    }

    // Sort results by shootNumber
    matchesFound.sort((a, b) => (a.shootNumber || 0) - (b.shootNumber || 0));
    internalOrNoMatch.sort((a, b) => (a.shootNumber || 0) - (b.shootNumber || 0));

    console.log(`=============================================================`);
    console.log(`TRUE "Video Shoot Request" MATCHES FOUND (${matchesFound.length} SHOOTS)`);
    console.log(`=============================================================`);
    console.table(matchesFound);

    console.log(`\n=============================================================`);
    console.log(`INTERNAL TASKS / UNTICKETED SHOOTS (${internalOrNoMatch.length} SHOOTS)`);
    console.log(`=============================================================`);
    console.table(internalOrNoMatch);
}

main();
