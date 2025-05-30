import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { githubTool, gitTool, urlFetchTool, webSearchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import type { OnEndHookArgs } from '@voltagent/core';
import { getAgentPrompt } from "./agentPrompt.js";

/**
 * Developer agent configuration schema
 */
const developerAgentConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "code analysis",
    "repository management",
    "pull request review",
    "dependency tracking",
    "documentation analysis",
    "web research"
  ]),
  maxRepoSize: z.number().positive().default(1000000), // 1MB default
  supportedLanguages: z.array(z.string()).default(["js", "ts", "py", "go", "java", "rs"]),
  codeQualityThreshold: z.number().min(0).max(10).default(7),
  enableSecurity: z.boolean().default(true),
  maxCommitHistory: z.number().positive().default(100),
});

/**
 * Development task result schema
 */
export const developmentTaskSchema = z.object({
  taskType: z.enum(['repository_analysis', 'code_review', 'bug_investigation', 'feature_planning', 'documentation']),
  repository: z.object({
    url: z.string().url(),
    name: z.string(),
    language: z.string(),
    stars: z.number().optional(),
    issues: z.number().optional(),
  }).optional(),
  findings: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    category: z.enum(['security', 'performance', 'maintainability', 'bug', 'enhancement']),
    description: z.string().min(1),
    file: z.string().optional(),
    line: z.number().optional(),
    recommendation: z.string().optional(),
  })),
  recommendations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type DevelopmentTask = z.infer<typeof developmentTaskSchema>;
export type DeveloperConfig = z.infer<typeof developerAgentConfigSchema>;

// Validate agent configuration
export const agentConfig = developerAgentConfigSchema.parse({
  capabilities: [
    "code analysis",
    "repository management",
    "pull request review",
    "dependency tracking",
    "documentation analysis",
    "web research"
  ],
  maxRepoSize: 2000000, // 2MB
  supportedLanguages: ["js", "ts", "py", "go", "java", "rs"],
  codeQualityThreshold: 8,
  enableSecurity: true,
  maxCommitHistory: 200,
});

export const developerAgent = new Agent({
  name: "developer",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Analyze code, manage repositories, and support development workflows.",
    context: `Max repo size: ${agentConfig.maxRepoSize}, Supported languages: ${agentConfig.supportedLanguages.join(', ')}, Code quality threshold: ${agentConfig.codeQualityThreshold}/10, Security: ${agentConfig.enableSecurity ? 'enabled' : 'disabled'}`,
    task: "Perform code analysis, manage repositories, and assist with development tasks.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    maxRepoSize: agentConfig.maxRepoSize,
    supportedLanguages: agentConfig.supportedLanguages,
    codeQualityThreshold: agentConfig.codeQualityThreshold,
    enableSecurity: agentConfig.enableSecurity,
    maxCommitHistory: agentConfig.maxCommitHistory,
     // Enable context sharing for task delegation
    enableContextSharing: true,
    // Enable additional features for data processing
    enableDataProcessing: true,
    maxSteps: 100, // Limit steps to prevent excessive memory usage
    // Enable additional features for development tasks
    // Additional memory options
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] developerAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
  tools: [githubTool, gitTool, urlFetchTool, webSearchTool],
});

/**
 * Generates text using the developerAgent's LLM.
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
    const result = await developerAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[developerAgent.generateText] Error:", error);
    throw error;
  }
};
