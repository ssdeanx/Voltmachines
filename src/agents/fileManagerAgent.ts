import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { 
  gitTool, 
  githubTool, 
  urlFetchTool
} from "../tools/index.js";
import { developmentHooks } from "./agentHooks.js";
import { globalMemory } from "../memory/index.js";

import type { OnEndHookArgs } from '@voltagent/core';

/**
 * File manager configuration schema
 */
const fileManagerConfigSchema = z.object({
  name: z.string().min(1),
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
  name: "file-manager",
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
export const fileManagerAgent = patchAgentMethods(new Agent({
  name: agentConfig.name,
  instructions: `You are a specialized file manager and version control agent with expertise in:

**Configuration:**
- Max file size: ${(agentConfig.maxFileSize / 1024 / 1024).toFixed(1)}MB
- Allowed extensions: ${agentConfig.allowedExtensions.join(', ')}
- Git branch limit: ${agentConfig.gitBranchLimit}
- Auto backup: ${agentConfig.enableAutoBackup ? 'enabled' : 'disabled'}
- Compression level: ${agentConfig.compressionLevel}/9

**Git Operations:**
- Repository initialization, cloning, and management
- Commit history analysis and branch management
- Merge conflict resolution and code review
- Tag and release management
- Remote repository synchronization

**GitHub Integration:**
- Repository creation, forking, and management
- Issue tracking and project management
- Pull request workflow and code review
- Release management and deployment
- GitHub Actions and CI/CD integration
- Organization and team management

**File System Management:**
- Intelligent file organization and structure
- Project scaffolding and template management
- Code analysis and dependency tracking
- Documentation generation and maintenance
- Backup and recovery strategies

**Best Practices:**
- Always check repository status before making changes
- Use descriptive commit messages following conventional commit format
- Maintain clean git history with proper branching strategies
- Ensure proper .gitignore and repository hygiene
- Follow semantic versioning for releases
- Document all significant changes and decisions

**Workflow Guidelines:**
1. Analyze current repository state before operations
2. Suggest appropriate git workflows for the project
3. Validate file operations against project structure
4. Provide clear explanations of version control actions
5. Offer rollback options for destructive operations
6. Maintain security best practices for sensitive files

Always explain your reasoning for file operations and git workflows. When working with repositories, prioritize data safety and provide clear documentation of changes.
All file operations must conform to fileOperationSchema and repository analysis to repositoryAnalysisSchema.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: globalMemory,
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] fileManagerAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
  tools: [gitTool, githubTool, urlFetchTool],
}));

export const generateText = async (prompt: string, options?: Record<string, unknown>) => {
  return fileManagerAgent.generateText(prompt, options);
}

// Add the agent as a subagent to the supervisor
// This also registers the relationship in AgentRegistry
