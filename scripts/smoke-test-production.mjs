import http from 'node:http';
import https from 'node:https';

const args = process.argv.slice(2);
let targetUrl = 'http://localhost:3000';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) {
    targetUrl = args[i + 1].replace(/\/$/, '');
    i++;
  }
}

console.log(`\n🔍 Running CampusVoice Production Smoke Tests against: ${targetUrl}\n`);

async function fetchUrl(endpoint) {
  const url = `${targetUrl}${endpoint}`;
  const isHttps = url.startsWith('https://');
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

async function runSmokeTests() {
  const results = [];

  // Test 1: Health check
  try {
    const res = await fetchUrl('/api/health');
    const isOk = res.status === 200;
    let json = {};
    try {
      json = JSON.parse(res.body);
    } catch {
      // ignore
    }
    results.push({
      name: 'API Health Check (/api/health)',
      status: isOk && json.status === 'ok' ? 'PASS' : 'FAIL',
      details: `Status ${res.status}, body: ${res.body.trim()}`,
    });
  } catch (err) {
    results.push({
      name: 'API Health Check (/api/health)',
      status: 'FAIL',
      details: err.message,
    });
  }

  // Test 2: Root landing page
  try {
    const res = await fetchUrl('/');
    const isOk = res.status === 200;
    results.push({
      name: 'Landing Page (/)',
      status: isOk ? 'PASS' : 'FAIL',
      details: `Status ${res.status}`,
    });
  } catch (err) {
    results.push({
      name: 'Landing Page (/)',
      status: 'FAIL',
      details: err.message,
    });
  }

  // Test 3: Sign-in route
  try {
    const res = await fetchUrl('/sign-in');
    const isOk = res.status === 200;
    results.push({
      name: 'Sign-In Route (/sign-in)',
      status: isOk ? 'PASS' : 'FAIL',
      details: `Status ${res.status}`,
    });
  } catch (err) {
    results.push({
      name: 'Sign-In Route (/sign-in)',
      status: 'FAIL',
      details: err.message,
    });
  }

  // Test 4: Security headers (on Vercel / production)
  try {
    const res = await fetchUrl('/');
    const hasContentType = res.headers['x-content-type-options'] === 'nosniff';
    const hasFrameOptions = res.headers['x-frame-options'] === 'DENY';
    const hasSecHeaders = hasContentType && hasFrameOptions;

    results.push({
      name: 'HTTP Security Headers',
      status: hasSecHeaders ? 'PASS' : 'INFO',
      details: `nosniff=${res.headers['x-content-type-options']}, frame-options=${res.headers['x-frame-options']}`,
    });
  } catch (err) {
    results.push({
      name: 'HTTP Security Headers',
      status: 'INFO',
      details: err.message,
    });
  }

  console.table(results);

  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length > 0) {
    console.error(`\n❌ ${failed.length} smoke test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\n✅ All smoke checks passed successfully!\n');
  }
}

runSmokeTests();
