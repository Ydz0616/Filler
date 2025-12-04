// src/agent/planner.ts
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { UserProfile, PlanSchema, AgentPlan } from "../types";
import { PLANNER_SYSTEM_PROMPT } from "./prompts"; // <--- 导入这里
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function generatePlan(html: string, profile: UserProfile): Promise<AgentPlan> {
    console.log("🧠 Planner: Thinking (GPT-4o)...");
    
    try {
        const completion = await openai.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
                { role: "system", content: PLANNER_SYSTEM_PROMPT }, // <--- 使用导入的 Prompt
                { 
                    role: "user", 
                    content: `User Profile:\n${JSON.stringify(profile, null, 2)}\n\nTarget HTML:\n${html}` 
                },
            ],
            response_format: zodResponseFormat(PlanSchema, "filling_plan"),
        });

        //handle undefined
        const plan = completion.choices[0]?.message.parsed;
        
        if (!plan) {
            throw new Error("Failed to parse plan from OpenAI");
        }

        return plan;
    } catch (error) {
        console.error("❌ OpenAI API Error:", error);
        throw error;
    }
}