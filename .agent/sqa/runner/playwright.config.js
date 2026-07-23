const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

// Point the whole suite at the app under test. Local by default; override to
// test the deployed site:  SQA_BASE_URL=https://keusmaina-crm.vercel.app npm run sqa
const BASE_URL = process.env.SQA_BASE_URL || 'http://localhost:5173';

const resultsDir = path.join(__dirname, '..', 'results');

module.exports = defineConfig({
  testDir: './tests',
  outputDir: path.join(resultsDir, 'artifacts'),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // Test FILES run in parallel, but tests WITHIN a file run in order so specs
  // that build state step-by-step (finance: payment → refund → verify;
  // departures: create → read) stay correct.
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(resultsDir, 'report-html'), open: 'never' }],
    ['json', { outputFile: path.join(resultsDir, 'report.json') }],
  ],
  use: {
    baseURL: BASE_URL,
    // PROOF: a screenshot is captured automatically whenever a check fails.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
