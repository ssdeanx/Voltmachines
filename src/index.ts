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
import { getExaSearchTools, getWintermTools, getFilesystemTools, getGitingestTools, getMarkdownDownloaderTools } from "./tools/mcp.js";
import path from "node:path";
import { delegateTaskTool, getAvailableAgents } from "./tools/delegationTool.js";
import { supervisorToolset } from "./tools/supervisorTools.js";
import { agentRegistry } from "./agents/index.js";
import { developmentHooks } from "./agents/voltAgentHooks.js";
import { getAgentPrompt } from "./agents/agentPrompt.js";
import { supervisorRetriever } from "./memory/supervisorRetriever.js";
import { voltAgentMemory, getOrStartThread } from "./memory/voltAgentMemory.js";

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

// Build MCP tools for supervisor (filesystem, exa search, winterm, gitingest, markdown-downloader) before main initialization
const fsTools = await getFilesystemTools();
const exaSearchTools = await getExaSearchTools();
const wintermTools = await getWintermTools();
const gitingestTools = await getGitingestTools();
// Always use './data' as the root directory for markdown downloads
const markdownDownloaderTools = await getMarkdownDownloaderTools();
const mcpTools = [
  ...fsTools,
  ...exaSearchTools,
  ...wintermTools,
  ...gitingestTools,
  ...markdownDownloaderTools
];

// Create data directory for filesystem MCP if it doesn't exist
const dataDir = path.resolve("./data");
try {
  await import('fs').then(fs => fs.promises.mkdir(dataDir, { recursive: true }));
} catch (error) {
  console.warn('Could not create data directory:', error);
}

// Dynamically extract tool names for capabilities
const toolkitCapabilities = supervisorToolset.map(tool => tool.name);

/**
 * Supervisor agent configuration schema (extended)
 *
 * Includes explicit tool capability fields and unified data/markdown directory config.
 */
const supervisorConfigSchema = z.object({
  capabilities: z.array(z.string()).default(toolkitCapabilities),
  maxSubAgents: z.number().positive().default(15),
  delegationTimeout: z.number().positive().default(300000),
  enableFileSystem: z.boolean().default(true),
  enableMemoryManagement: z.boolean().default(true),
  enableTerminal: z.boolean().default(true),
  enableSearch: z.boolean().default(true),
  enableWindowsTerminal: z.boolean().default(true),
  enableMarkdownDownloader: z.boolean().default(true),
  enableGitingest: z.boolean().default(true),
  dataDirectory: z.string().default(path.resolve("./data")),
});

export type SupervisorConfig = z.infer<typeof supervisorConfigSchema>;

// Use the dynamic capabilities in the config
const supervisorConfig: SupervisorConfig = supervisorConfigSchema.parse({
  capabilities: toolkitCapabilities,
  maxSubAgents: 15,
  delegationTimeout: 300000,
  enableFileSystem: true,
  enableMemoryManagement: true,
  enableTerminal: true,
  enableSearch: true,
  enableWindowsTerminal: true,
  enableMarkdownDownloader: true,
  enableGitingest: true,
  dataDirectory: path.resolve("./data"),
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
    goal: `Act as the VoltMachines system's central orchestrator, autonomously coordinating, delegating, and executing complex multi-agent workflows. Leverage advanced tool access—including terminal, Windows terminal, web search, filesystem, markdown downloader, and gitingest—to deliver seamless, context-rich, and auditable results. Ensure all data, file, and markdown operations are unified in the ${supervisorConfig.dataDirectory} directory for maximum traceability, compliance, and operational efficiency. Proactively monitor agent health, optimize resource allocation, and enforce robust security and auditability across all actions.`,
    context: `Available tools: ${supervisorConfig.capabilities.join(', ')}. Subagents: dataAnalyst, systemAdmin, contentCreator, problemSolver, fileManager, developer, worker. Config: Max subagents: ${supervisorConfig.maxSubAgents}, Delegation timeout: ${supervisorConfig.delegationTimeout}ms, File system: ${supervisorConfig.enableFileSystem ? 'enabled' : 'disabled'}, Memory: ${supervisorConfig.enableMemoryManagement ? 'enabled' : 'disabled'}, Terminal: ${supervisorConfig.enableTerminal ? 'enabled' : 'disabled'}, Search: ${supervisorConfig.enableSearch ? 'enabled' : 'disabled'}, Windows terminal: ${supervisorConfig.enableWindowsTerminal ? 'enabled' : 'disabled'}, Markdown: ${supervisorConfig.enableMarkdownDownloader ? 'enabled' : 'disabled'}, Gitingest: ${supervisorConfig.enableGitingest ? 'enabled' : 'disabled'}. All persistent operations use ${supervisorConfig.dataDirectory}.`,
    task: `Continuously analyze user/system requests, select and delegate to the most appropriate specialized agents, and orchestrate workflows that may span terminal, search, markdown, git, and file operations. Manage memory and context for every operation, synthesize results into actionable outputs, and ensure all persistent data is stored in the unified directory. Proactively detect workflow bottlenecks, enforce security, and provide detailed audit trails for every action.`,
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "gemini-2.5-flash-preview-05-20",
  tools: [
    ...mcpTools,
    ...supervisorToolset,
    delegateTaskTool
  ],
  memory: voltAgentMemory,
  memoryOptions: {
    maxSubAgents: supervisorConfig.maxSubAgents,
    delegationTimeout: supervisorConfig.delegationTimeout,
    enableFileSystem: supervisorConfig.enableFileSystem,
    enableMemoryManagement: supervisorConfig.enableMemoryManagement,
    enableTerminal: supervisorConfig.enableTerminal,
    enableSearch: supervisorConfig.enableSearch,
    enableWindowsTerminal: supervisorConfig.enableWindowsTerminal,
    enableMarkdownDownloader: supervisorConfig.enableMarkdownDownloader,
    enableGitingest: supervisorConfig.enableGitingest,
    dataDirectory: supervisorConfig.dataDirectory,
    enableContextSharing: true,
    enableDataProcessing: true,
    enableAgentCoordination: true,
    maxSteps: 100,
    maxContextLength: 1000000,
    thinkingTokens: 1024,
    storageLimit: 5000,
    storageType: "voltage",
    // Add future-proofing for advanced memory/trace features
    enableAuditTrail: true,
    enableWorkflowTracing: true,
    enableCacheManager: true,
    enableDataValidator: true,
    enableLogAnalyzer: true,
    enableConfigManager: true,
    enableSecretManager: true,
    enableNotificationSystem: true,
    enableBatchProcessor: true,
    enableQueueManager: true,
    enableResourceMonitor: true,
    enableTaskScheduler: true,
    enableThink: true,
    enableAnalyze: true,
    enableReflect: true,
    enableSummarize: true,
    enablePlan: true,
    enableDataVersioning: true,
    enableSystemHealth: true,
    toolkitCapabilities: supervisorConfig.capabilities,
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
 * Generates a structured object using the supervisorAgent's LLM and Zod schema validation.
 *
 * @param prompt - The prompt string to send to the agent.
 * @param schema - Zod schema describing the expected object structure.
 * @param options - Optional generation options.
 * @returns Promise resolving to the generated object.
 * @throws If object generation or validation fails.
 *
 * @example
 *
 * const result = await generateObject(
 *   "Summarize the project status as an object.",
 *   z.object({ summary: z.string(), status: z.enum(["healthy", "degraded", "critical"]) })
 * );
 * console.log(result.object);
 */
export const generateObject = async <T>(
  prompt: string,
  schema: import("zod").ZodSchema<T>,
  options?: Record<string, unknown>
): Promise<{ object: T; usage?: unknown }> => {
  try {
    const result = await supervisorAgent.generateObject(prompt, schema, options);
    return result;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[supervisorAgent.generateObject] Error:", error);
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
      totalMessages: 0 // Calculate from conversations
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

// Import readline properly
import readline from 'readline';

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

/**
 * Interactive chat function using streamText for real-time responses with the supervisor agent
 * 
 * @param input - User input message
 * @param options - Optional parameters like userId and conversationId
 * @returns Promise resolving when the streaming is complete
 * 
 * @example
 * 
 * // Simple chat interaction
 * await chat("Hello, analyze the project structure");
 * 
 * // Persistent conversation
 * const conversationId = await getOrStartThread('main-user');
 * await chat("Create a data analysis report", { 
 *   userId: 'main-user', 
 *   conversationId 
 * });
 * 
 */
export async function chat(
  input: string, 
  options: { userId?: string; conversationId?: string } = {}
): Promise<void> {
  try {
    console.log(`\n🧑 User: ${input}`);
    
    // Ensure we have a conversation ID
    const conversationId = options.conversationId || await getOrStartThread('supervisor');
    const userId = options.userId || 'main-user';
    
    console.log(`🏛️ Supervisor: `, ''); // Start on same line for streaming
    
    // Use supervisor agent with streaming and proper memory context
    const stream = await supervisorAgent.streamText(input, {
      userId,
      conversationId
    });

    // Stream the response in real-time
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk); // Real-time output without newlines
    }
    console.log('\n'); // Add newline when complete
    
    console.log(`💾 Conversation saved to thread: ${conversationId}\n`);
    
  } catch (error) {
    console.error('❌ Chat Error:', error);
    throw error;
  }
}

/**
 * Chat directly with a specific agent using streamText
 * 
 * @param agentName - Name of the agent from the registry
 * @param input - User input message
 * @param options - Optional parameters like userId and conversationId
 * @returns Promise resolving when the streaming is complete
 * 
 * @example
 * 
 * // Chat with data analyst
 * await chatWithAgent('dataAnalyst', 'Analyze the sales data');
 * 
 * // Chat with browser agent
 * await chatWithAgent('browser', 'Navigate to google.com and take a screenshot');
 * 
 */
export async function chatWithAgent(
  agentName: string,
  input: string,
  options: { userId?: string; conversationId?: string } = {}
): Promise<void> {
  try {
    const agent = agentRegistry[agentName as keyof typeof agentRegistry];
    
    if (!agent) {
      console.error(`❌ Agent '${agentName}' not found. Available agents:`, Object.keys(agentRegistry));
      return;
    }
    
    console.log(`\n🧑 User: ${input}`);
    
    // Ensure we have a conversation ID for this agent
    const conversationId = options.conversationId || await getOrStartThread(agentName);
    const userId = options.userId || 'main-user';
    
    console.log(`🤖 ${agentName}: `, ''); // Start on same line for streaming
    
    // Always use streamText for all agents
    const stream = await agent.streamText(input, {
      userId,
      conversationId
    });

    // Stream the response in real-time
    for await (const chunk of stream.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
    
    console.log(`💾 Conversation saved to ${agentName} thread: ${conversationId}\n`);
    
  } catch (error) {
    console.error(`❌ Error chatting with ${agentName}:`, error);
    throw error;
  }
}

/**
 * Interactive CLI chat session with agent selection
 * 
 * Provides a full interactive command-line chat interface where users can:
 * - Chat with the supervisor (default)
 * - Switch to specific agents using commands like "/agent dataAnalyst"
 * - View available agents with "/agents"
 * - Exit with "/exit"
 * 
 * @param startingAgent - Initial agent to chat with (default: 'supervisor')
 * 
 * @example
 * 
 * // Start interactive chat session
 * await startChatSession();
 * 
 * // Start with a specific agent
 * await startChatSession('dataAnalyst');
 * 
 */
export async function startChatSession(startingAgent: string = 'supervisor'): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let currentAgent = startingAgent;
  let conversationId = await getOrStartThread(currentAgent);
  
  console.log('🤖 VoltAgent Multi-Agent Chat Started!');
  console.log('📋 Commands:');
  console.log('  /agent <name>  - Switch to specific agent');
  console.log('  /agents        - List available agents');
  console.log('  /status        - Show system status');
  console.log('  /exit          - Quit chat session');
  console.log(`\n🎯 Current Agent: ${currentAgent}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const askQuestion = () => {
    rl.question('You: ', async (input: string) => {
      try {
        // Handle commands
        if (input.startsWith('/')) {
          const [command, ...args] = input.slice(1).split(' ');
          
          switch (command.toLowerCase()) {
            case 'exit': {
              console.log('👋 Goodbye!');
              rl.close();
              return;
            }
              
            case 'agent': {
              const agentName = args[0];
              if (agentName && agentRegistry[agentName as keyof typeof agentRegistry]) {
                currentAgent = agentName;
                conversationId = await getOrStartThread(currentAgent);
                console.log(`🔄 Switched to ${agentName} agent\n`);
              } else if (agentName === 'supervisor') {
                currentAgent = 'supervisor';
                conversationId = await getOrStartThread('supervisor');
                console.log(`🔄 Switched to supervisor agent\n`);
              } else {
                console.log(`❌ Agent '${agentName}' not found. Available agents:`, 
                  ['supervisor', ...Object.keys(agentRegistry)]);
              }
              break;
            }
              
            case 'agents': {
              console.log('📋 Available Agents:');
              console.log('  🏛️ supervisor - Main orchestrator');
              Object.keys(agentRegistry).forEach(name => {
                console.log(`  🤖 ${name}`);
              });
              console.log('');
              break;
            }
              
            case 'status': {
              const status = await getSystemStatus();
              console.log('📊 System Status:', status.status);
              console.log(`💾 Conversations: ${status.memory.conversations}`);
              console.log(`🛠️ Tools: ${status.tools.toolCount}`);
              console.log(`⚡ Uptime: ${Math.round(status.performance.uptime)}s\n`);
              break;
            }
              
            default: {
              console.log(`❌ Unknown command: /${command}`);
              console.log('📋 Available commands: /agent, /agents, /status, /exit\n');
            }
          }
          
          askQuestion();
          return;
        }

        // Regular chat input
        if (currentAgent === 'supervisor') {
          await chat(input, { 
            userId: 'main-user', 
            conversationId 
          });
        } else {
          await chatWithAgent(currentAgent, input, { 
            userId: 'main-user', 
            conversationId 
          });
        }
        
      } catch (error) {
        console.error('❌ Error:', error);
      }

      askQuestion(); // Continue the conversation
    });
  };

  askQuestion();
}

/**
 * Quick test function to verify all agents are working with streamText
 * 
 * @returns Promise resolving when all agent tests are complete
 * 
 * @example
 * 
 * // Test all agents
 * await testAllAgents();
 * 
 */
export async function testAllAgents(): Promise<void> {
  console.log('🧪 Testing all agents with streamText...\n');
  
  // Test supervisor
  console.log('🏛️ Testing Supervisor Agent:');
  await chat('Hello, can you introduce yourself?');
  
  // Test each agent
  const agents = Object.keys(agentRegistry);
  for (const agentName of agents) {
    console.log(`🤖 Testing ${agentName} Agent:`);
    await chatWithAgent(agentName, `Hello, I'm testing the ${agentName} agent. Can you introduce yourself and your capabilities?`);
  }
  
  console.log('✅ All agent tests completed!\n');
}

/**
 * Quick CLI command examples for testing the streamText functionality
 * 
 * Use these commands to quickly test your agents:
 * 
 * @example
 * 
 * // Test supervisor chat
 * node -e "import('./dist/index.js').then(m => m.chat('Hello, can you help me analyze some data?'))"
 * 
 * // Test specific agent
 * node -e "import('./dist/index.js').then(m => m.chatWithAgent('dataAnalyst', 'Analyze the sales trends'))"
 * 
 * // Start interactive session
 * node -e "import('./dist/index.js').then(m => m.startChatSession())"
 * 
 * // Test all agents
 * node -e "import('./dist/index.js').then(m => m.testAllAgents())"
 * 
 */
