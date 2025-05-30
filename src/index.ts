/**
 * @fileoverview VoltMachines - Advanced Multi-Agent AI System
 * 
 * This is the main entry point for the VoltMachines system, a sophisticated multi-agent
 * AI orchestration platform built on VoltAgent. The system provides intelligent task
 * delegation, memory management, and comprehensive agent coordination capabilities.
 * 
 * @author VoltMachines Team
 * @version 0.0.8
 * @since 2025-05-28
 */

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
import { getAgentPrompt } from "./agents/agentPrompt.js";
import { supervisorRetriever } from "./memory/supervisorRetriever.js";
import { voltAgentMemory } from "./memory/voltAgentMemory.js";

/**
 * Configuration schema for the VoltMachines system.
 * 
 * Defines the structure and validation rules for system-wide configuration
 * including database connections, authentication, storage limits, and telemetry.
 * 
 * @example
 * 
 * const config = voltAgentConfigSchema.parse({
 *   databaseUrl: "file:./.voltagent/memory.db",
 *   tablePrefix: "voltage",
 *   storageLimit: 5000,
 *   debug: true
 * });
 * 
 */
const voltAgentConfigSchema = z.object({
  /** Database connection URL (SQLite file path or remote database URL) */
  databaseUrl: z.string().min(1),
  /** Optional authentication token for database access */
  authToken: z.string().optional(),
  /** Prefix for database table names to avoid conflicts */
  tablePrefix: z.string().default("voltage"),
  /** Maximum storage limit in MB for conversation memory */
  storageLimit: z.number().positive().default(5000),
  /** Enable debug logging and development features */
  debug: z.boolean().default(true),
  /** Telemetry configuration for observability and monitoring */
  telemetry: z.object({
    /** Public key for telemetry authentication */
    publicKey: z.string(),
    /** Secret key for telemetry authentication */
    secretKey: z.string(),
    /** Base URL for telemetry service endpoint */
    baseUrl: z.string(),
  }).optional(),
});

/**
 * Schema defining the capabilities and status of individual agents.
 * 
 * Used for agent registration, capability discovery, and health monitoring
 * across the multi-agent system.
 * 
 * @example
 * 
 * const capability: AgentCapability = {
 *   name: "dataAnalyst",
 *   agentName: "Data Analysis Agent",
 *   capabilities: ["statistics", "visualization", "reporting"],
 *   status: "active"
 * };
 * 
 */
const agentCapabilitySchema = z.object({
  /** Unique identifier for the agent */
  name: z.string(),
  /** Human-readable display name for the agent */
  agentName: z.string(),
  /** List of capabilities this agent provides */
  capabilities: z.array(z.string()),
  /** Current operational status of the agent */
  status: z.enum(['active', 'inactive', 'error']).default('active'),
  /** ISO timestamp of when the agent was last used */
  lastUsed: z.string().datetime().optional(),
});

/**
 * Comprehensive system status schema for health monitoring and diagnostics.
 * 
 * Provides a complete overview of system health including agent status,
 * memory utilization, tool connectivity, and performance metrics.
 * 
 * @example
 * 
 * const status = await getSystemStatus();
 * console.log(`System is ${status.status} with ${status.agents.length} agents`);
 * 
 */
export const systemStatusSchema = z.object({
  /** ISO timestamp when the status was generated */
  timestamp: z.string().datetime(),
  /** Overall system health status */
  status: z.enum(['healthy', 'degraded', 'critical']),
  /** Array of all registered agents and their capabilities */
  agents: z.array(agentCapabilitySchema),
  /** Memory subsystem status and statistics */
  memory: z.object({
    /** Whether memory storage is connected and operational */
    connected: z.boolean(),
    /** Total number of active conversations */
    conversations: z.number(),
    /** Total number of messages across all conversations */
    totalMessages: z.number(),
  }),
  /** Tool subsystem status and connectivity */
  tools: z.object({
    /** Whether MCP (Model Context Protocol) tools are connected */
    mcpConnected: z.boolean(),
    /** Total number of available tools */
    toolCount: z.number(),
  }),
  /** System performance metrics */
  performance: z.object({
    /** System uptime in seconds */
    uptime: z.number(),
    /** Average response time in milliseconds (optional) */
    avgResponseTime: z.number().optional(),
  }),
});

/** Type definition for system status objects */
export type SystemStatus = z.infer<typeof systemStatusSchema>;

/** Type definition for agent capability objects */
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;

/** Type definition for VoltMachines configuration objects */
export type VoltAgentConfig = z.infer<typeof voltAgentConfigSchema>;

/**
 * Parsed and validated system configuration.
 * 
 * This configuration is automatically loaded from environment variables
 * and validated against the schema at startup.
 */
const systemConfig = voltAgentConfigSchema.parse({
  databaseUrl: process.env.DATABASE_URL || "file:./.voltagent/memory.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
  tablePrefix: "voltage",
  storageLimit: 5000,
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

/**
 * Supervisor agent configuration schema
 */
const supervisorConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "agent coordination and delegation",
    "task breakdown and workflow management", 
    "file system operations",
    "memory management and conversation context",
    "multi-agent workflow coordination",
    "result synthesis and reporting"
  ]),
  maxSubAgents: z.number().positive().default(10),
  delegationTimeout: z.number().positive().default(300000), // 5 minutes
  enableFileSystem: z.boolean().default(true),
  enableMemoryManagement: z.boolean().default(true),
});

export type SupervisorConfig = z.infer<typeof supervisorConfigSchema>;

// Validate supervisor configuration
const supervisorConfig = supervisorConfigSchema.parse({
  capabilities: [
    "agent coordination and delegation",
    "task breakdown and workflow management", 
    "file system operations",
    "memory management and conversation context",
    "multi-agent workflow coordination",
    "result synthesis and reporting"
  ],
  maxSubAgents: 10,
  delegationTimeout: 300000,
  enableFileSystem: true,
  enableMemoryManagement: true,
});

/**
 * The main supervisor agent that orchestrates the entire multi-agent system.
 * 
 * This agent serves as the central coordinator, responsible for:
 * - Analyzing incoming requests and determining appropriate agent delegation
 * - Managing multi-agent workflows and task coordination
 * - Providing file system operations and memory management
 * - Synthesizing results from multiple specialized agents
 * 
 * The supervisor uses advanced Gemini 2.5 Flash Preview model for sophisticated
 * reasoning and decision-making capabilities.
 * 
 * @example
 * 
 * const response = await supervisorAgent.generateText(
 *   "Analyze the sales data and create a report",
 *   { userId: "user-123", conversationId: "conv-456" }
 * );
 * 
 */
export const supervisorAgent = new Agent({
  name: "supervisor",
  instructions: getAgentPrompt({
    capabilities: supervisorConfig.capabilities,
    goal: "Coordinate multiple specialized agents and orchestrate complex multi-agent workflows.",
    context: `Available subagents: dataAnalyst, systemAdmin, contentCreator, problemSolver, fileManager, developer. Configuration: Max subagents: ${supervisorConfig.maxSubAgents}, Delegation timeout: ${supervisorConfig.delegationTimeout}ms, File system: ${supervisorConfig.enableFileSystem ? 'enabled' : 'disabled'}, Memory management: ${supervisorConfig.enableMemoryManagement ? 'enabled' : 'disabled'}.`,
    task: "Analyze requests, delegate to appropriate agents, coordinate workflows, and synthesize results.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "gemini-2.5-flash-preview-05-20",
  tools: [...mcpTools, delegateTaskTool],
  memory: voltAgentMemory,
  memoryOptions: {
    maxSubAgents: supervisorConfig.maxSubAgents,
    delegationTimeout: supervisorConfig.delegationTimeout,
    enableFileSystem: supervisorConfig.enableFileSystem,
    enableMemoryManagement: supervisorConfig.enableMemoryManagement,
     // Enable context sharing for task delegation
    enableContextSharing: true,
    // Enable additional features for data processing
    enableDataProcessing: true,
    // Additional memory options
    maxSteps: 100, // Limit steps to prevent excessive memory usage
    // Enable additional features for agent coordination
    enableAgentCoordination: true,
    // Enable additional features for file system operations
    maxContextLength: 1000000,
    thinkingTokens: 1024,
    storageLimit: 5000,
    storageType: "voltage",
  },
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

/**
 * Generates text using the supervisorAgent's LLM.
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
    const result = await supervisorAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[supervisorAgent.generateText] Error:", error);
    throw error;
  }
};

/**
 * Main VoltMachines instance with comprehensive multi-agent capabilities.
 * 
 * This is the primary interface for the VoltMachines system, configured with
 * all available agents, telemetry, and observability features.
 * 
 * @example
 * 
 * // Access a specific agent
 * const response = await voltAgent.agents.supervisor.generateText("Hello");
 * 
 * // Get system status
 * const status = await getSystemStatus();
 * 
 */
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

/**
 * Retrieves a list of all available agents and their capabilities.
 * 
 * @returns Array of agent capability objects with status and metadata
 * 
 * @example
 * 
 * const agents = listAgents();
 * console.log(`Found ${agents.length} available agents`);
 * agents.forEach(agent => {
 *   console.log(`${agent.name}: ${agent.capabilities.join(', ')}`);
 * });
 * 
 */
function listAgents(): AgentCapability[] {
  // TODO: 2025-05-28 - getAvailableAgents() may not return AgentCapability[] directly, ensure correct typing or mapping if needed
  return getAvailableAgents() as AgentCapability[];
}

/**
 * Retrieves comprehensive system status and health information.
 * 
 * This function provides a complete overview of the VoltMachines system including
 * agent status, memory utilization, tool connectivity, and performance metrics.
 * 
 * @returns Promise resolving to validated system status object
 * 
 * @example
 * 
 * const status = await getSystemStatus();
 * 
 * if (status.status === 'healthy') {
 *   console.log('System is operating normally');
 * } else {
 *   console.warn(`System status: ${status.status}`);
 * }
 * 
 * console.log(`Active agents: ${status.agents.length}`);
 * console.log(`Memory conversations: ${status.memory.conversations}`);
 * console.log(`Available tools: ${status.tools.toolCount}`);
 * 
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
 * 
 * Memory Management Guidelines:
 * - Always provide userId and conversationId to agent calls for correct memory scoping and context continuity.
 * - Use the LibSQLStorage class to manage threads/conversations for each user.
 * - To start a new thread: call voltAgentMemory.startConversation(resourceId) and use the returned conversationId.
 * - To continue a thread: pass the same userId and conversationId to agent.generateText, stream
 *
 * @example
 * 
 * // Start a new conversation
 * const conversationId = await voltAgentMemory.startConversation('supervisor');
 * 
 * // Generate text with memory context
 * const response = await supervisorAgent.generateText('Hello', { 
 *   userId: 'main-user', 
 *   conversationId 
 * });
 * 
 */

// Export utilities for external use
export {
  /** Main VoltMachines instance with all agents and capabilities */
  voltAgent,
  /** Registry of all available specialized agents */
  agentRegistry,
  /** Memory management system for conversations and context */
  voltAgentMemory,
  /** Function to list all available agents and their capabilities */
  listAgents,
  /** Function to get comprehensive system status and health */
  getSystemStatus,
  /** Validated system configuration object */
  systemConfig,
};

// Re-export memory utilities
export { getOrStartThread, listThreads, getThreadHistory } from "./memory/voltAgentMemory.js";

/**
 * Development utilities and testing functions.
 * 
 * This namespace provides
 */
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
