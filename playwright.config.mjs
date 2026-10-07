import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',testMatch:'*.spec.mjs',timeout:90000,workers:1,
  use:{baseURL:'http://127.0.0.1:5173',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']},screenshot:'only-on-failure'},
  webServer:[
    {command:'node tests/e2e/server.mjs',url:'http://127.0.0.1:5001/health'},
    {command:'npm run dev -- --host 127.0.0.1',url:'http://127.0.0.1:5173',env:{VITE_USE_EMULATORS:'true',VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_PROJECT_ID:'demo-nested-boards',VITE_FIREBASE_AUTH_DOMAIN:'demo-nested-boards.firebaseapp.com',VITE_FIREBASE_APP_ID:'demo-app'}}
  ]
});
