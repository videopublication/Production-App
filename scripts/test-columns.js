const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCols() {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error) {
        console.error('Error selecting users:', error);
    } else {
        console.log('User sample keys:', Object.keys(data[0] || {}));
    }
}

testCols();
