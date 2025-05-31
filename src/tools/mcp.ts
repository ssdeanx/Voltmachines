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
 * Exa Search MCP Server Configuration
 * Provides integration with Exa Search external tools via MCP
 * Uses only the API key, not a full URL
 */
export const exaSearchMCP = new MCPConfiguration({
  servers: {
    exa: {
      type: "http",
      url: `https://server.smithery.ai/exa/mcp?api_key=${process.env.SMITHERY_URL_API}`,
    },
  },
});

/**
 * Get Exa Search MCP tools
 * Returns tools for Exa Search operations via MCP
 */
export async function getExaSearchTools() {
  try {
    return await exaSearchMCP.getTools();
  } catch (error) {
    console.warn('Failed to initialize Exa Search MCP tools:', error);
    return [];
  }
}

/**
 * Winterm MCP Server Configuration
 * Provides integration with Winterm tools via MCP
 * Uses the API key from the environment variable
 */
export const wintermMCP = new MCPConfiguration({
  servers: {
    winterm: {
      type: "stdio",
      command: "npx",
      args: [
        "-y",
        "@smithery/cli@latest",
        "run",
        "@capecoma/winterm-mcp",
        "--key",
        process.env.SMITHERY_URL_API || ""
      ]
    }
  }
});

/**
 * Get Winterm MCP tools
 * Returns tools for Winterm operations via MCP
 */
export async function getWintermTools() {
  try {
    return await wintermMCP.getTools();
  } catch (error) {
    console.warn('Failed to initialize Winterm MCP tools:', error);
    return [];
  }
}

/**
 * Gitingest MCP Server Configuration
 * Provides integration with Gitingest external tools via MCP
 */
export const gitingestMCP = new MCPConfiguration({
  servers: {
    gitingest: {
      type: "http",
      url: `https://server.smithery.ai/@puravparab/gitingest-mcp/mcp?api_key=${process.env.SMITHERY_URL_API}`,
    },
  },
});

/**
 * Get Gitingest MCP tools
 * Returns tools for Gitingest operations via MCP
 */
export async function getGitingestTools() {
  try {
    return await gitingestMCP.getTools();
  } catch (error) {
    console.warn('Failed to initialize Gitingest MCP tools:', error);
    return [];
  }
}

/**
 * Markdown Downloader MCP Server Configuration
 * Provides integration with Markdown Downloader external tools via MCP
 *
 * Exposes tool definitions for:
 * - download_markdown: Download a webpage as markdown (with url, subdirectory)
 * - list_downloaded_files: List all downloaded markdown files (with optional subdirectory)
 * - set_download_directory: Set the main local download folder (directory)
 * - get_download_directory: Get the current download directory
 * - create_subdirectory: Create a new subdirectory in the root download folder (name)
 *
 * @param savePath - Optional absolute or relative file path where markdown should be saved
 * @returns Array of Markdown Downloader tools with save location support
 */
export const markdownDownloaderMCP = new MCPConfiguration({
  servers: {
    markdownDownloader: {
      type: "http",
      url: `https://server.smithery.ai/@dazeb/markdown-downloader/mcp?api_key=${process.env.SMITHERY_URL_API}&rootDir=${encodeURIComponent(path.resolve("./data"))}`,
    },
  },
});

/**
 * Get Markdown Downloader MCP tools
 * Returns tools for Markdown Downloader operations via MCP
 *
 * @param savePath - Optional subdirectory or file path for saving markdown
 * @returns Array of Markdown Downloader tools with save location support
 */
export async function getMarkdownDownloaderTools(savePath?: string) {
  try {
    if (savePath) {
      // Pass savePath as a query param if provided, always use ./data as rootDir
      const customMCP = new MCPConfiguration({
        servers: {
          markdownDownloader: {
            type: "http",
            url: `https://server.smithery.ai/@dazeb/markdown-downloader/mcp?api_key=${process.env.SMITHERY_URL_API}&rootDir=${encodeURIComponent(path.resolve("./data"))}&savePath=${encodeURIComponent(savePath)}`,
          },
        },
      });
      return await customMCP.getTools();
    }
    return await markdownDownloaderMCP.getTools();
  } catch (error) {
    console.warn('Failed to initialize Markdown Downloader MCP tools:', error);
    return [];
  }
}

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
  
  // Add Exa Search tools
  const exaSearchTools = await getExaSearchTools();
  tools.push(...exaSearchTools);
  
  // Add Winterm tools
  const wintermTools = await getWintermTools();
  tools.push(...wintermTools);
  
  // Add Gitingest tools
  const gitingestTools = await getGitingestTools();
  tools.push(...gitingestTools);
  
  // Add Markdown Downloader tools
  const markdownDownloaderTools = await getMarkdownDownloaderTools();
  tools.push(...markdownDownloaderTools);
  
  console.log(`🛠️  Initialized ${tools.length} MCP tools (${fsTools.length} filesystem, ${exaSearchTools.length} exa search, ${wintermTools.length} winterm, ${gitingestTools.length} gitingest, ${markdownDownloaderTools.length} markdown-downloader)`);
  
  return tools;
}

// Generated on 2025-05-29
// TODO: 2025-05-29 - Add more MCP servers (web search, databases) if needed
