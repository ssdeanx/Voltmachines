import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { calculatorTool, textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { getAgentPrompt } from "./agentPrompt.js";

/**
 * Data analysis configuration schema
 */
const dataAnalysisConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "statistical analysis",
    "data visualization",
    "trend detection",
    "pattern recognition",
    "sentiment analysis",
    "data format conversion",
    "web research"
  ]),
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
  capabilities: [
    "statistical analysis",
    "data visualization",
    "trend detection",
    "pattern recognition",
    "sentiment analysis",
    "data format conversion",
    "web research"
  ],
  maxDataPoints: 50000,
  supportedFormats: ['json', 'csv', 'xml'],
  confidenceThreshold: 0.85,
  analysisTypes: ['statistical', 'sentiment', 'pattern', 'trend'],
});

export const dataAnalysisAgent = new Agent({
  name: "data-analyst",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Analyze, visualize, and interpret data for actionable insights.",
    context: `Max data points: ${agentConfig.maxDataPoints}, Supported formats: ${agentConfig.supportedFormats.join(', ')}, Confidence threshold: ${agentConfig.confidenceThreshold}`,
    task: "Perform data analysis, generate insights, and provide recommendations.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    maxDataPoints: agentConfig.maxDataPoints,
    supportedFormats: agentConfig.supportedFormats,
    confidenceThreshold: agentConfig.confidenceThreshold,
    analysisTypes: agentConfig.analysisTypes,
     // Enable context sharing for task delegation
    enableContextSharing: true,
    // Enable additional features for data processing
    enableDataProcessing: true,
    // Additional memory options
    maxSteps: 100, // Limit steps to prevent excessive memory usage
    // Enable additional features for data analysis
    // Additional memory options
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: developmentHooks,
  tools: [calculatorTool, textAnalyzerTool, dataFormatterTool, webSearchTool, urlFetchTool],
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
