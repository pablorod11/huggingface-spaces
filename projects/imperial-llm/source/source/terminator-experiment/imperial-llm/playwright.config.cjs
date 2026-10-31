const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests/browser', timeout:60000, expect:{timeout:15000}, workers:1,
  forbidOnly:!!process.env.CI, retries:process.env.CI?1:0,
  outputDir:process.env.VISUAL==='1'?'test-results-visual':'test-results',
  reporter:[['list'],['html',{open:'never',outputFolder:process.env.PLAYWRIGHT_HTML_OUTPUT_DIR||(process.env.VISUAL==='1'?'playwright-report-visual':'playwright-report')}]],
  use:{baseURL:process.env.SPACE_URL||'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:process.env.SPACE_URL?undefined:{command:'python3 -m http.server 4173 --bind 127.0.0.1 --directory space',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,stderr:'ignore'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'firefox',use:{...devices['Desktop Firefox']}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'phone',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
  ]
});
