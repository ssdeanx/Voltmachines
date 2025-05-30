import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { getAgentPrompt } from "./agentPrompt.js";
// Import all browser tools from the tools index
import {
  navigationTool,
  goBackTool,
  goForwardTool,
  refreshPageTool,
  closeBrowserTool,
  screenshotTool,
  clickTool,
  typeTool,
  getTextTool,
  selectOptionTool,
  expectResponseTool,
  assertResponseTool,
  saveToFileTool,
  exportPdfTool,
  extractDataTool,
  getVisibleTextTool,
  getVisibleHtmlTool,
  listInteractiveElementsTool,
  getUserAgentTool,
} from "../tools/index.js";
import { z } from "zod";
import type { OnEndHookArgs } from '@voltagent/core';
/**
 * Browser agent configuration schema (advanced)
 */
export const browserAgentConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "web page navigation and interaction",
    "form filling and submission", 
    "element clicking, typing, and selection",
    "screenshot capture and visual analysis",
    "PDF generation and export",
    "data extraction from web pages",
    "file downloads and saves",
    "multi-tab browsing coordination",
    "network request monitoring"
  ]),
  maxSteps: z.number().positive().default(20),
  allowScreenshots: z.boolean().default(true),
  allowedDomains: z.array(z.string()).optional(),
  userAgent: z.string().optional(),
  headless: z.boolean().default(true),
  navigationTimeout: z.number().positive().default(30000),
  interactionTimeout: z.number().positive().default(10000),
  maxConcurrentTabs: z.number().positive().default(3),
  enableNetworkCapture: z.boolean().default(false),
  enablePdfExport: z.boolean().default(true),
  enableFileDownload: z.boolean().default(true),
  enableJavascript: z.boolean().default(true),
  defaultViewport: z.object({ width: z.number().positive(), height: z.number().positive() }).optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});

export type BrowserAgentConfig = z.infer<typeof browserAgentConfigSchema>;

// Validate agent configuration
const agentConfig = browserAgentConfigSchema.parse({
  capabilities: [
    "web page navigation and interaction",
    "form filling and submission", 
    "element clicking, typing, and selection",
    "screenshot capture and visual analysis",
    "PDF generation and export",
    "data extraction from web pages",
    "file downloads and saves",
    "multi-tab browsing coordination",
    "network request monitoring"
  ],
  maxSteps: 25,
  allowScreenshots: true,
  headless: process.env.NODE_ENV === 'production',
  navigationTimeout: 30000,
  interactionTimeout: 10000,
  maxConcurrentTabs: 3,
  enableNetworkCapture: false,
  enablePdfExport: true,
  enableFileDownload: true,
  enableJavascript: true,
  defaultViewport: { width: 1280, height: 720 },
});

export const browserAgent = new Agent({
  name: "BrowserAgent",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Automate browser tasks and assist with web interactions.",
    context: `Configuration - Max steps: ${agentConfig.maxSteps}, Screenshots: ${agentConfig.allowScreenshots ? 'enabled' : 'disabled'}, Headless: ${agentConfig.headless ? 'yes' : 'no'}, Navigation timeout: ${agentConfig.navigationTimeout}ms, Max tabs: ${agentConfig.maxConcurrentTabs}`,
    task: "Perform browser automation and report results.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    maxSteps: agentConfig.maxSteps,
    allowScreenshots: agentConfig.allowScreenshots,
    headless: agentConfig.headless,
    navigationTimeout: agentConfig.navigationTimeout,
    interactionTimeout: agentConfig.interactionTimeout,
    maxConcurrentTabs: agentConfig.maxConcurrentTabs,
    enableNetworkCapture: agentConfig.enableNetworkCapture,
    enablePdfExport: agentConfig.enablePdfExport,
    enableFileDownload: agentConfig.enableFileDownload,
    enableJavascript: agentConfig.enableJavascript,
    defaultViewport: agentConfig.defaultViewport,
    // Additional memory options
    // Enable additional features for data analysis
    enableContextSharing: true,
    enableDataProcessing: true,
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] browser-automation completed operation for conversation:`, conversationId || 'unknown');
    }
  },
  tools: [
    navigationTool,
    goBackTool,
    goForwardTool,
    refreshPageTool,
    closeBrowserTool,
    screenshotTool,
    clickTool,
    typeTool,
    getTextTool,
    selectOptionTool,
    expectResponseTool,
    assertResponseTool,
    saveToFileTool,
    exportPdfTool,
    extractDataTool,
    getVisibleTextTool,
    getVisibleHtmlTool,
    listInteractiveElementsTool,
    getUserAgentTool
  ]
});/**
 * Generates text using the browserAgent's LLM.
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
    const result = await browserAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[browserAgent.generateText] Error:", error);
    throw error;
  }
};
