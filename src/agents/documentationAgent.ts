import { z } from "zod";
import { Agent, OnEndHookArgs } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { getAgentPrompt } from "./agentPrompt.js";
import { textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";

/**
 * Documentation agent configuration schema
 */
const documentationAgentConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "technical writing",
    "API documentation",
    "code annotation",
    "markdown formatting",
    "summarization",
    "web research",
  ]),
  maxDocLength: z.number().positive().default(10000),
  supportedFormats: z.array(z.enum(["markdown", "html", "text"])).default(["markdown", "html"]),
  enableSummarization: z.boolean().default(true),
});

export type DocumentationAgentConfig = z.infer<typeof documentationAgentConfigSchema>;

const agentConfig = documentationAgentConfigSchema.parse({
  capabilities: [
    "technical writing",
    "API documentation",
    "code annotation",
    "markdown formatting",
    "summarization",
    "web research",
  ],
  maxDocLength: 8000,
  supportedFormats: ["markdown", "html"],
  enableSummarization: true,
});

export const documentationAgent = new Agent({
  name: "documentation-agent",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Generate, summarize, and format technical documentation.",
    context: `Max doc length: ${agentConfig.maxDocLength}, Supported formats: ${agentConfig.supportedFormats.join(
      ", "
    )}, Summarization: ${agentConfig.enableSummarization ? "enabled" : "disabled"}`,
    task: "Write, summarize, and format documentation as requested.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    maxDocLength: agentConfig.maxDocLength,
    supportedFormats: agentConfig.supportedFormats,
    enableSummarization: agentConfig.enableSummarization,
    audience: "technical", // Default audience for documentation
     // Enable context sharing for task delegation
    enableContextSharing: true,
    // Enable additional features for data processing
    enableDataProcessing: true,
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
    },
    hooks: {
      ...developmentHooks,
      onEnd: async (args: OnEndHookArgs) => {
        const conversationId = args.context?.userContext?.get('conversationId') || undefined;
        console.log(`[✅ Agent] documentationAgent completed operation for conversation:`, conversationId || 'unknown');
      },
    },
    tools: [textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool],
});

/**
 * Generates text using the documentationAgent's LLM.
 *
 * @param prompt - The prompt string to send to the agent.
 * @param options - Optional generation options.
 * @returns Promise resolving to the generated text.
 * @throws If text generation fails.
 */
// Generated on 2025-05-30 17:34 UTC
export const generateText = async (
  prompt: string,
  options?: Record<string, unknown>
): Promise<string> => {
  try {
    const result = await documentationAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[documentationAgent.generateText] Error:", error);
    throw error;
  }
};