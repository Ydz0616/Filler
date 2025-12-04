// src/utils/matcher.ts
import * as stringSimilarity from "string-similarity";

/**
 * 结果接口定义
 */
export interface MatchResult {
    match: string; // 匹配到的完整文本
    score: number; // 相似度分数 (0-1)
    index: number; // 在原数组中的索引
}

/**
 * 在一堆选项中找到最匹配用户意图的那一个
 * @param intent 用户 Profile 里的原始值 (e.g. "Male", "Spring 2026")。
 * @param options 网页上的选项列表 (e.g. ["Select...", "Male", "Female"])
 * @returns MatchResult 或 null
 */
export function findBestMatch(intent: string | undefined | null, options: string[]): MatchResult | null {
    // 1. 基础防御
    if (!intent || !options || options.length === 0) {
        return null;
    }

    const cleanIntent = intent.trim().toLowerCase();
    const cleanOptions = options.map(opt => opt.trim().toLowerCase());

    // 2. 优先级一：精确全等匹配 (Exact Match)
    const exactIndex = cleanOptions.findIndex(opt => opt === cleanIntent);
    if (exactIndex !== -1) {
        // 修复：添加 '!' 断言，告诉 TS 这个位置一定有值
        return { match: options[exactIndex]!, score: 1.0, index: exactIndex };
    }

    // 3. 优先级二：包含匹配 (Substring Match)
    let substringIndex = cleanOptions.findIndex(opt => opt.includes(cleanIntent));
    if (substringIndex === -1) {
        substringIndex = cleanOptions.findIndex(opt => cleanIntent.includes(opt) && opt.length > 2);
    }
    
    if (substringIndex !== -1) {
         // 修复：添加 '!' 断言
         return { match: options[substringIndex]!, score: 0.9, index: substringIndex };
    }

    // 4. 优先级三：模糊算法匹配 (Levenshtein Distance)
    try {
        const matches = stringSimilarity.findBestMatch(intent, options);
        const best = matches.bestMatch;

        if (best && best.rating > 0.3) {
            return {
                match: best.target,
                score: best.rating,
                index: options.indexOf(best.target)
            };
        }
    } catch (error) {
        console.warn(`⚠️ Fuzzy match error for intent "${intent}":`, error);
    }

    return null;
}