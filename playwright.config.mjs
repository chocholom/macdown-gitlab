import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome=process.env.MACDOWN_CHROME || (process.platform==='darwin' && existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
export default defineConfig({
  testDir:'tests/ui',outputDir:'test-results/browser',timeout:30000,workers:1,reporter:'list',
  use:{baseURL:'http://127.0.0.1:8765',headless:true,viewport:{width:1280,height:900},
    launchOptions:chrome ? {executablePath:chrome} : {}},
  webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:8765',reuseExistingServer:!process.env.CI}
});
