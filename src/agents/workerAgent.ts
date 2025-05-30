import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { agentPrompt } from "./agentPrompt.js";

/**
 * Worker agent configuration schema
 */
const workerAgentConfigSchema = z.object({
  maxTasks: z.number().positive().default(10),
  capabilities: z.array(z.string()).default(["task execution", "data processing", "context sharing"]),
});

export type WorkerAgentConfig = z.infer<typeof workerAgentConfigSchema>;

const agentConfig = workerAgentConfigSchema.parse({
  maxTasks: 10,
  capabilities: ["task execution", "data processing", "context sharing"],
});

export const workerAgent = new Agent({
  name: "worker-agent",
  instructions: agentPrompt({
    capabilities: agentConfig.capabilities.join(", "),
    goal: "Assist the supervisor agent and sub-agents with delegated tasks.",
    context: "You may receive a sessionId and other context from the supervisor.",
    task: "Perform the assigned work and report results.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  hooks: developmentHooks,
  tools: [], // Add tools as needed
});

/**
 * Generates text using the workerAgent's LLM.
 *
 * @param prompt - The prompt string to send to the agent.
 * @param options - Optional generation options.
 * @returns Promise resolving to the generated text.
 * @throws If text generation fails.
 */
export const generateText = async (
  prompt: string,
  options?: Record<string, unknown>
): Promise<string> => {
  try {
    const result = await workerAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[workerAgent.generateText] Error:", error);
    throw error;
  }
};
