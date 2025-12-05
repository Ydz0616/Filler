// src/types.ts
import { z } from "zod";

// --- 1. 用户 Profile 定义 (你的简历数据) ---
export interface UserProfile {
    basics: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        location?: string;
        website?: string;
        linkedin?: string;
    };
    education: Array<{
        school: string;
        degree: string;
        startDate: string;
        endDate: string;
        major: string;
    }>;
    experience: Array<{
        company: string;
        title: string;
        startDate: string;
        endDate: string;
        description: string;
        location?: string;
    }>;
    // 专门针对 Greenhouse/Lever 常见的“自愿调查”
    legal: {
        authorized_to_work: boolean;
        sponsorship_needed: boolean;
        veteran_status: string; // "I am not a protected veteran"
        disability_status: string; // "I do not have a disability"
        gender: string;
        race: string;
        export_controls:string;
    };
    resume_path: string; // 本地绝对路径
    cover_letter_path: string;
    cover_letter_text: string;
}

// --- 2. Agent 输出定义 (Structured Outputs) ---

// 单个动作
const ActionSchema = z.object({
    id: z.string().describe("The exact 'data-sme-id' from the HTML element."),
    label: z.string().describe("The question or label associated with this field (for debugging)."),
    type: z.enum(['fill', 'smart_select', 'file_upload', 'radio', 'checkbox', 'click']),
    value: z.string().describe("The value to fill. For dropdowns/radios, use the EXACT text from the User Profile to match intent."),
    reasoning: z.string().describe("Briefly explain why this value matches the user profile."),
});

// 整体计划
export const PlanSchema = z.object({
    page_analysis: z.string().describe("Brief analysis of the form sections (e.g., 'Contact Info', 'EEOC')."),
    actions: z.array(ActionSchema).describe("List of actions to fill the form."),
});

export type AgentPlan = z.infer<typeof PlanSchema>;