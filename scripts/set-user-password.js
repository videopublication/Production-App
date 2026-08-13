const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const supabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function setPassword(email, newPassword) {
    console.log(`🔑 Setting password for user [${email}]...`);

    const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
        console.error('Error listing users:', listErr);
        return;
    }

    const user = usersData.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
        console.error(`User with email ${email} not found in auth.users!`);
        return;
    }

    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        password: newPassword,
        email_confirm: true
    });

    if (error) {
        console.error('Error setting password:', error.message);
    } else {
        console.log(`✅ Password successfully updated for ${email}!`);
    }
}

// Get arguments from CLI or default to ak4440204@gmail.com
const targetEmail = process.argv[2] || 'ak4440204@gmail.com';
const targetPassword = process.argv[3] || 'Password123!';

setPassword(targetEmail, targetPassword);
