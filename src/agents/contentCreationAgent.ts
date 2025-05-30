import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import type { OnEndHookArgs } from '@voltagent/core';
/**
 * Content creation configuration schema
 */
const contentCreationConfigSchema = z.object({
  name: z.string().min(1),
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
  name: "content-creator",
  maxContentLength: 10000,
  supportedFormats: ['markdown', 'html', 'text'],
  seoOptimization: true,
  audience: 'general',
});

export const contentCreationAgent = new Agent({
  name: agentConfig.name,
  instructions: `You are a specialized content creation agent with expertise in:
  - Creative writing and copywriting (max ${agentConfig.maxContentLength} characters)
  - Content optimization and SEO (${agentConfig.seoOptimization ? 'enabled' : 'disabled'})
  - Editorial review and proofreading
  - Content strategy and planning for ${agentConfig.audience} audience
  - Research and fact-checking via web search
  - Current trends and topic analysis
  - Supported formats: ${agentConfig.supportedFormats.join(', ')}
  
  Focus on creating engaging, well-structured content that resonates with the target audience.
  Use text analysis to optimize readability and impact. Research current trends and verify facts.
    Always validate your content output using the contentOutputSchema before final delivery.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  tools: [textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool],
  memory: voltAgentMemory,
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] contentCreationAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
});
// Usage:
// const conversationId = await getOrStartThread('contentCreator', 'main-user');
// const response = await contentCreationAgent.generateText('Create content...', { userId: 'main-user', conversationId });
