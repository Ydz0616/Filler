// src/browser/executor.ts
import { Page, Locator } from "playwright";
import { AgentPlan } from "../types";
import { findBestMatch } from "../utils/matcher";

export class Executor {
    constructor(private page: Page) {}

    async executePlan(plan: AgentPlan) {
        console.log("\n🚀 Executor: Starting execution...");

        for (const action of plan.actions) {

            // 1. Human Check 拦截
            if (action.value === 'human_check') {
                console.warn(`⚠️ [Human Check Needed] Field: ${action.label} (${action.id}) - Reason: ${action.reasoning}`);
                continue; // 跳过后续操作，保持输入框为空，等待人工填写
            }
            
            const selector = `[data-sme-id="${action.id}"]`;
            const locator = this.page.locator(selector).first();
            
            // 2. 检查元素是否存在
            if (await locator.count() === 0) {
                console.warn(`⚠️ Element not found: ${action.id} (${action.label}). Skipping.`);
                continue;
            }

            console.log(`⚡ Action: [${action.type}] on ${action.label} -> ${action.value}`);

            try {
                switch (action.type) {
                    case 'fill':
                        await locator.fill(action.value);
                        // 触发 Blur 以激活页面校验
                        await locator.blur(); 
                        break;

                    case 'file_upload':
                        // Playwright 处理文件上传的专用方法
                        await locator.setInputFiles(action.value);
                        break;

                    case 'smart_select':
                        // 调用增强版下拉框处理逻辑
                        await this.handleSmartSelect(selector, action.value);
                        break;

                    case 'radio':
                    case 'checkbox':
                        // 对于 Radio/Checkbox，如果 value 是 "Yes"/"True"，则 check
                        if (['yes', 'true', 'checked'].includes(action.value.toLowerCase())) {
                            await locator.check();
                        } else {
                            // 默认行为 Check
                            await locator.check();
                        }
                        break;
                    
                    case 'click':
                        
                        await locator.click({ force: true });
                        console.log("   ⏳ Clicked. Waiting for DOM update...");
                        await this.page.waitForTimeout(1000);
                        break;
                }
            } catch (e) {
                console.error(`❌ Failed to execute action on ${action.id}:`, e);
            }
            
            // 稍微慢一点，看起来像真人，也防止触发反爬
            await this.page.waitForTimeout(500);
        }
    }

    /**
     * 🔥 增强版下拉框处理逻辑 (Multi-Strategy)
     * 专门解决 Greenhouse/React-Select 选项渲染在 DOM 底部的问题
     */
    private async handleSmartSelect(selector: string, userIntent: string) {
        let trigger = this.page.locator(selector);
        
        // Step 1: 尝试定位更精准的点击目标 (比如内部的箭头按钮)
        // Greenhouse 的下拉框通常有个 button[aria-label="Toggle flyout"]
        const specificButton = trigger.locator('button[aria-label="Toggle flyout"], [class*="indicator"]');
        if (await specificButton.count() > 0) {
            trigger = specificButton.first();
            // console.log("   🔧 Adjusted click target to internal toggle button.");
        }
        
        // Step 2: 点击展开
        await trigger.click({ force: true });
        
        // 给一点点时间让 JS 渲染 DOM (React Portal 通常需要一帧)
        await this.page.waitForTimeout(800);

        // Step 3: 定义多种寻找 Option 的策略 (优先级从高到低)
        const strategies = [
            // 策略 A: Greenhouse / React-Select 专用 (根据你的截图验证!)
            // 找包含 "select__menu" class 的容器里面的 div
            { name: 'Greenhouse Menu', selector: '[class*="select__menu"] div' }, 
            
            // 策略 B: 标准 ARIA
            { name: 'ARIA Option', selector: '[role="option"]' },
            
            // 策略 C: 通用 React-Select (部分旧版)
            { name: 'React-Select Option', selector: '[class*="option"]' },
            
            // 策略 D: 兜底 (原生 li)
            { name: 'List Item', selector: 'li' }
        ];

        let optionsLocator: Locator | null = null;
        let foundStrategy = "";

        // Step 4: 寻找可见的选项列表
        for (const strategy of strategies) {
            // 关键：只找 :visible 的！防止抓到页面上隐藏的其他下拉框选项
            // filter({ hasText: /\S/ }) 排除空 div
            const loc = this.page.locator(strategy.selector).filter({ hasText: /\S/ });
            
            // 检查是否有任何一个可见
            const count = await loc.count();
            if (count > 0) {
                if (await loc.first().isVisible()) {
                    optionsLocator = loc;
                    foundStrategy = strategy.name;
                    // console.log(`   🔎 Found options using strategy: ${strategy.name}`);
                    break; 
                }
            }
        }

        if (!optionsLocator) {
            console.warn("   ⚠️ Dropdown opened, but NO visible options found (Tried Greenhouse, ARIA, li).");
            // 尝试按 Esc 关闭，避免遮挡后续操作
            await this.page.keyboard.press('Escape');
            return;
        }

        // Step 5: 获取文本并匹配
        try {
            // 等待列表稳定
            await optionsLocator.first().waitFor({ state: 'visible', timeout: 2000 });
            
            const optionsTexts = await optionsLocator.allInnerTexts();
            
            // 调用 matcher 逻辑
            const result = findBestMatch(userIntent, optionsTexts);

            if (result && result.score > 0.4) {
                console.log(`   🎯 Matched: "${result.match}" (Score: ${result.score.toFixed(2)})`);
                
                // 精确点击第 N 个元素
                // force: true 防止被悬浮层边框遮挡
                await optionsLocator.nth(result.index).click({ force: true });
                
            } else {
                console.warn(`   ⚠️ No good match for "${userIntent}". Top options: ${optionsTexts.slice(0, 3)}`);
                // 没匹配上，关闭菜单
                await this.page.keyboard.press('Escape'); 
            }

        } catch (e) {
            console.warn(`   ⚠️ Error interacting with options: ${e}`);
        }
    }
}