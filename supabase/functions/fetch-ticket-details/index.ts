
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ticketId } = await req.json()

    if (!ticketId) {
      throw new Error('Ticket ID is required')
    }

    const email = Deno.env.get('JIRA_USER_EMAIL')
    const token = Deno.env.get('JIRA_API_TOKEN')
    const domain = Deno.env.get('JIRA_DOMAIN') || 'servicedesk.isha.in'

    if (!token) {
      console.error('Missing Jira Credentials')
      throw new Error('Server configuration error: Missing credentials')
    }

    let authHeader;
    if (email) {
       // Jira Cloud or Server with Basic Auth
       const auth = btoa(`${email}:${token}`)
       authHeader = `Basic ${auth}`
    } else {
       // Jira Server with PAT (Personal Access Token)
       // If no email is provided, we assume the token is a PAT
       authHeader = `Bearer ${token}`
    }

    console.log(`Fetching ticket ${ticketId} from ${domain}...`)

    const response = await fetch(`https://${domain}/rest/api/2/issue/${ticketId}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
        const errText = await response.text()
        console.error('Jira API Error:', response.status, errText)
        return new Response(JSON.stringify({ error: `Jira Error: ${response.statusText}`, details: errText }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const data = await response.json()
    console.log('Jira fetch successful')

    // Simplify the response for the frontend
    const result = {
      id: data.key,
      title: data.fields.summary,
      description: extractDescription(data.fields.description),
      status: data.fields.status?.name,
      priority: data.fields.priority?.name,
      assignee: data.fields.assignee?.displayName
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// Helper to extract text from Jira's "Atlassian Document Format" (ADF)
function extractDescription(desc: any): string {
    if (!desc) return '';
    if (typeof desc === 'string') return desc; // In case it's plain text (older implementations)
    
    // Very basic ADF parser - just gets the first paragraph's text
    // A full parser would be recursive
    try {
        if (desc.content && Array.isArray(desc.content)) {
            let text = '';
            for (const node of desc.content) {
                if (node.type === 'paragraph' && node.content) {
                     for (const textNode of node.content) {
                         if (textNode.type === 'text') {
                             text += textNode.text + '\n';
                         }
                     }
                }
            }
            return text.trim();
        }
    } catch (e) {
        console.error('Error parsing description', e);
    }
    return '';
}
