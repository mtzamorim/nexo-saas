import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'] },
  webServer: [
    { command: 'npm run dev:api', url: 'http://127.0.0.1:4010/api/health', reuseExistingServer: false, timeout: 90000 },
    { command: 'npm run dev:web', url: 'http://127.0.0.1:5175', reuseExistingServer: false, timeout: 90000 },
  ],
});
