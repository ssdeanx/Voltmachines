import { z } from "zod";
import { generateId } from 'ai';
import { 
  createHooks, 
  type OnStartHookArgs, 
  type OnEndHookArgs, 
  type OnToolStartHookArgs, 
  type OnToolEndHookArgs, 
  type OnHandoffHookArgs 
} from "@voltagent/core";
import { globalMemory } from "../memory/index.js";
import { vectorMemory } from "../memory/vectorMemory.js";

/**
 * Hook event schema for structured logging and monitoring
 */
const hookEventSchema = z.object({
  timestamp: z.string().datetime(),
  operationId: z.string(),
  agentName: z.string(),
  eventType: z.enum(["start", "end", "tool_start", "tool_end", "error"]),
  duration: z.number().optional(),
  error: z.string().optional(),
  conversationId: z.string().optional(),
});

/**
 * Usage statistics schema for token tracking
 */
const usageStatsSchema = z.object({
  totalTokens: z.number().positive(),
  promptTokens: z.number().positive(),
  completionTokens: z.number().positive(),
  cost: z.number().optional(),
});

/**
 * Tool execution schema for detailed tool monitoring
 */
const toolExecutionSchema = z.object({
  toolName: z.string(),
  executionId: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  input: z.record(z.unknown()),
  output: z.unknown().optional(),
  error: z.string().optional(),
  agentName: z.string(),
  conversationId: z.string().optional(),
});

/**
 * Type definitions for improved type safety
 */
export type HookEvent = z.infer<typeof hookEventSchema>;
export type UsageStats = z.infer<typeof usageStatsSchema>;
export type ToolExecution = z.infer<typeof toolExecutionSchema>;

/**
 * Agent operation context interface
 */
export interface OperationContext {
  operationId: string;
  conversationId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * In-memory storage for hook events (for debugging and monitoring)
 */
const hookEvents: HookEvent[] = [];
const toolExecutions: ToolExecution[] = [];

/**
 * Enhanced context extraction with multiple fallback strategies
 * @param context - Hook context object
 * @returns Conversation ID if found, undefined otherwise
 */
function getConversationIdFromContext(context: {
  conversationId?: string;
  userContext?: { get: (key: string) => string | undefined };
  operationContext?: { conversationId?: string };
  [key: string]: unknown;
}): string | undefined {
  // Try common locations for conversationId
  if (context?.conversationId) return context.conversationId;
  if (context?.userContext?.get) {
    const contextId = context.userContext.get('conversationId');
    if (contextId) return contextId;
  }
  if (context?.operationContext?.conversationId) return context.operationContext.conversationId;
  
  // Additional fallback checks
  if ('conversationId' in context && typeof context.conversationId === 'string') {
    return context.conversationId;
  }
  
  return undefined;
}

/**
 * Store tool execution for monitoring and analytics
 */
async function logToolExecution(execution: ToolExecution): Promise<void> {
  try {
    const validatedExecution = toolExecutionSchema.parse(execution);
    toolExecutions.push(validatedExecution);
    
    // Store in vector memory for semantic search
    await vectorMemory.addMessage({
      id: validatedExecution.executionId,
      text: `Tool execution: ${validatedExecution.toolName} by ${validatedExecution.agentName}`,
      role: 'system'
    });
  } catch (error) {
    console.error('[Hook Error] Failed to log tool execution:', error);
  }
}
/**
 * Enhanced VoltAgent development hooks with comprehensive logging, 
 * memory integration, and error handling
 * 
 * Features:
 * - Structured logging with Zod validation
 * - Automatic memory persistence for conversations
 * - Tool execution tracking and analytics
 * - Enhanced error handling and recovery
 * - Integration with vector memory for semantic search
 * 
 * Generated on 2025-05-29
 */
export const developmentHooks = createHooks({
  onStart: async ({ agent, context }: OnStartHookArgs) => {    try {
      const conversationId = getConversationIdFromContext(context);
      
      const event: HookEvent = {
        timestamp: new Date().toISOString(),
        operationId: context.operationId,
        agentName: agent.name,
        eventType: "start",
        conversationId,
      };
      
      // Validate and store event
      const validatedEvent = hookEventSchema.parse(event);
      hookEvents.push(validatedEvent);
      
      console.log(`[🚀 Agent] ${agent.name} starting operation ${context.operationId} at ${event.timestamp}`);
      
      // Log agent start in memory for context continuity
      if (conversationId) {
        await globalMemory.addMessage({
          role: "system",
          content: `Agent ${agent.name} started operation ${context.operationId}`,
        }, conversationId);
      }      // Store agent start event in vector memory for semantic search
      await vectorMemory.addMessage({
        id: generateId(),
        text: `Agent ${agent.name} started operation ${context.operationId}`,
        role: 'system'
      });
      
    } catch (error) {
      console.error(`[❌ Hook Error] Failed to process onStart for ${agent.name}:`, error);
    }
  },

  onEnd: async ({ agent, output, error, context }: OnEndHookArgs) => {
    try {
      const conversationId = getConversationIdFromContext(context);
      const endTime = new Date().toISOString();
      
      if (error) {
        console.error(`[❌ Agent] ${agent.name} operation ${context.operationId} failed:`, error.message);
        
        // Log error in memory
        if (conversationId) {
          await globalMemory.addMessage({
            role: "system",
            content: `Agent ${agent.name} encountered error: ${error.message}`,
          }, conversationId);
        }
        
        // Store error event
        const errorEvent: HookEvent = {
          timestamp: endTime,
          operationId: context.operationId,
          agentName: agent.name,
          eventType: "error",
          error: error.message,
          conversationId,
        };
        hookEvents.push(hookEventSchema.parse(errorEvent));
        
      } else if (output) {
        // Handle successful output
        if ("text" in output && output.text) {
          if (conversationId) {
            await globalMemory.addMessage({
              role: "assistant",
              content: output.text,
            }, conversationId);
          }
        }
        
        // Log usage statistics if available
        if ("usage" in output && output.usage) {
          const usage = usageStatsSchema.safeParse(output.usage);
          if (usage.success) {
            console.log(`[📊 Usage] Tokens: ${usage.data.totalTokens} (Input: ${usage.data.promptTokens}, Output: ${usage.data.completionTokens})`);
          }
        }
        
        // Log completion based on output type
        if ("object" in output && output.object) {
          console.log(`[✅ Agent] ${agent.name} operation ${context.operationId} completed with structured output.`);
        } else if ("text" in output && output.text) {
          console.log(`[✅ Agent] ${agent.name} operation ${context.operationId} completed with text output.`);
        } else {
          console.log(`[✅ Agent] ${agent.name} operation ${context.operationId} completed successfully.`);
        }
        
        // Store success event
        const successEvent: HookEvent = {
          timestamp: endTime,
          operationId: context.operationId,
          agentName: agent.name,
          eventType: "end",
          conversationId,
        };
        hookEvents.push(hookEventSchema.parse(successEvent));
      }
      
    } catch (hookError) {
      console.error(`[❌ Hook Error] Failed to process onEnd for ${agent.name}:`, hookError);
    }
  },

  onToolStart: async ({ agent, tool, context }: OnToolStartHookArgs) => {
    try {
      const conversationId = getConversationIdFromContext(context);
      const executionId = generateId();
      const startTime = new Date().toISOString();
      
      console.log(`[🔧 Tool] Agent ${agent.name} starting tool: ${tool.name} for operation ${context.operationId}`);
      
      // Create tool execution record
      const execution: ToolExecution = {
        toolName: tool.name,
        executionId,
        startTime,
        input: {}, // Will be populated from tool parameters if available
        agentName: agent.name,
        conversationId,
      };
      
      await logToolExecution(execution);
      
    } catch (error) {
      console.error(`[❌ Hook Error] Failed to process onToolStart for ${tool.name}:`, error);
    }
  },

  onToolEnd: async ({ agent, tool, output, error, context }: OnToolEndHookArgs) => {
    try {
      const conversationId = getConversationIdFromContext(context);
      const endTime = new Date().toISOString();
      
      if (error) {
        console.error(`[❌ Tool] ${tool.name} failed in operation ${context.operationId} for agent ${agent.name}:`, error.message);
        
        // Log tool error in memory (using proper CoreMessage format without tool_name)
        if (conversationId) {
          await globalMemory.addMessage({
            role: "system",
            content: `Tool ${tool.name} failed for agent ${agent.name}: ${error.message}`,
          }, conversationId, `tool_error_${generateId()}`);
        }
        
      } else {
        console.log(`[✅ Tool] ${tool.name} completed successfully for operation ${context.operationId} by agent ${agent.name}`);
        
        // Log successful tool output
        if (typeof output === "string" && conversationId) {
          // Truncate long outputs to prevent memory bloat
          const truncatedOutput = output.length > 1000 ? output.substring(0, 1000) + "..." : output;
          await globalMemory.addMessage({
            role: "system",
            content: `Tool ${tool.name} output: ${truncatedOutput}`,
          }, conversationId, `tool_output_${generateId()}`);
        }
      }
      
      // Update tool execution record
      const completedExecution: ToolExecution = {
        toolName: tool.name,
        executionId: generateId(),
        startTime: new Date(Date.now() - 1000).toISOString(), // Approximate start time
        endTime,
        input: {},
        output: typeof output === "string" ? output : JSON.stringify(output),
        error: error?.message,
        agentName: agent.name,
        conversationId,
      };
      
      await logToolExecution(completedExecution);
      
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
      
      // Log handoff event for tracking agent delegation patterns
      const handoffEvent: HookEvent = {
        timestamp: new Date().toISOString(),
        operationId: generateId(), // Generate new operation ID for handoff
        agentName: agent.name,
        eventType: "start", // New agent is starting
      };
      hookEvents.push(hookEventSchema.parse(handoffEvent));
      
    } catch (error) {
      console.error(`[❌ Hook Error] Failed to process onHandoff for ${agent.name}:`, error);
    }
  },
});

/**
 * Utility functions for hook analytics and monitoring
 */

/**
 * Get all hook events for analysis
 * @returns Array of validated hook events
 */
export function getHookEvents(): HookEvent[] {
  return [...hookEvents];
}

/**
 * Get tool execution history
 * @returns Array of tool executions
 */
export function getToolExecutions(): ToolExecution[] {
  return [...toolExecutions];
}

/**
 * Clear hook event history (useful for testing)
 */
export function clearHookEvents(): void {
  hookEvents.length = 0;
  toolExecutions.length = 0;
}

/**
 * Get hook statistics
 * @returns Object with hook analytics
 */
export function getHookStatistics(): {
  totalEvents: number;
  eventsByType: Record<string, number>;
  agentActivity: Record<string, number>;
  toolUsage: Record<string, number>;
  errorRate: number;
} {
  const eventsByType: Record<string, number> = {};
  const agentActivity: Record<string, number> = {};
  const toolUsage: Record<string, number> = {};
  let errorCount = 0;

  hookEvents.forEach(event => {
    eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
    agentActivity[event.agentName] = (agentActivity[event.agentName] || 0) + 1;
    if (event.eventType === 'error') errorCount++;
  });

  toolExecutions.forEach(execution => {
    toolUsage[execution.toolName] = (toolUsage[execution.toolName] || 0) + 1;
  });

  return {
    totalEvents: hookEvents.length,
    eventsByType,
    agentActivity,
    toolUsage,
    errorRate: hookEvents.length > 0 ? errorCount / hookEvents.length : 0,
  };
}
