import type { Page } from "playwright";
import type { ToolExecuteOptions, ToolExecutionContext } from "@voltagent/core";
import {
  ensureBrowser,
  resetBrowserState as resetBrowserStateInternal,
} from "./playwrightToolHandler.js";

/**
 * Safe browser operation function to handle errors consistently across all browser tools
 * This wraps operations with proper error handling and browser initialization using OperationContext.
 */
export async function safeBrowserOperation<T>(
  toolExecCtx: ToolExecuteOptions,
  operation: (page: Page) => Promise<T>,
): Promise<T> {
  try {
    const { page } = await ensureBrowser(toolExecCtx.operationContext!);
    return await operation(page);
  } catch (error) {
    const opId = toolExecCtx?.operationContext?.operationId || "unknown";
    console.error(`[${opId}] Browser operation failed:`, error);
    throw error;
  }
}

/**
 * Export the resetBrowserState function that now requires OperationContext.
 * Note: Tools calling this directly will need access to the context.
 */
export const resetBrowserState = async (context: ToolExecutionContext): Promise<void> => {
  await resetBrowserStateInternal(context.operationContext!);
};
