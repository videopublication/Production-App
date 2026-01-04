
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testNotifications() {
    console.log('Testing notification fetch...')

    // 1. Get a user
    const { data: users, error: userError } = await supabase.from('users').select('id, name').limit(1)
    if (userError || !users?.length) {
        console.error('Error fetching users or no users found:', userError)
        return
    }

    const user = users[0]
    console.log(`Checking notifications for user: ${user.name} (${user.id})`)

    // 2. Fetch notifications
    const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)

    if (error) {
        console.error('Error fetching notifications:', error)
    } else {
        console.log(`Found ${notifications.length} notifications:`)
        console.log(notifications)
    }
}

testNotifications()
