// tests/test_distiller.ts
import { chromium } from 'playwright';
import { distillPage } from '../src/browser/distiller';

async function runTest() {
    console.log("🚀 Launching browser...");
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    // OpenAI Greenhouse Page
    const targetUrl = 'https://job-boards.greenhouse.io/andurilindustries/jobs/4829829007?gh_jid=4829829007'; 
    
    console.log(`🌐 Navigating to ${targetUrl}...`);
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');

    console.log("💉 Injecting Distiller...");
    
    // 获取结果对象
    const result = await page.evaluate(distillPage);

    console.log("\n================ HTML SNAPSHOT (First 500 chars) ================");
    console.log(result.html.substring(0, 500) + "...");
    console.log(`Total HTML Size: ${result.html.length} chars`);
    
    console.log("\n================ SEMANTIC DEBUG REPORT ================");
    // 这里使用 console.table，非常直观
    console.table(result.summary);

    // 简单的校验逻辑
    const missingLabels = result.summary.filter(i => i.question === "" || i.question === "N/A");
    if (missingLabels.length > 0) {
        console.warn(`⚠️ Warning: ${missingLabels.length} fields have no detected label.`);
    }

    const comboboxes = result.summary.filter(i => i.type.includes('combobox'));
    console.log(`\n🔍 Analysis: Found ${comboboxes.length} dropdowns.`);
    comboboxes.forEach(c => {
        if (c.optionStatus.includes('Runtime Fetch')) {
            console.log(`   - ID ${c.id}: Options are lazy-loaded (OK for Executor, Invisible to Snapshot).`);
        }
    });

    console.log("\nBrowser will close in 30 seconds...");
    await page.waitForTimeout(30000); 
    await browser.close();
}

runTest().catch(console.error);