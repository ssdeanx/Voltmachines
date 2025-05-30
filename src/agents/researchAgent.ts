import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { webSearchTool, urlFetchTool, textAnalyzerTool, dataFormatterTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";


/**
 * Research agent configuration schema
 */
const researchAgentConfigSchema = z.object({
  maxResearchLength: z.number().positive().default(8000),
  supportedFormats: z.array(z.enum(["markdown", "html", "text", "json"])).default(["markdown", "text"]),
  summarization: z.boolean().default(true),
  factChecking: z.boolean().default(true),
});

export type ResearchAgentConfig = z.infer<typeof researchAgentConfigSchema>;

const agentConfig = researchAgentConfigSchema.parse({
  maxResearchLength: 8000,
  supportedFormats: ["markdown", "text"],
  summarization: true,
  factChecking: true,
});

export const researchAgent = new Agent({
  name: "research-agent",
  instructions: `You are a research agent. You can:
- Perform advanced research and fact-finding using web search and URL fetch tools
- Summarize, analyze, and synthesize information from multiple sources
- Fact-check claims and provide references
- Format research output for clarity and accuracy
Always cite your sources and validate your findings.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
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
 