// src/agents/planner.ts
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { UserProfile, PlanSchema, AgentPlan } from "../types";
// Import both prompts
import { PLANNER_SYSTEM_PROMPT, PLANNER_SPOTLIGHT_PROMPT } from "./prompts"; 
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Added 'mode' parameter to control agent behavior
export async function generatePlan(
    html: string, 
    profile: UserProfile, 
    mode: 'initial' | 'spotlight' = 'initial'
): Promise<AgentPlan> {
    
    // Select the appropriate prompt based on the mode
    const systemPrompt = mode === 'initial' 
        ? PLANNER_SYSTEM_PROMPT 
        : PLANNER_SPOTLIGHT_PROMPT;

    console.log(`🧠 Planner: Thinking (Mode: ${mode})...`);
    
    try {
        const completion = await openai.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
                { role: "system", content: systemPrompt }, 
                { 
                    role: "user", 
                    content: `User Profile:\n${JSON.stringify(profile, null, 2)}\n\nTarget HTML:\n${html}` 
                },
            ],
            response_format: zodResponseFormat(PlanSchema, "filling_plan"),
        });

        // handle undefined
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