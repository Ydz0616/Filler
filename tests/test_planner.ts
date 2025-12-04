// tests/test_planner.ts
import { chromium } from 'playwright';
import { distillPage } from '../src/browser/distiller';
import { generatePlan } from '../src/agents/planner'; // 确保路径是 agent 不是 agents
import { UserProfile } from '../src/types';
import path from 'path';
import fs from 'fs';

// --- 读取真实的 Profile ---
function loadRealProfile(): UserProfile {
    const profilePath = path.resolve(__dirname, '../profile.json');
    if (!fs.existsSync(profilePath)) {
        console.error(`❌ Error: profile.json not found at ${profilePath}`);
        console.error("Please create profile.json in the root directory first.");
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as UserProfile;
}

async function runTest() {
    console.log("🚀 Starting Planner Test (Real Data Mode)...");
    
    // 1. 加载用户数据
    const profile = loadRealProfile();
    console.log(`👤 User: ${profile.basics.firstName} ${profile.basics.lastName}`);
    console.log(`📄 Resume: ${profile.resume_path ? 'Yes' : 'No'}`);
    console.log(`📄 Cover Letter Path: ${profile.cover_letter_path ? profile.cover_letter_path : 'Not Set'}`);
    console.log(`📝 Cover Letter Text: ${profile.cover_letter_text ? 'Yes (Length: ' + profile.cover_letter_text.length + ')' : 'Not Set'}`);

    // 2. 获取 HTML (复用 Distiller)
    console.log("\n🌐 Launching Browser to fetch DOM...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // 你的目标 URL
    const targetUrl = "https://job-boards.greenhouse.io/andurilindustries/jobs/4829829007?gh_jid=4829829007"; 
    
    console.log(`   Target: ${targetUrl}`);
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');
    
    const { html } = await page.evaluate(distillPage);
    console.log(`✅ Distilled HTML (${html.length} chars).`);
    await browser.close();

    // 3. 调用 Planner
    console.log("\n🧠 Sending to GPT-4o for Planning...");
    try {
        const plan = await generatePlan(html, profile);
        
        console.log("\n================ AGENT PLAN REPORT ================");
        console.log("📝 Page Analysis:", plan.page_analysis);
        console.log("\n👇 Actions Generated:");
        
        // 打印表格
        console.table(plan.actions.map(a => ({
            id: a.id,
            label: a.label.substring(0, 25), // 稍微加长一点以便看清 Label
            type: a.type,
            value: a.value.substring(0, 30),
            reasoning: a.reasoning.substring(0, 50) + "..."
        })));

        // --- 验证逻辑 ---
        
        // 1. 验证名字是否填对
        const nameAction = plan.actions.find(a => a.value === profile.basics.firstName);
        if (nameAction) {
            console.log(`\n✅ SUCCESS: Found First Name action -> ${nameAction.value}`);
        } else {
            console.error(`\n❌ FAIL: Did not find action filling '${profile.basics.firstName}'.`);
        }

        // 2. 验证 Resume
        const resumeAction = plan.actions.find(a => a.value === profile.resume_path);
        if (resumeAction) {
             console.log(`✅ SUCCESS: Found Resume Upload -> ${resumeAction.id}`);
        }

        const clAction = plan.actions.find(a => a.value === profile.cover_letter_path);
        if (clAction) {
             console.log(`✅ SUCCESS: Found Cover Letter Upload -> ${clAction.id}`);
        }


        if (clAction) {
            console.log(`\n🎉 SUCCESS: Cover Letter Identified!`);
            console.log(`   - Type: ${clAction.type}`);
            console.log(`   - Label: ${clAction.label}`);
            console.log(`   - Value: ${clAction.value}`);
            console.log(`   - Reasoning: ${clAction.reasoning}`);
        } else {
            console.warn(`\n⚠️ WARNING: No Cover Letter action found.`);
            console.log("   Possible reasons:");
            console.log("   1. 'cover_letter_path' is empty in profile.json");
            console.log("   2. Distiller did not capture the input correctly (Check 'sme-14' in debug log)");
            console.log("   3. LLM decided to skip it (Check Prompt logic)");
        }

    } catch (e) {
        console.error("Error in Planner:", e);
    }
}

runTest();