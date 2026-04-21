const Redis = require('ioredis');
require('dotenv').config({ path: '.env' });

async function testConnection() {
  const url = process.env.REDIS_URL;
  console.log('Testing connection to:', url ? url.split('@')[1] : 'UNDEFINED');
  
  if (!url) {
    console.error('ERROR: REDIS_URL not found in .env');
    return;
  }

  const client = new Redis(url, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 0,
    // family: 4 // Force IPv4
  });

  try {
    console.log('Connecting...');
    await client.ping();
    console.log('✅ SUCCESS: Redis is reachable and password is correct!');
  } catch (err) {
    console.error('❌ FAILURE:', err.message);
    if (err.message.includes('ENOTFOUND')) {
      console.log('Suggestion: DNS issue. Try using the IP address directly.');
    } else if (err.message.includes('ECONNREFUSED')) {
      console.log('Suggestion: Port is blocked or Redis is down.');
    } else if (err.message.includes('AUTH')) {
      console.log('Suggestion: Password is incorrect.');
    }
  } finally {
    client.disconnect();
  }
}

testConnection();
