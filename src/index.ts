// src/index.ts
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { distillPage } from './browser/distiller';
import { generatePlan } from './agents/planner';
import { Executor } from './browser/executor';
import { UserProfile } from './types';
import dotenv from 'dotenv';

dotenv.config();

// 读取本地 profile.json
function loadProfile(): UserProfile {
    const profilePath = path.resolve(__dirname, '../profile.json');
    if (!fs.existsSync(profilePath)) {
        console.error(`❌ Error: profile.json not found at ${profilePath}`);
        process.exit(1);
    }
    
    try {
        const data = fs.readFileSync(profilePath, 'utf-8');
        return JSON.parse(data) as UserProfile;
    } catch (e) {
        console.error("❌ Error parsing profile.json:", e);
        process.exit(1);
    }
}

async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error("Please provide a URL. Usage: npm start <url>");
        process.exit(1);
    }

    // 1. Load Profile
    console.log("📂 Loading Profile...");
    const profile = loadProfile();
    console.log(`   User: ${profile.basics.firstName} ${profile.basics.lastName}`);
    console.log(`   Resume: ${profile.resume_path}`);

    // 2. Launch Browser
    console.log("🚀 Job Copilot v1.0 Starting...");
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log(`🌐 Navigating to ${url}...`);
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    // 3. Distill (Snapshot)
    console.log("👀 Distilling page...");
    const { html } = await page.evaluate(distillPage);

    // 4. Plan (Agent)
    console.log("🧠 Generating plan (GPT-4o)...");
    try {
        const plan = await generatePlan(html, profile);
        console.log(`📝 Generated ${plan.actions.length} actions.`);
        
        // Debug: 打印一下它打算填什么
        plan.actions.forEach(a => console.log(`   - ${a.label}: ${a.value}`));

        // 5. Execute (Hands)
        const executor = new Executor(page);
        await executor.executePlan(plan);

        console.log("\n✅ Done! Browser will remain open for you to review.");
    } catch (e) {
        console.error("❌ Error during planning/execution:", e);
    }

    // await browser.close(); 
}

main().catch(console.error);