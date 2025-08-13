import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const ADMIN_EMAIL = 'admin@yourplatform.com';
const ADMIN_PASSWORD = 'admin123';

async function testAdminConnection() {
  console.log('🧪 Testing Admin Dashboard Connection...\n');

  try {
    // Step 1: Test admin login
    console.log('1. Testing admin login...');
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    console.log('✅ Admin login successful');
    console.log(`   Admin ID: ${loginData.data.admin.id}`);
    console.log(`   Role: ${loginData.data.admin.role}`);
    console.log(`   Token received: ${loginData.data.token ? 'Yes' : 'No'}\n`);

    const token = loginData.data.token;

    // Step 2: Test admin auth verification
    console.log('2. Testing admin auth verification...');
    const verifyResponse = await fetch(`${BACKEND_URL}/api/auth/admin/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!verifyResponse.ok) {
      throw new Error(`Auth verification failed: ${verifyResponse.status} ${verifyResponse.statusText}`);
    }

    const verifyData = await verifyResponse.json();
    console.log('✅ Admin auth verification successful');
    console.log(`   Admin authenticated: ${verifyData.data.authenticated}`);
    console.log(`   Permissions: ${verifyData.data.admin.permissions.length} permissions\n`);

    // Step 3: Test dashboard endpoint
    console.log('3. Testing dashboard endpoint...');
    const dashboardResponse = await fetch(`${BACKEND_URL}/api/admin/dashboard`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!dashboardResponse.ok) {
      throw new Error(`Dashboard fetch failed: ${dashboardResponse.status} ${dashboardResponse.statusText}`);
    }

    const dashboardData = await dashboardResponse.json();
    console.log('✅ Dashboard data retrieved successfully');
    console.log(`   Total users: ${dashboardData.data.stats.users.total}`);
    console.log(`   Active users: ${dashboardData.data.stats.users.active}`);
    console.log(`   Total revenue: KSH ${dashboardData.data.stats.financials.totalRevenue}`);
    console.log(`   Total payouts: KSH ${dashboardData.data.stats.financials.totalPayouts}`);
    console.log(`   Recent users: ${dashboardData.data.recentActivity.users.length}`);
    console.log(`   Recent withdrawals: ${dashboardData.data.recentActivity.withdrawals.length}\n`);

    // Step 4: Test admin logout
    console.log('4. Testing admin logout...');
    const logoutResponse = await fetch(`${BACKEND_URL}/api/auth/admin/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!logoutResponse.ok) {
      throw new Error(`Logout failed: ${logoutResponse.status} ${logoutResponse.statusText}`);
    }

    const logoutData = await logoutResponse.json();
    console.log('✅ Admin logout successful\n');

    console.log('🎉 All admin dashboard tests passed!');
    console.log('The backend is ready to connect with the frontend admin dashboard.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nTroubleshooting tips:');
    console.log('1. Make sure the backend server is running on port 5000');
    console.log('2. Check that the database is connected and seeded');
    console.log('3. Verify environment variables are set correctly');
    console.log('4. Ensure the admin user exists in the database');
  }
}

// Run the test
testAdminConnection();



