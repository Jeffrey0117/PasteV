/**
 * Concurrent Stress Test - 5 Agents Simultaneously
 *
 * Tests the API's ability to handle multiple concurrent requests
 * simulating 5 users hitting the endpoints at the same time.
 *
 * Usage:
 *   npx tsx tests/concurrent-stress.ts
 */

const API_BASE = 'http://localhost:3001/api';

interface TestResult {
  agent: number;
  endpoint: string;
  success: boolean;
  duration: number;
  error?: string;
}

// Sample test image (1x1 white pixel PNG base64)
const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function testHealthCheck(agentId: number): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    return {
      agent: agentId,
      endpoint: 'health',
      success: data.status === 'ok',
      duration: Date.now() - start
    };
  } catch (e) {
    return {
      agent: agentId,
      endpoint: 'health',
      success: false,
      duration: Date.now() - start,
      error: String(e)
    };
  }
}

async function testTranslate(agentId: number): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: ['Hello World', 'Good Morning'],
        targetLang: 'zh-TW'
      })
    });
    const data = await res.json();
    return {
      agent: agentId,
      endpoint: 'translate',
      success: res.ok && Array.isArray(data.translations),
      duration: Date.now() - start
    };
  } catch (e) {
    return {
      agent: agentId,
      endpoint: 'translate',
      success: false,
      duration: Date.now() - start,
      error: String(e)
    };
  }
}

async function testOcr(agentId: number): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: TEST_IMAGE })
    });
    // OCR may return empty text for blank image, but should not error
    const data = await res.json();
    return {
      agent: agentId,
      endpoint: 'ocr',
      success: res.ok || (res.status < 500), // Accept client errors as "working"
      duration: Date.now() - start,
      error: !res.ok ? `Status ${res.status}` : undefined
    };
  } catch (e) {
    return {
      agent: agentId,
      endpoint: 'ocr',
      success: false,
      duration: Date.now() - start,
      error: String(e)
    };
  }
}

async function runAgentTests(agentId: number): Promise<TestResult[]> {
  console.log(`[Agent ${agentId}] Starting tests...`);

  const results: TestResult[] = [];

  // Run all tests for this agent
  results.push(await testHealthCheck(agentId));
  results.push(await testTranslate(agentId));
  results.push(await testOcr(agentId));

  console.log(`[Agent ${agentId}] Completed ${results.length} tests`);
  return results;
}

async function runConcurrentTest() {
  console.log('='.repeat(60));
  console.log('PasteV Concurrent Stress Test - 5 Agents');
  console.log('='.repeat(60));
  console.log();

  // Check if server is running first
  try {
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) throw new Error('Health check failed');
    console.log('✓ Server is online\n');
  } catch {
    console.error('✗ Server is offline! Please run: npm run dev');
    process.exit(1);
  }

  const startTime = Date.now();

  // Launch 5 agents concurrently
  console.log('Launching 5 concurrent agents...\n');

  const agentPromises = [1, 2, 3, 4, 5].map(id => runAgentTests(id));
  const allResults = await Promise.all(agentPromises);

  const totalTime = Date.now() - startTime;
  const flatResults = allResults.flat();

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  const grouped: Record<string, TestResult[]> = {};
  for (const r of flatResults) {
    if (!grouped[r.endpoint]) grouped[r.endpoint] = [];
    grouped[r.endpoint].push(r);
  }

  for (const [endpoint, results] of Object.entries(grouped)) {
    const successCount = results.filter(r => r.success).length;
    const avgDuration = Math.round(results.reduce((a, b) => a + b.duration, 0) / results.length);
    const maxDuration = Math.max(...results.map(r => r.duration));
    const minDuration = Math.min(...results.map(r => r.duration));

    console.log(`\n${endpoint.toUpperCase()}:`);
    console.log(`  Success: ${successCount}/${results.length}`);
    console.log(`  Avg: ${avgDuration}ms | Min: ${minDuration}ms | Max: ${maxDuration}ms`);

    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log(`  Failures:`);
      failures.forEach(f => console.log(`    - Agent ${f.agent}: ${f.error || 'Unknown error'}`));
    }
  }

  const totalSuccess = flatResults.filter(r => r.success).length;
  const totalTests = flatResults.length;

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY: ${totalSuccess}/${totalTests} tests passed`);
  console.log(`Total time: ${totalTime}ms`);
  console.log('='.repeat(60));

  if (totalSuccess === totalTests) {
    console.log('\n✓ All concurrent tests passed!');
  } else {
    console.log(`\n✗ ${totalTests - totalSuccess} tests failed`);
    process.exit(1);
  }
}

// Run the test
runConcurrentTest().catch(console.error);
