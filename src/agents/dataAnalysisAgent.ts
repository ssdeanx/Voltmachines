import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { calculatorTool, textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import type { OnEndHookArgs } from '@voltagent/core';

/**
 * Data analysis configuration schema
 */
const dataAnalysisConfigSchema = z.object({
  name: z.string().min(1),
  maxDataPoints: z.number().positive().default(10000),
  supportedFormats: z.array(z.enum(['json', 'csv', 'xml', 'yaml'])).default(['json', 'csv']),
  confidenceThreshold: z.number().min(0).max(1).default(0.8),
  analysisTypes: z.array(z.enum(['statistical', 'sentiment', 'pattern', 'trend'])).default(['statistical', 'sentiment']),
});

/**
 * Analysis result schema for validation
 */
export const analysisResultSchema = z.object({
  dataType: z.enum(['numerical', 'text', 'mixed']),
  sampleSize: z.number().positive(),
  confidence: z.number().min(0).max(1),
  insights: z.array(z.string().min(1)),
  statistics: z.object({
    mean: z.number().optional(),
    median: z.number().optional(),
    mode: z.union([z.number(), z.string()]).optional(),
    standardDeviation: z.number().optional(),
  }).optional(),
  sentiment: z.object({
    positive: z.number().min(0).max(1),
    negative: z.number().min(0).max(1),
    neutral: z.number().min(0).max(1),
  }).optional(),
  recommendations: z.array(z.string()).optional(),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type DataAnalysisConfig = z.infer<typeof dataAnalysisConfigSchema>;

// Validate agent configuration
const agentConfig = dataAnalysisConfigSchema.parse({
  name: "data-analyst",
  maxDataPoints: 50000,
  supportedFormats: ['json', 'csv', 'xml'],
  confidenceThreshold: 0.85,
  analysisTypes: ['statistical', 'sentiment', 'pattern', 'trend'],
});

export const dataAnalysisAgent = new Agent({
  name: agentConfig.name,
  instructions: `You are a specialized data analysis agent with expertise in:
  - Mathematical calculations and statistical analysis (max ${agentConfig.maxDataPoints} data points)
  - Text processing and sentiment analysis (confidence threshold: ${agentConfig.confidenceThreshold})
  - Data format conversion and validation (supports: ${agentConfig.supportedFormats.join(', ')}
  - Pattern recognition and insights generation
  - Analysis types: ${agentConfig.analysisTypes.join(', ')}
  - Web research for data context and validation
  
  Always provide detailed explanations of your analysis process and highlight key insights.
  When working with data, ensure accuracy and provide confidence levels for your findings.
  Use web search to validate findings and gather additional context when needed.
    All analysis results must conform to the analysisResultSchema for consistency and validation.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  tools: [calculatorTool, textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool],
  memory: voltAgentMemory,
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] dataAnalysisAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
});

/**
 * Generates text using the dataAnalysisAgent's LLM.
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
    const result = await dataAnalysisAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[dataAnalysisAgent.generateText] Error:", error);
    throw error;
  }
};
// Usage:
// const conversationId = await getOrStartThread('dataAnalyst', 'main-user');
// const response = await dataAnalysisAgent.generateText('Analyze this data', { userId: 'main-user', conversationId });
