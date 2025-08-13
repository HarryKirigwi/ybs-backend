import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function debugCORS() {
  console.log('🔍 Debugging CORS Configuration...\n');

  try {
    // Test 1: Check if backend is running
    console.log('1. Testing backend connectivity...');
    const healthResponse = await fetch(`${BACKEND_URL}/health`);
    
    if (healthResponse.ok) {
      console.log('✅ Backend is running');
    } else {
      console.log('❌ Backend is not responding properly');
      return;
    }

    // Test 2: Test admin login endpoint
    console.log('\n2. Testing admin login endpoint...');
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        email: 'admin@yourplatform.com',
        password: 'admin123',
      }),
    });

    console.log('Login response status:', loginResponse.status);
    console.log('Login response headers:', Object.fromEntries(loginResponse.headers.entries()));

    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      console.log('✅ Admin login successful');
      console.log('Response data:', JSON.stringify(loginData, null, 2));
    } else {
      const errorData = await loginResponse.text();
      console.log('❌ Admin login failed');
      console.log('Error response:', errorData);
    }

    // Test 3: Test with different origins
    console.log('\n3. Testing different origins...');
    const origins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://ybslimited.co.ke',
      'http://127.0.0.1:3000',
    ];

    for (const origin of origins) {
      console.log(`Testing origin: ${origin}`);
      try {
        const testResponse = await fetch(`${BACKEND_URL}/api/auth/admin/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': origin,
          },
          body: JSON.stringify({
            email: 'admin@yourplatform.com',
            password: 'admin123',
          }),
        });

        console.log(`  Status: ${testResponse.status}`);
        console.log(`  CORS headers: ${testResponse.headers.get('access-control-allow-origin') || 'None'}`);
      } catch (error) {
        console.log(`  Error: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

// Run the debug
debugCORS();


