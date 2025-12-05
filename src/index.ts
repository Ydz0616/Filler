// src/index.ts
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
// 引入 DebugItem 用于增量日志逻辑
import { distillPage, DistillResult, DebugItem } from './browser/distiller';
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
    console.log(`📄 Resume Path: ${profile.resume_path}`); 
    console.log(`📄 Cover Letter Path: ${profile.cover_letter_path || "UNDEFINED"}`);

    console.log("\n🚀 Job Copilot v1.2 (Spotlight Loop + Smart Logging) Starting...");
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log(`🌐 Navigating to ${url}...`);
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    // === 🏗️ Spotlight Loop Implementation ===
    const MAX_PASSES = 2; // User requested 2 passes target
    let pass = 1;
    
    // 跟踪已执行的 Action ID (防止重复提交)
    const executedFieldIds = new Set<string>();
    
    // 🔥 NEW: 跟踪已见过的 DOM 元素 ID (用于增量日志)
    const seenDomIds = new Set<string>();

    const logsDir = path.resolve(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
    }

    while (pass <= MAX_PASSES) {
        console.log(`\n🔄 --- PASS ${pass} / ${MAX_PASSES} ---`);

        // 1. Distill
        const isSpotlight = pass > 1;
        console.log(`👀 Distilling page (Simplify: ${isSpotlight})...`);
        const { html, summary } = await page.evaluate(distillPage, isSpotlight) as DistillResult;

        // Logging: Save HTML
        const logFileName = `pass_${pass}_distill.html`;
        fs.writeFileSync(path.join(logsDir, logFileName), html);

        // 🔥 LOGGING: DOM SNAPSHOT (The Eyes)
        // 核心逻辑：找出本轮新出现的元素 (Diff)
        const newDomElements = summary.filter(item => !seenDomIds.has(item.id));
        
        // 更新全局 Set
        summary.forEach(item => seenDomIds.add(item.id));

        if (pass === 1) {
            // Pass 1: 展示全部 (Base Truth)
            console.log("\n================ DOM SNAPSHOT (Full View) ================");
            console.table(summary.map(s => ({
                ID: s.id,
                Label: s.question.length > 40 ? s.question.substring(0, 40) + '...' : s.question,
                Value: s.content,
                Status: s.optionStatus
            })));
        } else {
            // Pass 2+: 只展示新增的 (Incremental View)
            if (newDomElements.length > 0) {
                // 🔴 修复了这里的引号问题：统一使用反引号 (`)
                console.log(`\n================ NEW DOM ELEMENTS (Detected in Pass ${pass}) ================`);
                console.table(newDomElements.map(s => ({
                    ID: s.id,
                    Label: s.question,
                    Value: s.content,
                    Status: s.optionStatus
                })));
            } else {
                console.log(`\n(No new DOM elements detected in Pass ${pass}. Page structure is stable.)`);
            }
        }

        // 2. Plan
        const planMode = isSpotlight ? 'spotlight' : 'initial';
        console.log(`\n🧠 Generating plan (Mode: ${planMode})...`);
        const rawPlan = await generatePlan(html, profile, planMode);

        // 🔥 FILTERING: Remove actions already executed
        const newActions = rawPlan.actions.filter(action => !executedFieldIds.has(action.id));
        
        // 3. Mark IDs as executed
        newActions.forEach(a => executedFieldIds.add(a.id));
        
        const plan = { ...rawPlan, actions: newActions };
        
        // If no new actions, we are done
        if (newActions.length === 0) {
            console.log("🎉 No new actions generated. Form appears valid/complete!");
            break;
        }

        // 🔥 LOGGING: AGENT PLAN (The Brain)
        // 自然地，newActions 就是本轮新增的计划
        console.log(`\n================ AGENT PLAN (New Actions Only) ================`);
        console.table(plan.actions.map(a => ({
            Action: a.type,
            Label: a.label.length > 30 ? a.label.substring(0, 30) + '...' : a.label,
            Value: a.value.length > 30 ? a.value.substring(0, 30) + '...' : a.value,
            Reasoning: a.reasoning.length > 50 ? a.reasoning.substring(0, 50) + '...' : a.reasoning
        })));

        // 4. Execute
        const executor = new Executor(page);
        await executor.executePlan(plan);

        // 5. Post-Execution Wait
        console.log("⏳ Waiting for DOM updates...");
        await page.waitForTimeout(2000); 
        await page.waitForLoadState('networkidle');

        pass++;
    }

    console.log("\n🏁 JOB DONE. Browser remains open for final review.");
}

main().catch(console.error);