require('dotenv').config({ path: '.env.local' });
console.log('DATABASE_URL from env:', process.env.DATABASE_URL || 'NOT SET');
