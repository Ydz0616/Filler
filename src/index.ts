// src/index.ts
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
// 引入 DistillResult 接口以便类型提示
import { distillPage, DistillResult } from './browser/distiller';
import { generatePlan } from './agents/planner'; 
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

    console.log("\n🚀 Job Copilot v1.1 (Spotlight Loop) Starting...");
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log(`🌐 Navigating to ${url}...`);
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    // === 🏗️ Spotlight Loop Implementation ===
    const MAX_PASSES = 3;
    let pass = 1;
    // 🔥 NEW: Track executed IDs across passes to prevent redundancy
    const executedFieldIds = new Set<string>();

    // 🔥 NEW: 创建日志目录
    const logsDir = path.resolve(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
        console.log(`📁 Created logs directory at ${logsDir}`);
    }

    // Loop runs at most 3 times, or breaks if no actions are generated
    while (pass <= MAX_PASSES) {
        console.log(`\n🔄 --- PASS ${pass} / ${MAX_PASSES} ---`);

        // 1. Distill
        // Pass 1: Full Capture (simplifyFilled = false)
        // Pass 2+: Spotlight Mode (simplifyFilled = true) - folds completed fields
        const isSpotlight = pass > 1;
        
        console.log(`👀 Distilling page (Simplify: ${isSpotlight})...`);
        const { html, summary } = await page.evaluate(distillPage, isSpotlight) as DistillResult;

        // 🔥 LOGGING: 将每一轮 Distill 的 HTML 内容保存到文件，方便 Debug
        const logFileName = `pass_${pass}_distill.html`;
        const logPath = path.join(logsDir, logFileName);
        fs.writeFileSync(logPath, html);
        console.log(`📸 Debug Snapshot saved to: logs/${logFileName}`);

        // 🔥 打印 DOM 快照表格 (The Eyes) - Only on first pass to save space, or every pass if desired
        // 这里我根据你的要求，保留第一遍的完整输出，后续如果需要调试也可以打开
        if (pass === 1) {
            console.log("\n================ DOM SNAPSHOT (The Eyes) ================");
            console.table(summary.map(s => ({
                ID: s.id,
                Type: s.type,
                Label: s.question.length > 40 ? s.question.substring(0, 40) + '...' : s.question,
                Value: s.content,
                Status: s.optionStatus
            })));
            console.log("=========================================================\n");
        }

        // 2. Plan
        // Pass 1 -> 'initial' prompt, Pass 2+ -> 'spotlight' prompt
        const planMode = isSpotlight ? 'spotlight' : 'initial';
        
        console.log(`🧠 Generating plan (Mode: ${planMode})...`);
        const rawPlan = await generatePlan(html, profile, planMode);

        // 🔥 FILTERING LOGIC: Remove actions already attempted in previous passes
        const newActions = rawPlan.actions.filter(action => {
            if (executedFieldIds.has(action.id)) {
                return false; // Already executed, skip
            }
            return true;
        });

        // Update the plan to only contain new actions
        const plan = { ...rawPlan, actions: newActions };
        const actionCount = plan.actions.length;

        console.log(`⚡ Planner suggests ${actionCount} NEW actions.`);

        // If Spotlight mode generates no new actions, we are done.
        if (actionCount === 0) {
            console.log("🎉 No new actions generated. Form appears valid/complete!");
            break;
        }

        // 3. Mark these IDs as executed so we don't repeat them in the next pass
        newActions.forEach(a => executedFieldIds.add(a.id));

        // 4. 打印 Plan 表格 (The Brain) - 只展示本轮新增的操作
        console.log(`\n================ AGENT PLAN REPORT (Pass ${pass}) ================`);
        console.table(plan.actions.map(a => ({
            Label: a.label.length > 30 ? a.label.substring(0, 30) + '...' : a.label,
            Type: a.type,
            Value: a.value.length > 30 ? a.value.substring(0, 30) + '...' : a.value,
            Reasoning: a.reasoning.length > 50 ? a.reasoning.substring(0, 50) + '...' : a.reasoning
        })));
        console.log("===============================================================\n");

        // 5. Execute
        const executor = new Executor(page);
        await executor.executePlan(plan);

        // 6. Post-Execution Summary for this Pass
        // 分类逻辑：
        // - Human Check: 明确被标记为需要人工检查的
        // - AI Guessed: 也就是 reasoning 里包含 [GUESS] 标签的
        const aiGuesses = plan.actions.filter(a => a.reasoning.includes('[GUESS]'));
        const humanChecks = plan.actions.filter(a => a.value === 'human_check');

        if (aiGuesses.length > 0) {
            console.log(`🤖 Pass ${pass} Guesses:`);
            aiGuesses.forEach(a => console.log(`   - [${a.label}] -> "${a.value}" (${a.reasoning})`));
        }
        if (humanChecks.length > 0) {
            console.log(`👇 Pass ${pass} Human Checks:`);
            humanChecks.forEach(a => console.log(`   - [${a.label}]: ${a.reasoning}`));
        }

        // 7. Wait for dynamic content (e.g., clicking "No" triggers "Race" dropdown)
        console.log("⏳ Waiting for DOM updates...");
        await page.waitForTimeout(2000); 
        await page.waitForLoadState('networkidle');

        pass++;
    }

    console.log("\n🏁 JOB DONE (Or Max Passes Reached). Browser remains open for final review.");
}

main().catch(console.error);