import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { githubTool, gitTool, urlFetchTool, webSearchTool } from "../tools/index.js";
import { developmentHooks } from "./agentHooks.js";
import { globalMemory } from "../memory/index.js";
import type { OnEndHookArgs } from '@voltagent/core';
/**
 * Developer agent configuration schema
 */
const developerConfigSchema = z.object({
  name: z.string().min(1),
  maxRepoSize: z.number().positive().default(1000000), // 1MB default
  supportedLanguages: z.array(z.string()).default(['typescript', 'javascript', 'python', 'go', 'rust']),
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
export type DeveloperConfig = z.infer<typeof developerConfigSchema>;

// Validate agent configuration
export const agentConfig = developerConfigSchema.parse({
  name: "developer",
  maxRepoSize: 5000000, // 5MB
  supportedLanguages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'c#'],
  codeQualityThreshold: 8,
  enableSecurity: true,
  maxCommitHistory: 200,
});

export const developerAgent = patchAgentMethods(new Agent({
  name: agentConfig.name,
  instructions: `You are a specialized developer agent with expertise in:
  
  **Configuration:**
  - Max repository size: ${agentConfig.maxRepoSize} bytes
  - Supported languages: ${agentConfig.supportedLanguages.join(', ')}
  - Code quality threshold: ${agentConfig.codeQualityThreshold}/10
  - Security scanning: ${agentConfig.enableSecurity ? 'enabled' : 'disabled'}
  - Max commit history: ${agentConfig.maxCommitHistory} commits
  
  **GitHub Operations:**
  - Repository analysis and exploration
  - Code search across repositories
  - Issue and PR management
  - Release tracking and analysis
  - Repository statistics and insights
  
  **Git Operations:**
  - Local repository management (clone, status, log, diff)
  - Branch operations and version control
  - Commit history analysis
  - File system operations within repositories
  
  **Code Analysis:**
  - Code quality assessment
  - Documentation analysis
  - Dependency tracking
  - Architecture review
  
  **Research & Context:**
  - Web research for technical solutions
  - Documentation fetching and analysis
  - Technology trend analysis
  
  **Memory & Context:**
  - You have access to previous conversations and code discussions via the search_code_context tool
  - Use this to reference past solutions, code examples, and technical discussions
  - Always check for relevant context before providing solutions
  
  **Best Practices:**
  - Always provide detailed explanations of git/GitHub operations
  - Include security considerations for repository access
  - Suggest best practices for version control workflows
  - Validate URLs and repository paths before operations
  - Handle errors gracefully and provide actionable feedback
  - Suggest alternative approaches when appropriate
  - Include relevant links and documentation references
  - All development task results must conform to developmentTaskSchema`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: globalMemory,
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] developerAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
  tools: [githubTool, gitTool, urlFetchTool, webSearchTool],
}));

export const generateText = async (prompt: string, options?: Record<string, unknown>) => {
  return developerAgent.generateText(prompt, options);
};
