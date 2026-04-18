import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[Browser Console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[Browser Error]', err.message));

  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');
  console.log("Loaded!");

  await page.locator('.tiptap').click();
  await page.locator('.tiptap').type('/代码');
  await page.waitForTimeout(500);
  await page.locator('.tiptap').press('Enter');
  
  await page.waitForTimeout(500);
  await page.locator('.tiptap').type('hello world');
  await page.waitForTimeout(1000);
  
  const html = await page.locator('.tiptap').innerHTML();
  console.log("Editor HTML:");
  console.log(html);

  await browser.close();
})();
