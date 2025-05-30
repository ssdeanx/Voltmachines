import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { getAgentPrompt } from "./agentPrompt.js";
/**
 * Content creation configuration schema
 */
const contentCreationConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "content writing",
    "SEO optimization",
    "markdown and HTML formatting",
    "summarization",
    "creative generation",
    "web research"
  ]),
  maxContentLength: z.number().positive().default(5000),
  supportedFormats: z.array(z.enum(['markdown', 'html', 'text', 'json'])).default(['markdown', 'text']),
  seoOptimization: z.boolean().default(true),
  audience: z.enum(['general', 'technical', 'marketing', 'academic']).default('general'),
});

/**
 * Content output schema for validation
 */
export const contentOutputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(10),
  format: z.enum(['markdown', 'html', 'text', 'json']),
  wordCount: z.number().positive(),
  readabilityScore: z.number().min(0).max(100).optional(),
  seoKeywords: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ContentOutput = z.infer<typeof contentOutputSchema>;
export type ContentCreationConfig = z.infer<typeof contentCreationConfigSchema>;

// Validate agent configuration
const agentConfig = contentCreationConfigSchema.parse({
  capabilities: [
    "content writing",
    "SEO optimization",
    "markdown and HTML formatting",
    "summarization",
    "creative generation",
    "web research"
  ],
  maxContentLength: 2000,
  seoOptimization: true,
  supportedFormats: ["markdown", "html", "text", "json"],
  audience: "general",
});

export const contentCreationAgent = new Agent({
  name: "content-creator",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Generate high-quality content, optimize for SEO, and support multiple formats.",
    context: `Max content length: ${agentConfig.maxContentLength}, SEO: ${agentConfig.seoOptimization ? 'enabled' : 'disabled'}, Supported formats: ${agentConfig.supportedFormats.join(', ')}`,
    task: "Write, summarize, and format content as requested.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    maxContextLength: agentConfig.maxContentLength,
    audience: agentConfig.audience,
    supportedFormats: agentConfig.supportedFormats,
    seoOptimization: agentConfig.seoOptimization,
   // Additional memory options
    maxSteps: 100, // Limit steps to prevent excessive memory usage
    // Enable additional features for data analysis
    enableContextSharing: true,
    enableDataProcessing: true,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: developmentHooks,
  tools: [textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool],
});

/**
 * Generates text using the contentCreationAgent's LLM.
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
    const result = await contentCreationAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[contentCreationAgent.generateText] Error:", error);
    throw error;
  }
};