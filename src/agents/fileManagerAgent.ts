import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { 
  gitTool, 
  githubTool, 
  urlFetchTool
} from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { getAgentPrompt } from "./agentPrompt.js";

import type { OnEndHookArgs } from '@voltagent/core';

/**
 * File manager configuration schema
 */
const fileManagerConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "file system operations",
    "git operations",
    "repository analysis",
    "project structure management",
    "documentation processing",
    "web research"
  ]),
  maxFileSize: z.number().positive().default(10485760), // 10MB default
  allowedExtensions: z.array(z.string()).default(['.js', '.ts', '.json', '.md', '.txt', '.py', '.go']),
  gitBranchLimit: z.number().positive().default(50),
  enableAutoBackup: z.boolean().default(true),
  compressionLevel: z.number().min(0).max(9).default(6),
});

/**
 * File operation result schema
 */
export const fileOperationSchema = z.object({
  operation: z.enum(['create', 'read', 'update', 'delete', 'move', 'copy', 'git_commit', 'git_push', 'git_pull']),
  path: z.string().min(1),
  success: z.boolean(),
  size: z.number().optional(),
  encoding: z.string().optional(),
  hash: z.string().optional(),
  timestamp: z.string().datetime(),
  gitInfo: z.object({
    branch: z.string(),
    commit: z.string().optional(),
    status: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

/**
 * Repository analysis schema
 */
export const repositoryAnalysisSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  fileCount: z.number(),
  languages: z.record(z.string(), z.number()),
  branches: z.array(z.string()),
  commits: z.number(),
  lastCommit: z.string().datetime(),
  issues: z.array(z.object({
    id: z.number(),
    title: z.string(),
    state: z.enum(['open', 'closed']),
  })).optional(),
  contributors: z.array(z.string()).optional(),
});

export type FileOperation = z.infer<typeof fileOperationSchema>;
export type RepositoryAnalysis = z.infer<typeof repositoryAnalysisSchema>;
export type FileManagerConfig = z.infer<typeof fileManagerConfigSchema>;

// Validate agent configuration
const agentConfig = fileManagerConfigSchema.parse({
  capabilities: [
    "file system operations",
    "git operations",
    "repository analysis",
    "project structure management",
    "documentation processing",
    "web research"
  ],
  maxFileSize: 52428800, // 50MB
  allowedExtensions: ['.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.txt', '.py', '.go', '.rs', '.java'],
  gitBranchLimit: 100,
  enableAutoBackup: true,
  compressionLevel: 7,
});

/**
 * File Manager Agent - Specialized in version control and repository management
 * 
 * Capabilities:
 * - Git operations (clone, commit, push, pull, branch management)
 * - GitHub API interactions (repos, issues, PRs, releases)
 * - File system operations with version control awareness
 * - Repository analysis and code review
 * - Project structure management
 * - Documentation and markdown processing
 */
export const fileManagerAgent = new Agent({
  name: "file-manager",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Manage files, repositories, and version control workflows.",
    context: `Max file size: ${agentConfig.maxFileSize}, Allowed extensions: ${agentConfig.allowedExtensions.join(', ')}, Git branch limit: ${agentConfig.gitBranchLimit}`,
    task: "Perform file operations, manage repositories, and assist with version control.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",  
  memory: voltAgentMemory,
  memoryOptions: {
    maxFileSize: agentConfig.maxFileSize,
    allowedExtensions: agentConfig.allowedExtensions,
    gitBranchLimit: agentConfig.gitBranchLimit,
    enableAutoBackup: agentConfig.enableAutoBackup,
    compressionLevel: agentConfig.compressionLevel,
     // Enable context sharing for task delegation
    enableContextSharing: true,
    // Enable additional features for data processing
    enableDataProcessing: true,
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: {
    ...developmentHooks,

    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] fileManagerAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
  tools: [gitTool, githubTool, urlFetchTool],
});

/**
 * Generates text using the fileManagerAgent's LLM.
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
    const result = await fileManagerAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[fileManagerAgent.generateText] Error:", error);
    throw error;
  }
};


// Add the agent as a subagent to the supervisor
// This also registers the relationship in AgentRegistry
