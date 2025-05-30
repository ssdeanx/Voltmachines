/**
 * VoltAgent Development Hooks
 * Clean implementation based on official VoltAgent documentation
 * Generated on 2025-05-30
 */

import { 
  createHooks,
  type OnStartHookArgs,
  type OnEndHookArgs,
  type OnToolStartHookArgs,
  type OnToolEndHookArgs,
  type OnHandoffHookArgs
} from "@voltagent/core";
import { generateId } from 'ai';

/**
 * Simple development hooks for VoltAgent with minimal overhead
 * Focus on clean logging and operation tracking without complex memory management
 */
export const developmentHooks = createHooks({  onStart: async ({ agent, context }: OnStartHookArgs) => {
    try {
      // Set operation-specific context for tracking
      const operationId = `op-${agent.name}-${Date.now()}`;
      context.userContext.set("operationId", operationId);
      context.userContext.set("startTime", new Date().toISOString());
      
      // Check if we inherited a sessionId from supervisor
      const sessionId = context.userContext.get("sessionId");
      const supervisorName = context.userContext.get("supervisorName");
      
      if (sessionId) {
        console.log(`[🚀 Agent] ${agent.name} starting operation ${operationId} (inherited SessionID: ${sessionId}${supervisorName ? ` from ${supervisorName}` : ''})`);
      } else {
        console.log(`[🚀 Agent] ${agent.name} starting operation ${operationId}`);
      }
    } catch (error) {
      console.error(`[❌ Hook Error] Failed to process onStart for ${agent.name}:`, error);
    }
  },

  onEnd: async ({ agent, output, error, context }: OnEndHookArgs) => {
    try {      const operationId = context.userContext.get("operationId") || context.operationId;
      const startTime = context.userContext.get("startTime");
      const sessionId = context.userContext.get("sessionId");
      const endTime = new Date().toISOString();
      
      const sessionInfo = sessionId ? ` (SessionID: ${sessionId})` : '';
      
      if (error) {
        console.error(`[❌ Agent] ${agent.name} operation ${operationId} failed${sessionInfo}:`, error.message);
      } else {
        // Log successful completion with basic output info
        if (output && "text" in output && output.text) {
          const textLength = output.text.length;
          console.log(`[✅ Agent] ${agent.name} operation ${operationId} completed (${textLength} chars)`);
        } else if (output && "object" in output) {
          console.log(`[✅ Agent] ${agent.name} operation ${operationId} completed with structured output`);
        } else {
          console.log(`[✅ Agent] ${agent.name} operation ${operationId} completed successfully`);
        }
        
        // Log usage statistics if available
        if (output && "usage" in output && output.usage) {
          const usage = output.usage as { totalTokens?: number; promptTokens?: number; completionTokens?: number };
          if (usage.totalTokens) {
            console.log(`[📊 Usage] Tokens: ${usage.totalTokens} (Input: ${usage.promptTokens || 0}, Output: ${usage.completionTokens || 0})`);
          }
        }
      }
      
      // Calculate operation duration if we have start time
      if (startTime) {
        const duration = new Date(endTime).getTime() - new Date(startTime as string).getTime();
        console.log(`[⏱️ Duration] Operation took ${duration}ms`);
      }
      
    } catch (hookError) {
      console.error(`[❌ Hook Error] Failed to process onEnd for ${agent.name}:`, hookError);
    }
  },
  onToolStart: async ({ agent, tool, context }: OnToolStartHookArgs) => {
    try {
      const operationId = context.userContext.get("operationId") || context.operationId;
      const toolExecutionId = generateId();
      
      // Store tool execution ID for tracking
      context.userContext.set(`tool_${tool.name}_id`, toolExecutionId);
      context.userContext.set(`tool_${tool.name}_start`, new Date().toISOString());
      
      console.log(`[🔧 Tool] Agent ${agent.name} starting tool: ${tool.name} (${toolExecutionId}) for operation ${operationId}`);
    } catch (error) {
      console.error(`[❌ Hook Error] Failed to process onToolStart for ${tool.name}:`, error);
    }
  },

  onToolEnd: async ({ agent, tool, output, error, context }: OnToolEndHookArgs) => {
    try {
      const operationId = context.userContext.get("operationId") || context.operationId;
      const toolExecutionId = context.userContext.get(`tool_${tool.name}_id`);
      const toolStartTime = context.userContext.get(`tool_${tool.name}_start`);
      
      if (error) {
        console.error(`[❌ Tool] ${tool.name} failed in operation ${operationId} for agent ${agent.name}:`, error.message, `(Execution ID: ${toolExecutionId})`);
      } else {
        console.log(`[✅ Tool] ${tool.name} completed successfully for operation ${operationId} by agent ${agent.name} (Execution ID: ${toolExecutionId})`);
        
        // Log basic output info without storing full content
        if (typeof output === "string") {
          const outputLength = output.length;
          console.log(`[📄 Tool Output] ${tool.name} returned ${outputLength} characters (Execution ID: ${toolExecutionId})`);
        } else if (output && typeof output === "object") {
          console.log(`[📄 Tool Output] ${tool.name} returned structured data (Execution ID: ${toolExecutionId})`);
        }
      }
      
      // Calculate tool execution duration
      if (toolStartTime) {
        const duration = new Date().getTime() - new Date(toolStartTime as string).getTime();
        console.log(`[⏱️ Tool Duration] ${tool.name} took ${duration}ms (Execution ID: ${toolExecutionId})`);
      }
      
    } catch (hookError) {
      console.error(`[❌ Hook Error] Failed to process onToolEnd for ${tool.name}:`, hookError);
    }
  },

  onHandoff: async ({ agent, source }: OnHandoffHookArgs) => {
    try {
      if (source && source.name) {
        console.log(`[🔄 Handoff] Task handed off from ${source.name} to ${agent.name}`);
      } else {
        console.log(`[🔄 Handoff] Task handed off to ${agent.name}`);
      }
    } catch (error) {
      console.error(`[❌ Hook Error] Failed to process onHandoff for ${agent.name}:`, error);
    }
  },
});

/**
 * Utility function to get operation context information
 * Useful for debugging and monitoring
 */
export function getOperationContext(context: { userContext?: Map<string, unknown> }): {
  operationId?: string;
  startTime?: string;
  activeTools?: string[];
} {
  try {
    const operationId = context.userContext?.get("operationId") as string | undefined;
    const startTime = context.userContext?.get("startTime") as string | undefined;
    
    // Get active tool executions
    const activeTools: string[] = [];
    if (context.userContext) {
      for (const [key, value] of context.userContext.entries()) {
        if (typeof key === "string" && key.startsWith("tool_") && key.endsWith("_id")) {
          const toolName = key.replace("tool_", "").replace("_id", "");
          // Use value to ensure it's a valid tool execution (e.g., not null/undefined)
          if (value) {
            activeTools.push(toolName);
          }
        }
      }
    }
    
    return {
      operationId,
      startTime,
      activeTools
    };
  } catch (error) {
    console.error("Failed to get operation context:", error);
    return {};
  }
}