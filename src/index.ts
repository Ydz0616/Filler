// src/index.ts
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
// 引入 DistillResult 接口以便类型提示
import { distillPage, DistillResult } from './browser/distiller';
import { generatePlan } from './agents/planner'; // 注意：确保路径是 agent 而不是 agents
import { Executor } from './browser/executor';
import { UserProfile } from './types';
import dotenv from 'dotenv';

dotenv.config();

function loadProfile(): UserProfile {
    const profilePath = path.resolve(__dirname, '../profile.json');
    if (!fs.existsSync(profilePath)) {
        console.error(`❌ Error: profile.json not found at ${profilePath}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as UserProfile;
}

async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error("Usage: npm start <url>");
        process.exit(1);
    }

    const profile = loadProfile();
    console.log(`👤 User: ${profile.basics.firstName} ${profile.basics.lastName}`);
    // Debug: 打印这两个路径，确保它们真的被读到了
    console.log(`📄 Resume Path: ${profile.resume_path}`); 
    console.log(`📄 Cover Letter Path: ${profile.cover_letter_path || "UNDEFINED (Check JSON keys!)"}`);

    console.log("\n🚀 Job Copilot v1.0 Starting...");
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log(`🌐 Navigating to ${url}...`);
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    // 1. Distill
    console.log("👀 Distilling page...");
    // 关键修改：获取 html 和 summary
    const { html, summary } = await page.evaluate(distillPage) as DistillResult;

    // 🔥 打印 DOM 快照表格 (The Eyes)
    console.log("\n================ DOM SNAPSHOT (The Eyes) ================");
    console.table(summary.map(s => ({
        ID: s.id,
        Type: s.type,
        Label: s.question.length > 40 ? s.question.substring(0, 40) + '...' : s.question,
        Value: s.content,
        Status: s.optionStatus
    })));
    console.log("=========================================================\n");

    // 2. Plan
    console.log("🧠 Generating plan (GPT-4o)...");
    const plan = await generatePlan(html, profile);

    // 3. 打印 Plan 表格 (The Brain)
    console.log("\n================ AGENT PLAN REPORT (The Brain) ================");
    console.table(plan.actions.map(a => ({
        Label: a.label.length > 30 ? a.label.substring(0, 30) + '...' : a.label,
        Type: a.type,
        Value: a.value.length > 30 ? a.value.substring(0, 30) + '...' : a.value,
        Reasoning: a.reasoning.length > 50 ? a.reasoning.substring(0, 50) + '...' : a.reasoning
    })));
    console.log("===============================================================\n");

    // 4. Execute
    const executor = new Executor(page);
    await executor.executePlan(plan);

    // 5. Summary & Classification (关键更新)
    // 分类逻辑：
    // - Human Check: 明确被标记为需要人工检查的
    // - AI Guessed: 也就是 reasoning 里包含 [GUESS] 标签的
    // - Perfect Fills: 既不是 human_check 也没有 guess 标签的
    const humanChecks = plan.actions.filter(a => a.value === 'human_check');
    const aiGuesses = plan.actions.filter(a => a.reasoning.includes('[GUESS]') && a.value !== 'human_check');
    const perfectFills = plan.actions.filter(a => a.value !== 'human_check' && !a.reasoning.includes('[GUESS]'));

    console.log("\n🏁 EXECUTION SUMMARY 🏁");
    console.log(`✅ Perfectly Matched: ${perfectFills.length} fields`);
    console.log(`🤖 AI Guessed (Review Suggested): ${aiGuesses.length} fields`);
    console.log(`⚠️ Human Check Needed (Empty): ${humanChecks.length} fields`);
    
    // 展示 AI 猜测的项 (Log Warning)
    if (aiGuesses.length > 0) {
        console.log("\n🤔 AI Guesses (Please Check):");
        aiGuesses.forEach(a => {
            console.log(`   - [${a.label}] -> "${a.value}"`);
            console.log(`     Reason: ${a.reasoning}`);
        });
    }

    // 展示必须人工填写的项 (Log Error)
    if (humanChecks.length > 0) {
        console.log("\n👇 MUST FILL MANUALLY:");
        humanChecks.forEach(a => {
            console.log(`   - [${a.label}]: ${a.reasoning}`);
        });
    }

    console.log("\nBrowser remains open for final review.");
}

main().catch(console.error);