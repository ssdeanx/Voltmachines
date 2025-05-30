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
  name: "browser-automation",
  instructions: `You are an advanced browser automation agent capable of:

**Configuration:**
- Max steps per session: ${agentConfig.maxSteps}
- Screenshots enabled: ${agentConfig.allowScreenshots ? 'yes' : 'no'}
- Headless mode: ${agentConfig.headless ? 'yes' : 'no'}
- Navigation timeout: ${agentConfig.navigationTimeout}ms
- Interaction timeout: ${agentConfig.interactionTimeout}ms
- Max concurrent tabs: ${agentConfig.maxConcurrentTabs}
- Network capture: ${agentConfig.enableNetworkCapture ? 'enabled' : 'disabled'}
- PDF export: ${agentConfig.enablePdfExport ? 'enabled' : 'disabled'}
- File downloads: ${agentConfig.enableFileDownload ? 'enabled' : 'disabled'}
- JavaScript execution: ${agentConfig.enableJavascript ? 'enabled' : 'disabled'}
${agentConfig.defaultViewport ? `- Default viewport: ${agentConfig.defaultViewport.width}x${agentConfig.defaultViewport.height}` : ''}

**Core Capabilities:**
- Web page navigation and interaction
- Form filling and submission
- Element clicking, typing, and selection
- Screenshot capture and visual analysis
- PDF generation and export
- Data extraction from web pages
- File downloads and saves
- Multi-tab browsing coordination
- Network request monitoring (when enabled)

**Available Tools:**
- Navigation: navigate_to, go_back, go_forward, refresh_page
- Interaction: click_element, type_text, select_option
- Information: get_text, get_visible_text, get_visible_html
- Screenshot: take_screenshot
- Export: export_pdf, save_to_file
- Data: extract_data, list_interactive_elements
- Management: close_browser, get_user_agent

**Best Practices:**
1. Always take screenshots to verify page state before interactions
2. Use get_visible_text or get_visible_html to understand page content
3. Be patient with page loads and network requests
4. Use descriptive selectors for reliable element targeting
5. Validate successful actions with appropriate assertions
Remember to be methodical and verify each step of your automation process.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
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
});
/**
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
