import { defineConfig, devices } from '@playwright/test';

// End-to-end rondgang door de app met nepdata (MOCK_API=1), zonder Firebase (demo-modus).
export default defineConfig({
	testDir: 'tests',
	timeout: 60000,
	retries: 0,
	use: {
		baseURL: 'http://127.0.0.1:5199',
		...devices['iPhone 13'],
		locale: 'nl-NL',
		timezoneId: 'Europe/Amsterdam',
		geolocation: { latitude: 52.0907, longitude: 5.1214 },
		permissions: ['geolocation'],
		launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
	},
	projects: [{ name: 'mobiel', use: { browserName: 'chromium' } }],
	webServer: {
		command: 'npx vite dev --port 5199 --host 127.0.0.1',
		url: 'http://127.0.0.1:5199',
		reuseExistingServer: false,
		timeout: 120000,
		env: { MOCK_API: '1' }
	}
});
