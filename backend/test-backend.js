#!/usr/bin/env node

// Simple test script to verify backend endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testBackend() {
  console.log('🧪 Testing backend endpoints...\n');

  try {
    // Test basic connectivity
    console.log('1. Testing basic connectivity...');
    const healthRes = await axios.get(`${BASE_URL}/api/total-accounts`);
    console.log(`✅ Backend is running. Total accounts: ${healthRes.data.total}\n`);

    // Test admin login (you'll need to set your credentials)
    console.log('2. Testing admin login...');
    const loginRes = await axios.post(`${BASE_URL}/api/admin/login`, {
      username: process.env.ADMIN_USER || 'admin',
      password: process.env.ADMIN_PASS || 'password'
    });
    
    const token = loginRes.data.token;
    console.log('✅ Admin login successful\n');

    // Test ES indices endpoint
    console.log('3. Testing ES indices endpoint...');
    const indicesRes = await axios.get(`${BASE_URL}/api/admin/es/indices`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ ES indices fetched: ${indicesRes.data.indices.length} indices found\n`);

    // Test ES health endpoint
    console.log('4. Testing ES health endpoint...');
    const esHealthRes = await axios.get(`${BASE_URL}/api/admin/es/health`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ ES health fetched: Status ${esHealthRes.data.cluster.status}\n`);

    // Test config endpoint
    console.log('5. Testing config endpoint...');
    const configRes = await axios.get(`${BASE_URL}/api/admin/config`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ Config fetched: Selected index is ${configRes.data.selectedIndex}\n`);

    console.log('🎉 All backend endpoints are working correctly!');

  } catch (error) {
    console.error('❌ Backend test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testBackend();
