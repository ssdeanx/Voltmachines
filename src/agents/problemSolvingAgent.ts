import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { calculatorTool, textAnalyzerTool, dataFormatterTool, systemInfoTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { getAgentPrompt } from "./agentPrompt.js";

/**
 * Problem solution schema
 */
export const problemSolutionSchema = z.object({
  problemType: z.enum(['mathematical', 'technical', 'analytical', 'creative', 'logical', 'mixed']),
  complexity: z.number().min(1).max(10),
  approach: z.enum(['sequential', 'parallel', 'recursive', 'iterative', 'heuristic']),
  steps: z.array(z.object({
    step: z.number().positive(),
    description: z.string().min(1),
    tool: z.string().optional(),
    result: z.string().optional(),
    confidence: z.number().min(0).max(1),
  })),
  solution: z.string().min(1),
  confidence: z.number().min(0).max(1),
  validation: z.object({
    verified: z.boolean(),
    method: z.string(),
    accuracy: z.number().min(0).max(1).optional(),
  }).optional(),
  alternatives: z.array(z.string()).optional(),
});

export type ProblemSolution = z.infer<typeof problemSolutionSchema>;

// Agent configuration schema
const problemSolvingAgentConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "problem decomposition",
    "reasoning",
    "hypothesis generation",
    "solution synthesis",
    "web research"
  ]),
  maxSteps: z.number().positive().default(50),
  enableReasoning: z.boolean().default(true),
});

const agentConfig = problemSolvingAgentConfigSchema.parse({
  capabilities: [
    "problem decomposition",
    "reasoning",
    "hypothesis generation",
    "solution synthesis",
    "web research"
  ],
  maxSteps: 50,
  enableReasoning: true,
});

export const problemSolvingAgent = new Agent({
  name: "problem-solver",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Decompose, reason about, and solve complex problems.",
    context: `Max steps: ${agentConfig.maxSteps}, Reasoning: ${agentConfig.enableReasoning ? 'enabled' : 'disabled'}`,
    task: "Analyze problems, generate hypotheses, and synthesize solutions.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    maxSteps: agentConfig.maxSteps,
    enableReasoning: agentConfig.enableReasoning,
   // Additional memory options
    // Enable additional features for data analysis
    // Additional memory options
     // Enable context sharing for task delegation
    enableContextSharing: true,
    // Enable additional features for data processing
    enableDataProcessing: true,
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: developmentHooks,
  tools: [
    calculatorTool, 
    textAnalyzerTool, 
    dataFormatterTool, 
    systemInfoTool,
    webSearchTool,   
    urlFetchTool,
  ],
});
// Usage:
// const conversationId = await getOrStartThread('problemSolver', 'main-user');
// const response = await problemSolvingAgent.generateText('Solve this problem', { userId: 'main-user', conversationId });

/**
 * Generates text using the problemSolvingAgent's LLM.
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
    const result = await problemSolvingAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[problemSolvingAgent.generateText] Error:", error);
    throw error;
  }
};