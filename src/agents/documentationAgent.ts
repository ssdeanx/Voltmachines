import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";

/**
 * Documentation agent configuration schema
 */
const documentationAgentConfigSchema = z.object({
  name: z.string().min(1),
  maxDocLength: z.number().positive().default(10000),
  supportedFormats: z.array(z.enum(["markdown", "html", "text", "json"])).default(["markdown", "html", "text"]),
  summarization: z.boolean().default(true),
  formatting: z.boolean().default(true),
  citation: z.boolean().default(true),
});

export type DocumentationAgentConfig = z.infer<typeof documentationAgentConfigSchema>;

const agentConfig = documentationAgentConfigSchema.parse({
  name: "documentation-agent",
  maxDocLength: 10000,
  supportedFormats: ["markdown", "html", "text"],
  summarization: true,
  formatting: true,
  citation: true,
});

export const documentationAgent = new Agent({
  name: agentConfig.name,
  instructions: `You are a documentation agent. You can:
- Generate, summarize, and format technical documentation
- Use web search and URL fetch tools for research and references
- Analyze and improve documentation clarity, structure, and style
- Provide citations and references for all factual claims
- Output in markdown, HTML, or plain text as needed
Always ensure documentation is accurate, well-structured, and properly cited.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  hooks: developmentHooks,
  tools: [textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool],
});
export const generateText = async (prompt: string, options?: Record<string, unknown>) => {
  return documentationAgent.generateText(prompt, options);
};
