/**
 * TMix Education — API Performance Benchmark
 * 
 * Script đánh giá hiệu năng hệ thống bằng autocannon.
 * Chạy: node benchmark/load-test.js
 * 
 * Yêu cầu: Backend đang chạy tại http://localhost:8080
 */

const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

// ── Configuration ──
const BASE_URL = 'http://localhost:8080';
const DURATION = 10;        // seconds per test
const CONNECTIONS = 10;     // concurrent connections
const PIPELINE = 1;         // requests per connection

// Colors for console output
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// ── Test Scenarios ──
const scenarios = [
  {
    name: '1. Health Check (Public)',
    url: `${BASE_URL}/api/v1/introduction`,
    method: 'GET',
    description: 'Public endpoint - đo baseline latency',
  },
  {
    name: '2. Auth Login',
    url: `${BASE_URL}/api/v1/auth/login`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tmix.edu.vn', password: 'Admin@123' }),
    description: 'Login endpoint - bcrypt password hashing (CPU-heavy)',
  },
  {
    name: '3. Auth Login (Invalid)',
    url: `${BASE_URL}/api/v1/auth/login`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wrong@email.com', password: 'wrong' }),
    description: 'Failed login - đo thời gian xử lý lỗi',
  },
  {
    name: '4. TTS Voices (Public)',
    url: `${BASE_URL}/api/v1/tts/voices`,
    method: 'GET',
    description: 'TTS voice listing',
  },
  {
    name: '5. Advertisements (Public)',
    url: `${BASE_URL}/api/v1/advertisements`,
    method: 'GET',
    description: 'Public data listing - database read',
  },
];

// ── Run Benchmark ──
async function runSingleBenchmark(scenario) {
  return new Promise((resolve) => {
    const opts = {
      url: scenario.url,
      method: scenario.method || 'GET',
      duration: DURATION,
      connections: CONNECTIONS,
      pipelining: PIPELINE,
      headers: scenario.headers || {},
      body: scenario.body || undefined,
      // Don't throw on non-2xx (we want to measure error response times too)
    };

    const instance = autocannon(opts, (err, result) => {
      if (err) {
        resolve({ ...scenario, error: err.message });
        return;
      }
      resolve({
        name: scenario.name,
        description: scenario.description,
        result: {
          requests_total: result.requests.total,
          requests_avg: result.requests.average,
          throughput_avg: `${(result.throughput.average / 1024).toFixed(1)} KB/s`,
          latency_avg: `${result.latency.average} ms`,
          latency_p50: `${result.latency.p50} ms`,
          latency_p90: `${result.latency.p90} ms`,
          latency_p99: `${result.latency.p99} ms`,
          latency_max: `${result.latency.max} ms`,
          errors: result.errors,
          timeouts: result.timeouts,
          status_2xx: result['2xx'],
          status_non2xx: result.non2xx,
          duration: `${DURATION}s`,
          connections: CONNECTIONS,
        },
      });
    });
  });
}

async function main() {
  console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║     TMix Education — API Performance Benchmark          ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);
  console.log(`${c.dim}  Target:      ${BASE_URL}`);
  console.log(`  Duration:    ${DURATION}s per endpoint`);
  console.log(`  Connections: ${CONNECTIONS} concurrent`);
  console.log(`  Pipeline:    ${PIPELINE} req/connection${c.reset}\n`);

  const results = [];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`${c.yellow}▸ Running: ${scenario.name}${c.reset}`);
    console.log(`${c.dim}  ${scenario.description}${c.reset}`);

    const result = await runSingleBenchmark(scenario);
    results.push(result);

    if (result.error) {
      console.log(`${c.red}  ✗ Error: ${result.error}${c.reset}\n`);
    } else {
      const r = result.result;
      console.log(`${c.green}  ✓ Avg: ${r.latency_avg} | P90: ${r.latency_p90} | P99: ${r.latency_p99} | ${r.requests_avg} req/s${c.reset}`);
      if (r.errors > 0 || r.timeouts > 0) {
        console.log(`${c.red}  ⚠ Errors: ${r.errors}, Timeouts: ${r.timeouts}${c.reset}`);
      }
      console.log('');
    }

    // Small pause between tests
    if (i < scenarios.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // ── Generate Report ──
  console.log(`\n${c.bold}${c.cyan}═══════════════════ RESULTS SUMMARY ═══════════════════${c.reset}\n`);

  // Table header
  console.log(`${'Endpoint'.padEnd(30)} ${'Avg'.padStart(8)} ${'P50'.padStart(8)} ${'P90'.padStart(8)} ${'P99'.padStart(8)} ${'Max'.padStart(8)} ${'Req/s'.padStart(8)} ${'Errors'.padStart(7)}`);
  console.log('─'.repeat(95));

  for (const item of results) {
    if (item.error) {
      console.log(`${item.name.padEnd(30)} ${c.red}ERROR: ${item.error}${c.reset}`);
    } else {
      const r = item.result;
      const errColor = (r.errors > 0 || r.timeouts > 0) ? c.red : c.green;
      console.log(
        `${item.name.substring(0, 30).padEnd(30)} ` +
        `${r.latency_avg.padStart(8)} ` +
        `${r.latency_p50.padStart(8)} ` +
        `${r.latency_p90.padStart(8)} ` +
        `${r.latency_p99.padStart(8)} ` +
        `${r.latency_max.padStart(8)} ` +
        `${String(r.requests_avg).padStart(8)} ` +
        `${errColor}${String(r.errors + r.timeouts).padStart(7)}${c.reset}`
      );
    }
  }
  console.log('─'.repeat(95));

  // Save JSON report
  const reportDir = path.join(__dirname, '..', 'benchmark-results');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(reportDir, `benchmark-${timestamp}.json`);

  const report = {
    timestamp: new Date().toISOString(),
    config: { baseUrl: BASE_URL, duration: DURATION, connections: CONNECTIONS, pipeline: PIPELINE },
    system: { platform: process.platform, arch: process.arch, nodeVersion: process.version },
    results: results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n${c.green}📊 Report saved: ${reportPath}${c.reset}`);

  // Generate Markdown summary
  const mdPath = path.join(reportDir, `benchmark-${timestamp}.md`);
  let md = `# TMix Education — Performance Benchmark Report\n\n`;
  md += `**Date:** ${new Date().toLocaleString('vi-VN')}\n`;
  md += `**Target:** ${BASE_URL}\n`;
  md += `**Duration:** ${DURATION}s per endpoint | **Connections:** ${CONNECTIONS} concurrent\n`;
  md += `**Node.js:** ${process.version} | **Platform:** ${process.platform} ${process.arch}\n\n`;
  md += `## Results\n\n`;
  md += `| Endpoint | Avg Latency | P50 | P90 | P99 | Max | Req/s | Errors |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;

  for (const item of results) {
    if (!item.error) {
      const r = item.result;
      md += `| ${item.name} | ${r.latency_avg} | ${r.latency_p50} | ${r.latency_p90} | ${r.latency_p99} | ${r.latency_max} | ${r.requests_avg} | ${r.errors + r.timeouts} |\n`;
    }
  }

  md += `\n## Scenario Details\n\n`;
  for (const item of results) {
    if (!item.error) {
      md += `### ${item.name}\n`;
      md += `- **Description:** ${item.description}\n`;
      md += `- **Total requests:** ${item.result.requests_total}\n`;
      md += `- **Throughput:** ${item.result.throughput_avg}\n`;
      md += `- **2xx responses:** ${item.result.status_2xx}\n`;
      md += `- **Non-2xx responses:** ${item.result.status_non2xx}\n\n`;
    }
  }

  fs.writeFileSync(mdPath, md);
  console.log(`${c.green}📄 Markdown report: ${mdPath}${c.reset}\n`);
}

main().catch(console.error);
