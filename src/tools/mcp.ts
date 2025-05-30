import { MCPConfiguration } from "@voltagent/core";
import path from "node:path";
import { z } from "zod";

/**
 * MCP (Model Context Protocol) Configuration for VoltAgent
 * Provides filesystem access, Composio integrations, and other external tool integrations
 */

/**
 * Composio configuration schema for validation
 */
const composioConfigSchema = z.object({
  apiKey: z.string().min(1, "COMPOSIO_API_KEY is required"),
  baseUrl: z.string().url().optional(),
  enabledApps: z.array(z.string()).default([]),
});

export type ComposioConfig = z.infer<typeof composioConfigSchema>;

/**
 * Validate and get Composio configuration from environment
 */
//function getComposioConfig(): ComposioConfig | null {
//  try {
//    const config = composioConfigSchema.parse({
//      apiKey: process.env.COMPOSIO_API_KEY,
//      enabledApps: process.env.COMPOSIO_ENABLED_APPS?.split(',') || undefined,
//    });
//    return config;
//  } catch (error) {
//    console.warn('Composio configuration invalid or missing:', error instanceof z.ZodError ? error.errors : error);
//    return null;
//  }
//}

/**
 * Filesystem MCP Server Configuration
 * Provides tools for reading, writing, and managing files
 */
export const filesystemMCP = new MCPConfiguration({
  servers: {
    filesystem: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", path.resolve("./data")]
    },
  },
});

/**
 * Composio MCP Server Configuration
 * Provides integration with 100+ external apps (GitHub, Gmail, Slack, etc.)
 */
//export const composioMCP = new MCPConfiguration({
//  servers: {
//    composio: {
//      type: "stdio", 
//      command: "npx",
//      args: ["-y", "@composio/mcp"],      env: {
//        COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY || "",
//        // Add enabled apps if specified
//        ...(process.env.COMPOSIO_ENABLED_APPS && { COMPOSIO_APPS: process.env.COMPOSIO_ENABLED_APPS }),
//      }
//    },
//  },
//});

/**
 * Get Composio MCP tools
 * Returns tools for external app integrations (GitHub, Gmail, Slack, etc.)
 */
//export async function getComposioTools() {
//  const config = getComposioConfig();
//  if (!config) {
//    console.warn('Composio configuration not available, skipping Composio tools');
//    return [];
//  }

//  try {
//    console.log(`🔌 Initializing Composio MCP with apps: ${config.enabledApps.join(', ')}`);
//    return await composioMCP.getTools();
//  } catch (error) {
//    console.warn('Failed to initialize Composio MCP tools:', error);
//    return [];
//  }
//}

/**
 * Get filesystem MCP tools
 * Returns tools for file operations: read, write, list, create directories
 */
export async function getFilesystemTools() {
  try {
    return await filesystemMCP.getTools();
  } catch (error) {
    console.warn('Failed to initialize filesystem MCP tools:', error);
    return [];
  }
}

/**
 * Initialize all MCP configurations
 * Sets up filesystem, Composio, and other external tool integrations
 */
export async function initializeMCPTools() {
  const tools = [];
  
  // Add filesystem tools
  const fsTools = await getFilesystemTools();
  tools.push(...fsTools);
  
  // Add Composio tools (GitHub, Gmail, Slack, etc.)
  //const composioTools = await getComposioTools();
  //tools.push(...composioTools);
  
  console.log(`🛠️  Initialized ${tools.length} MCP tools (${fsTools.length} filesystem)`);
  
  return tools;
}

// Generated on 2025-05-29
// TODO: 2025-05-29 - Add more MCP servers (web search, databases) if needed
