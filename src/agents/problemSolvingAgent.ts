import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { calculatorTool, textAnalyzerTool, dataFormatterTool, systemInfoTool, webSearchTool, urlFetchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";

import type { OnEndHookArgs } from '@voltagent/core';

/**
 * Problem solving configuration schema
 */
const problemSolvingConfigSchema = z.object({
  name: z.string().min(1),
  maxComplexity: z.number().min(1).max(10).default(8),
  timeoutMinutes: z.number().positive().default(30),
  enableMultistep: z.boolean().default(true),
  requireValidation: z.boolean().default(true),
  domains: z.array(z.enum(['technical', 'mathematical', 'analytical', 'creative', 'logical'])).default(['technical', 'mathematical', 'analytical']),
});
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
export type ProblemSolvingConfig = z.infer<typeof problemSolvingConfigSchema>;

// Validate agent configuration
const agentConfig = problemSolvingConfigSchema.parse({
  name: "problem-solver",
  maxComplexity: 9,
  timeoutMinutes: 45,
  enableMultistep: true,
  requireValidation: true,
  domains: ['technical', 'mathematical', 'analytical', 'creative', 'logical'],
});

export const problemSolvingAgent = new Agent({
  name: agentConfig.name,
  instructions: `You are a versatile problem-solving agent capable of:
  
  **Configuration:**
  - Max complexity level: ${agentConfig.maxComplexity}/10
  - Timeout: ${agentConfig.timeoutMinutes} minutes
  - Multi-step solving: ${agentConfig.enableMultistep ? 'enabled' : 'disabled'}
  - Validation required: ${agentConfig.requireValidation ? 'yes' : 'no'}
  - Domains: ${agentConfig.domains.join(', ')}
  
  **Core Capabilities:**
  - Breaking down complex problems into manageable steps
  - Combining multiple tools and approaches for comprehensive solutions
  - Providing detailed reasoning for your problem-solving process
  - Adapting your approach based on the specific domain and requirements
  - Researching current information via web search
  - Getting real-time data and system information
  
  **Problem-Solving Process:**
  1. Analyze and categorize the problem
  2. Determine complexity level (1-${agentConfig.maxComplexity})
  3. Select appropriate approach (sequential, parallel, recursive, iterative, heuristic)
  4. Break down into steps with confidence levels
  5. Execute each step using available tools
  6. Validate solution if required
  7. Provide alternatives when possible
  
  Always explain your reasoning process and validate your solutions when possible.
  Consider multiple approaches and choose the most effective one for each situation.
  Use web search for current information and system tools for diagnostics.  All solutions must conform to problemSolutionSchema for consistency.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] problemSolvingAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
  tools: [
    calculatorTool, 
    textAnalyzerTool, 
    dataFormatterTool, 
    systemInfoTool,
    webSearchTool,    urlFetchTool,
  ],
});
// Usage:
// const conversationId = await getOrStartThread('problemSolver', 'main-user');
// const response = await problemSolvingAgent.generateText('Solve this problem', { userId: 'main-user', conversationId });
