
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

    // 1. Fetch Issue Details
    const issueResponse = await fetch(`https://${domain}/rest/api/2/issue/${ticketId}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    })

    if (!issueResponse.ok) {
        const errText = await issueResponse.text()
        console.error('Jira Issue API Error:', issueResponse.status, errText)
        return new Response(JSON.stringify({ error: `Jira Error: ${issueResponse.statusText}`, details: errText }), {
            status: issueResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const issueData = await issueResponse.json()

    // 2. Fetch Field Definitions to map "Event Venue" -> "customfield_12345"
    // We do this dynamically so we don't have to hardcode IDs
    const fieldsResponse = await fetch(`https://${domain}/rest/api/2/field`, {
        method: 'GET',
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
        },
    })

    let customFieldsMap: Record<string, string> = {};
    if (fieldsResponse.ok) {
        const fields = await fieldsResponse.json();
        // Map names we care about to their IDs
        const targets = [
            "Event Venue", 
            "contact number", 
            "name", 
            "Event Start Date & Time",
            "Event End Date & Time",
            "Event Location",
            "VP_Director of Photography"
        ];

        fields.forEach((f: any) => {
            const lowerName = f.name.toLowerCase();
            if (targets.some(t => lowerName === t.toLowerCase())) {
                customFieldsMap[lowerName] = f.id;
            }
        });
        console.log('Mapped Fields:', customFieldsMap);
    }

    // Helper to get value from map
    const getFieldVal = (name: string) => {
        const id = customFieldsMap[name.toLowerCase()];
        if (id && issueData.fields[id]) return issueData.fields[id];
        return null;
    };

    console.log('Jira fetch successful')

    // Simplify the response for the frontend
    const result = {
      id: issueData.key,
      title: issueData.fields.summary,
      description: extractDescription(issueData.fields.description),
      status: issueData.fields.status?.name,
      priority: issueData.fields.priority?.name,
      assignee: issueData.fields.assignee?.displayName,
      
      // Mapped Custom Fields
      location: getFieldVal("Event Venue") || getFieldVal("Event Location"),
      pocName: getFieldVal("Name"),
      pocContact: getFieldVal("Contact Number"),
      startTime: getFieldVal("Event Start Date & Time"),
      endTime: getFieldVal("Event End Date & Time"),
      crewString: getFieldVal("VP_Director of Photography"), // New field

      // DEBUG: Return the map so we can see what was found
      debug_map: customFieldsMap
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
