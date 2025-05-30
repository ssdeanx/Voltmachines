// Main VoltAgent index file

import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);
export { z };

import { VoltAgent, Agent, VoltAgentExporter } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { initializeMCPTools } from "./tools/mcp.js";
import path from "node:path";
import { delegateTaskTool, getAvailableAgents } from "./tools/delegationTool.js";
import { agentRegistry } from "./agents/index.js";
import { developmentHooks } from "./agents/voltAgentHooks.js";
import { supervisorRetriever } from "./memory/supervisorRetriever.js";
import { voltAgentMemory } from "./memory/voltAgentMemory.js";
/**
 * VoltAgent system configuration schema
 */
const voltAgentConfigSchema = z.object({
  databaseUrl: z.string().min(1),
  authToken: z.string().optional(),
  tablePrefix: z.string().default("voltagent_memory"),
  storageLimit: z.number().positive().default(100),
  debug: z.boolean().default(true),
  telemetry: z.object({
    publicKey: z.string(),
    secretKey: z.string(),
    baseUrl: z.string(),
  }).optional(),
});

/**
 * Agent capability schema
 */
const agentCapabilitySchema = z.object({
  name: z.string(),
  agentName: z.string(),
  capabilities: z.array(z.string()),
  status: z.enum(['active', 'inactive', 'error']).default('active'),
  lastUsed: z.string().datetime().optional(),
});

// Remove supervisor config schema - not needed

/**
 * System status schema
 */
export const systemStatusSchema = z.object({
  timestamp: z.string().datetime(),
  status: z.enum(['healthy', 'degraded', 'critical']),
  agents: z.array(agentCapabilitySchema),
  memory: z.object({
    connected: z.boolean(),
    conversations: z.number(),
    totalMessages: z.number(),
  }),
  tools: z.object({
    mcpConnected: z.boolean(),
    toolCount: z.number(),
  }),
  performance: z.object({
    uptime: z.number(),
    avgResponseTime: z.number().optional(),
  }),
});

export type SystemStatus = z.infer<typeof systemStatusSchema>;
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;
export type VoltAgentConfig = z.infer<typeof voltAgentConfigSchema>;



const systemConfig = voltAgentConfigSchema.parse({
  databaseUrl: process.env.DATABASE_URL || "file:./.voltagent/memory.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
  tablePrefix: "voltagent_memory",
  storageLimit: 100,
  debug: true,
  telemetry: {
    publicKey: process.env.PRIVATE_KEY || '',
    secretKey: process.env.SECRET_KEY || '',
    baseUrl: process.env.BASE_URL || '',
  },
});

// Initialize MCP tools
const mcpTools = await initializeMCPTools();

// Create data directory for filesystem MCP if it doesn't exist
const dataDir = path.resolve("./data");
try {
  await import('fs').then(fs => fs.promises.mkdir(dataDir, { recursive: true }));
} catch (error) {
  console.warn('Could not create data directory:', error);
}

export const supervisorAgent = new Agent({
  name: "supervisor",
  instructions: `You are a supervisor agent that coordinates multiple specialized agents and has access to filesystem tools.

Available Subagents:
- dataAnalyst: Data analysis and statistics
- systemAdmin: System monitoring and administration
- contentCreator: Content generation and writing
- problemSolver: Problem solving and reasoning
- fileManager: File and repository management
- developer: Software development and code analysis

Your capabilities:
- Agent coordination and delegation via delegate_task tool
- File system operations (read, write, list files)
- Memory management and conversation context
- Task breakdown and workflow management

Your responsibilities:
1. Analyze incoming requests and determine which agent(s) should handle them
2. Use the delegate_task tool to hand off tasks to specialized subagents
3. Coordinate multi-agent workflows for complex requests
4. Use filesystem tools when file operations are needed
5. Maintain conversation context and memory
6. Synthesize results from multiple agents into coherent responses

Delegation Guidelines:
- Use delegate_task tool for specialized tasks that match agent expertise
- For data analysis tasks: delegate to 'dataAnalyst'
- For code/repository tasks: delegate to 'developer'
- For content creation: delegate to 'contentCreator'
- For file operations: delegate to 'fileManager'
- For system monitoring: delegate to 'systemAdmin'
- For complex problems: delegate to 'problemSolver'
- You can delegate to multiple agents simultaneously for comprehensive results

Always explain your reasoning for agent selection and provide clear task descriptions.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "gemini-2.5-flash-preview-05-20",
  tools: [...mcpTools, delegateTaskTool],
  memory: voltAgentMemory,
  subAgents: Object.values(agentRegistry),
  hooks: {
    ...developmentHooks,
    onStart: async ({ agent, context }) => {
      // Set a session ID for this supervisor operation
      const sessionId = `supervisor-session-${Date.now()}`;
      context.userContext.set("sessionId", sessionId);
      context.userContext.set("supervisorName", agent.name);
      
      console.log(`[🏛️ Supervisor] ${agent.name} starting operation with SessionID: ${sessionId}`);
      
      // Call the base hook
      if (developmentHooks.onStart) {
        await developmentHooks.onStart({ agent, context });
      }
    },
    onHandoff: async ({ agent, source }) => {
      console.log(`[🔄 Handoff] Supervisor delegating to ${agent.name}${source ? ` from ${source.name}` : ''}`);
      
      // The userContext will be automatically cloned to the sub-agent
      // No manual memory operations needed - VoltAgent handles this
      
      // Call the base hook if it exists
      if (developmentHooks.onHandoff) {
        await developmentHooks.onHandoff({ agent, source });
      }
    },
  },
  retriever: supervisorRetriever,
});

// Remove the broken test code that was causing issues
// This will be replaced with proper usage later

// Remove broken patching code for agent.llm and agent.model

// Enhanced VoltAgent with comprehensive features
const voltAgent = new VoltAgent({
  agents: {
    supervisor: supervisorAgent,
    ...agentRegistry,
  },
  // Telemetry and observability
  telemetryExporter: new VoltAgentExporter({
    publicKey: process.env.PRIVATE_KEY || '',
    secretKey: process.env.SECRET_KEY || '',
    baseUrl: process.env.BASE_URL || 'https://server.voltagent.dev',
  }),
});

function listAgents(): AgentCapability[] {
  // TODO: 2025-05-28 - getAvailableAgents() may not return AgentCapability[] directly, ensure correct typing or mapping if needed
  return getAvailableAgents() as AgentCapability[];
}

/**
 * Get comprehensive system status
 */
async function getSystemStatus(): Promise<SystemStatus> {
  const agents = listAgents();
  const conversations = await voltAgentMemory.getConversations('main-user');
  
  const status: SystemStatus = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    agents,
    memory: {
      connected: true,
      conversations: conversations.length,
      totalMessages: 0, // Calculate from conversations
    },
    tools: {
      mcpConnected: mcpTools.length > 0,
      toolCount: mcpTools.length,
    },
    performance: {
      uptime: process.uptime(),
    },
  };
  
  return systemStatusSchema.parse(status);
}

/**
 * VoltAgent Memory Best Practices (2025-05-30)
 * - Always provide userId and conversationId to agent calls for correct memory scoping and context continuity.
 * - Use the LibSQLStorage class to manage threads/conversations for each user.
 * - To start a new thread: call voltAgentMemory.startConversation(resourceId) and use the returned conversationId.
 * - To continue a thread: pass the same userId and conversationId to agent.generateText, stream
 *
 * Example usage:
 *   const conversationId = await voltAgentMemory.startConversation('supervisor');
 *   const response = await supervisorAgent.generateText('Hello', { userId: 'main-user', conversationId });
 */

// Export utilities for external use
export {
  voltAgent,
  agentRegistry,
  voltAgentMemory,
  listAgents,
  getSystemStatus,
  systemConfig,
};

// Re-export memory utilities
export { getOrStartThread, listThreads, getThreadHistory } from "./memory/voltAgentMemory.js";

// Development utilities
export const development = {
  /**
   * Test all agent capabilities with validation
   */
  async testAgents(): Promise<AgentCapability[]> {
    const agents = listAgents();
    console.log('📊 Available Agents and Capabilities:');
    agents.forEach((agent: AgentCapability) => {
      console.log(`  🤖 ${agent.name} (${agent.agentName}) - Status: ${agent.status}`);
      console.log(`     Capabilities: ${agent.capabilities.join(', ')}`);
    });
    return agents;
  },

  /**
   * Get conversation memory stats (list all conversations for main-user)
   */
  async getMemoryStats() {
    return await voltAgentMemory.getConversations('main-user');
  },

  /**
   * Get full system status with validation
   */
  async getSystemHealth(): Promise<SystemStatus> {
    return await getSystemStatus();
  },

  /**
   * Validate system configuration
   */
  validateConfig(): VoltAgentConfig {
    return systemConfig;
  },
};
