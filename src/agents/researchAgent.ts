import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { webSearchTool, urlFetchTool, textAnalyzerTool, dataFormatterTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { getAgentPrompt } from "./agentPrompt.js";


/**
 * Research agent configuration schema
 */
const researchAgentConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "web research",
    "information synthesis",
    "fact checking",
    "summarization",
    "citation management"
  ]),
  maxResearchLength: z.number().positive().default(8000),
  supportedFormats: z.array(z.enum(["markdown", "html", "text", "json"])).default(["markdown", "text"]),
  summarization: z.boolean().default(true),
  factChecking: z.boolean().default(true),
});

export type ResearchAgentConfig = z.infer<typeof researchAgentConfigSchema>;

const agentConfig = researchAgentConfigSchema.parse({
  capabilities: [
    "web research",
    "information synthesis",
    "fact checking",
    "summarization",
    "citation management"
  ],
  maxResearchLength: 8000,
  supportedFormats: ["markdown", "text"],
  summarization: true,
  factChecking: true,
});

export const researchAgent = new Agent({
  name: "research-agent",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Perform advanced research, synthesize information, and provide citations.",
    context: `Max research length: ${agentConfig.maxResearchLength}, Supported formats: ${agentConfig.supportedFormats.join(', ')}, Summarization: ${agentConfig.summarization ? 'enabled' : 'disabled'}, Fact checking: ${agentConfig.factChecking ? 'enabled' : 'disabled'}`,
    task: "Research, synthesize, fact-check, and format information as requested.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    maxResearchLength: agentConfig.maxResearchLength,
    supportedFormats: agentConfig.supportedFormats,
    summarization: agentConfig.summarization,
    factChecking: agentConfig.factChecking,
    // Additional memory options
    maxSteps: 100, // Limit steps to prevent excessive memory usage
    // Enable additional features for research tasks
    enableContextSharing: true,
    enableDataProcessing: true,
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: developmentHooks,
  tools: [webSearchTool, urlFetchTool, textAnalyzerTool, dataFormatterTool],
});

/**
 * Generates text using the researchAgent's LLM.
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
    const result = await researchAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[researchAgent.generateText] Error:", error);
    throw error;
  }
};
