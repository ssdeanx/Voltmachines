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
  name: z.string().min(1),
  maxResearchLength: z.number().positive().default(8000),
  supportedFormats: z.array(z.enum(["markdown", "html", "text", "json"])).default(["markdown", "text"]),
  summarization: z.boolean().default(true),
  factChecking: z.boolean().default(true),
});

export type ResearchAgentConfig = z.infer<typeof researchAgentConfigSchema>;

const agentConfig = researchAgentConfigSchema.parse({
  name: "research-agent",
  maxResearchLength: 8000,
  supportedFormats: ["markdown", "text"],
  summarization: true,
  factChecking: true,
});

export const researchAgent = new Agent({
  name: agentConfig.name,
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

export const generateText = async (prompt: string, options?: Record<string, unknown>) => {
  return researchAgent.generateText(prompt, options);
};
