// tests/test_planner.ts
import { chromium } from 'playwright';
import { distillPage } from '../src/browser/distiller';
import { generatePlan } from '../src/agents/planner';
import { UserProfile } from '../src/types';
import path from 'path';

// --- 模拟一个你的真实 Profile ---
const MOCK_PROFILE: UserProfile = {
    basics: {
        firstName: "Yuandong",
        lastName: "Zhang",
        email: "san.zhang@gmail.com",
        phone: "123-456-7890",
        website: "https://sanzhang.dev",
        linkedin: "https://linkedin.com/in/sanzhang"
    },
    education: [{
        school: "University of California, San Diego",
        degree: "Master of Science",
        major: "Computer Science",
        startDate: "2023",
        endDate: "2025"
    }],
    experience: [],
    legal: {
        authorized_to_work: true,
        sponsorship_needed: true, // F1 学生通常选这个
        veteran_status: "I am not a protected veteran",
        disability_status: "I do not have a disability",
        gender: "Male",
        race: "Asian"
    },
    resume_path: path.resolve(__dirname, "../resume.pdf") // 假装有个文件
};

async function runTest() {
    console.log("🚀 Starting Planner Test (E2E: Browser -> Distiller -> LLM)...");
    
    // 1. 获取 HTML (复用 Distiller)
    const browser = await chromium.launch({ headless: true }); // Headless 即可
    const page = await browser.newPage();
    const targetUrl = "https://job-boards.greenhouse.io/andurilindustries/jobs/4829829007?gh_jid=4829829007"; 
    
    console.log(`🌐 Fetching ${targetUrl}...`);
    await page.goto(targetUrl);
    await page.waitForLoadState('networkidle');
    
    const { html } = await page.evaluate(distillPage);
    console.log(`✅ Distilled HTML (${html.length} chars).`);
    await browser.close();

    // 2. 调用 Planner
    try {
        const plan = await generatePlan(html, MOCK_PROFILE);
        
        console.log("\n================ AGENT PLAN REPORT ================");
        console.log("📝 Page Analysis:", plan.page_analysis);
        console.log("\n👇 Actions Generated:");
        
        // 打印成表格方便检查
        console.table(plan.actions.map(a => ({
            id: a.id,
            label: a.label.substring(0, 20),
            type: a.type,
            value: a.value.substring(0, 30),
            reasoning: a.reasoning.substring(0, 50) + "..."
        })));

        // 简单的验证逻辑
        const firstNameAction = plan.actions.find(a => a.value === "San");
        if (firstNameAction) {
            console.log("\n✅ SUCCESS: Agent found where to fill 'First Name'!");
        } else {
            console.error("\n❌ FAIL: Agent did not fill 'First Name'. Check Prompt.");
        }

    } catch (e) {
        console.error("Error in Planner:", e);
    }
}

runTest();