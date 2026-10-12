const {chromium}=await import('playwright').catch(()=>import(process.env.MB_PLAYWRIGHT_MODULE||'file:///C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
const phase=process.argv[2]||'before',dir=`outputs/demo-polish/${phase}`;mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});
 if(existsSync('outputs/demo-catalog-local.json'))await page.route('**/api/productos',route=>route.fulfill({json:JSON.parse(readFileSync('outputs/demo-catalog-local.json','utf8').replace(/^\uFEFF/,''))}));
 await page.goto('http://localhost:3000/');await page.evaluate(()=>document.fonts.ready);await page.locator('.catalog-card').first().waitFor();
 await page.screenshot({path:`${dir}/hero-${width}.png`});
 await page.locator('.catalog-home').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('.catalog-home img')].every(img=>img.complete),{},{timeout:15000}).catch(()=>{});
 await page.screenshot({path:`${dir}/cards-${width}.png`});
 await page.locator('.matebreak-transition').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/transition-${width}.png`});
 await page.close();
}}finally{await browser.close();}
