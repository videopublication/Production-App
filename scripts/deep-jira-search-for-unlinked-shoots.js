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

function searchJiraJql(jql, maxResults = 8) {
    return new Promise((resolve) => {
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,created,reporter,description&maxResults=${maxResults}`;
        
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
    console.log('Fetching 97 unlinked confirmed shoots, assignments, and user names...');

    const [{ data: shoots }, { data: assignments }, { data: users }] = await Promise.all([
        supabase.from('shoots').select('*').eq('status', 'CONFIRMED').is('jira_ticket_id', null).order('shoot_number', { ascending: true }),
        supabase.from('assignments').select('*'),
        supabase.from('users').select('id, name, email')
    ]);

    const userMap = new Map(users.map(u => [u.id, u.name || u.email]));
    console.log(`Loaded ${shoots.length} shoots.\n`);

    const matchesFound = [];
    const uncertainOrNoMatch = [];

    for (let i = 0; i < shoots.length; i++) {
        const shoot = shoots[i];
        if (shoot.shoot_number === 1171) continue;

        const shootCrew = assignments.filter(a => a.shootId === shoot.id).map(a => userMap.get(a.userId)).filter(Boolean);
        const keywords = normalizeWords(shoot.title);
        const shootDateStr = shoot.start_time ? shoot.start_time.split('T')[0] : null;

        let jqlQueries = [];

        // Query Strategy A: Title keywords + Date Range
        if (keywords.length > 0) {
            let qA = `project in (VP) AND (summary ~ "${keywords.slice(0, 3).join(' ')}" OR text ~ "${keywords.slice(0, 3).join(' ')}")`;
            if (shootDateStr) {
                const sDate = new Date(shootDateStr);
                const dBefore = new Date(sDate.getTime() - 60 * 86400000).toISOString().split('T')[0];
                const dAfter = new Date(sDate.getTime() + 30 * 86400000).toISOString().split('T')[0];
                qA += ` AND created >= "${dBefore}" AND created <= "${dAfter}"`;
            }
            jqlQueries.push(qA);
        }

        // Query Strategy B: POC Name + Date Range
        if (shoot.poc_name && shoot.poc_name.trim().length >= 3 && shootDateStr) {
            const sDate = new Date(shootDateStr);
            const dBefore = new Date(sDate.getTime() - 60 * 86400000).toISOString().split('T')[0];
            const dAfter = new Date(sDate.getTime() + 30 * 86400000).toISOString().split('T')[0];
            const pocClean = shoot.poc_name.replace(/[^a-zA-Z0-9]/g, ' ').trim();
            jqlQueries.push(`project in (VP) AND (reporter in ("${pocClean}") OR text ~ "${pocClean}") AND created >= "${dBefore}" AND created <= "${dAfter}"`);
        }

        const candidateMap = new Map();
        for (const jql of jqlQueries) {
            const issues = await searchJiraJql(jql, 5);
            issues.forEach(iss => candidateMap.set(iss.key, iss));
        }

        const candidates = Array.from(candidateMap.values());
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
            uncertainOrNoMatch.push({
                shootNumber: shoot.shoot_number,
                title: shoot.title,
                date: shootDateStr || '-',
                poc: shoot.poc_name || '-',
                crew: shootCrew.slice(0, 2).join(', ') || '-',
                topCandidate: best ? `${best.key}: "${best.summary}" (${best.score}%)` : 'None'
            });
        }
    }

    console.log(`\n=============================================================`);
    console.log(`CONFIDENT JIRA MATCHES FOUND (${matchesFound.length} SHOOTS)`);
    console.log(`=============================================================`);
    console.table(matchesFound);

    console.log(`\n=============================================================`);
    console.log(`REMAINING SHOOTS / INTERNAL ACTIVITIES (${uncertainOrNoMatch.length} SHOOTS)`);
    console.log(`=============================================================`);
    console.table(uncertainOrNoMatch.slice(0, 30));
}

main();
