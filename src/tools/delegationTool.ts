import { z } from "zod";
import { createTool } from "@voltagent/core";
import { agentRegistry } from "../agents/index.js";
import { AgentCapability } from "../index.js";

/**
 * Delegation task schema
 */
export const delegationTaskSchema = z.object({
  task: z.string().min(1).describe("The specific task description to be delegated"),
  targetAgents: z.array(z.string()).min(1).describe("List of subagent names to delegate the task to"),
  context: z.record(z.string(), z.any()).optional().describe("Additional context for the subagent(s)"),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium').describe("Task priority level"),
  timeout: z.number().positive().default(30000).describe("Timeout in milliseconds"),
});

/**
 * Delegation result schema
 */
export const delegationResultSchema = z.object({
  agentName: z.string(),
  response: z.string(),
  conversationId: z.string(),
  success: z.boolean(),
  duration: z.number(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type DelegationTask = z.infer<typeof delegationTaskSchema>;
export type DelegationResult = z.infer<typeof delegationResultSchema>;

/**
 * Enhanced delegate_task tool for supervisor agent
 * 
 * This tool enables the supervisor to delegate tasks to specialized subagents
 * and coordinate multi-agent workflows with proper observability.
 */
export const delegateTaskTool = createTool({
  name: "delegate_task",
  description: "Delegate a task to one or more specialized agents for coordinated multi-agent workflows",
  parameters: delegationTaskSchema,
  execute: async ({ task, targetAgents, context = {}, priority, timeout }, options) => {
    const startTime = Date.now();
    const results: DelegationResult[] = [];
    
    try {
      // Validate that target agents exist
      const availableAgents = Object.keys(agentRegistry);
      const invalidAgents = targetAgents.filter(name => !availableAgents.includes(name));
      
      if (invalidAgents.length > 0) {
        throw new Error(`Invalid agent names: ${invalidAgents.join(', ')}. Available: ${availableAgents.join(', ')}`);
      }

      console.log(`[🔄 Delegation] Starting task delegation to ${targetAgents.length} agents`);
      console.log(`[📋 Task] ${task}`);
      console.log(`[🎯 Targets] ${targetAgents.join(', ')}`);
      console.log(`[⚡ Priority] ${priority}`);

      // Process each target agent
      const delegationPromises = targetAgents.map(async (agentName) => {
        const agent = agentRegistry[agentName as keyof typeof agentRegistry];
        const agentStartTime = Date.now();
        
        try {
          console.log(`[🤖 Agent] Delegating to ${agentName}...`);
          
          // Create enhanced context with delegation metadata
          const enhancedContext = {
            ...context,
            delegationMetadata: {
              supervisorAgent: "supervisor",
              delegatedAt: new Date().toISOString(),
              priority,
              taskId: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              parentOperationId: options?.operationContext?.operationId,
            },
          };

          // Use the agent's generateText method for task execution
          const response = await agent.generateText(
            `[DELEGATED TASK from supervisor]
Task: ${task}

Context: ${JSON.stringify(enhancedContext, null, 2)}

Please process this delegated task and provide a comprehensive response.`,
            {
              userId: 'supervisor-delegation',
              conversationId: `delegation_${agentName}_${Date.now()}`,
            }
          );

          const duration = Date.now() - agentStartTime;
          
          console.log(`[✅ Success] ${agentName} completed task in ${duration}ms`);
          
          return delegationResultSchema.parse({
            agentName,
            response: response.text,
            conversationId: `delegation_${agentName}_${Date.now()}`,
            success: true,
            duration,
            metadata: {
              usage: response.usage,
              finishReason: response.finishReason,
              delegationMetadata: enhancedContext.delegationMetadata,
            },
          });
        } catch (error) {
          const duration = Date.now() - agentStartTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          console.error(`[❌ Error] ${agentName} failed: ${errorMessage}`);
          
          return delegationResultSchema.parse({
            agentName,
            response: `Error: ${errorMessage}`,
            conversationId: `delegation_${agentName}_${Date.now()}`,
            success: false,
            duration,
            error: errorMessage,
          });
        }
      });

      // Wait for all delegations to complete (with timeout)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Delegation timeout')), timeout);
      });

      results.push(...await Promise.race([
        Promise.all(delegationPromises),
        timeoutPromise,
      ]));

      const totalDuration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      
      console.log(`[🏁 Complete] Delegation finished: ${successCount}/${results.length} successful in ${totalDuration}ms`);

      // Return formatted results for the supervisor
      return {
        success: true,
        delegationSummary: {
          task,
          totalAgents: targetAgents.length,
          successfulAgents: successCount,
          failedAgents: results.length - successCount,
          totalDuration,
          priority,
        },
        results,
        recommendations: generateRecommendations(results, task),
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown delegation error';
      const totalDuration = Date.now() - startTime;
      
      console.error(`[💥 Delegation Failed] ${errorMessage} (${totalDuration}ms)`);
      
      return {
        success: false,
        error: errorMessage,
        duration: totalDuration,
        results,
      };
    }
  },
});

/**
 * Generate recommendations based on delegation results
 */
function generateRecommendations(results: DelegationResult[], task: string): string[] {
  const recommendations: string[] = [];
  
  const failedAgents = results.filter(r => !r.success);
  const successfulAgents = results.filter(r => r.success);
  
  if (failedAgents.length > 0) {
    recommendations.push(`${failedAgents.length} agent(s) failed: ${failedAgents.map(r => r.agentName).join(', ')}`);
    recommendations.push("Consider retrying failed tasks or using alternative agents");
  }
  
  if (successfulAgents.length > 0) {
    const avgDuration = successfulAgents.reduce((sum, r) => sum + r.duration, 0) / successfulAgents.length;
    recommendations.push(`Average response time: ${avgDuration.toFixed(0)}ms`);
    
    if (avgDuration > 10000) {
      recommendations.push("Consider breaking down complex tasks for faster processing");
    }
  }
  
  // Task-specific recommendations
  if (task.toLowerCase().includes('analysis')) {
    recommendations.push("For analysis tasks, consider using data-analyst for quantitative and content-creator for qualitative aspects");
  }
  
  if (task.toLowerCase().includes('code') || task.toLowerCase().includes('repository')) {
    recommendations.push("For code-related tasks, developer agent provides comprehensive repository analysis and code review");
  }
  
  return recommendations;
}

/**
 * Utility function to get available agents for delegation
 */
export function getAvailableAgents(): AgentCapability[] {
  return Object.entries(agentRegistry).map(([name, agent]) => ({
    name,
    agentName: agent.name,
    capabilities: (agent as any).tools?.map((tool: any) => tool.name) || [],
    status: 'active' as const,
  }));
}

/**
 * Validate agent capabilities for a specific task type
 */
export function validateAgentCapabilities(task: string, targetAgents: string[]): {
  suitable: string[];
  unsuitable: string[];
  recommendations: string[];
} {
  const availableAgents = getAvailableAgents();
  const suitable: string[] = [];
  const unsuitable: string[] = [];
  const recommendations: string[] = [];
  
  const taskLower = task.toLowerCase();
  
  for (const agentName of targetAgents) {
    const agent = availableAgents.find(a => a.name === agentName);
    if (!agent) {
      unsuitable.push(agentName);
      continue;
    }
    
    // Task-specific suitability checks
    if (taskLower.includes('data') || taskLower.includes('analysis') || taskLower.includes('calculate')) {
      if (agentName === 'dataAnalyst') suitable.push(agentName);
      else if (!suitable.includes('dataAnalyst')) recommendations.push("Consider using data-analyst for data analysis tasks");
    }
    
    if (taskLower.includes('code') || taskLower.includes('repository') || taskLower.includes('git')) {
      if (agentName === 'developer') suitable.push(agentName);
      else if (!suitable.includes('developer')) recommendations.push("Consider using developer agent for code-related tasks");
    }
    
    if (taskLower.includes('content') || taskLower.includes('write') || taskLower.includes('article')) {
      if (agentName === 'contentCreator') suitable.push(agentName);
      else if (!suitable.includes('contentCreator')) recommendations.push("Consider using content-creator for writing tasks");
    }
    
    if (taskLower.includes('file') || taskLower.includes('directory') || taskLower.includes('manage')) {
      if (agentName === 'fileManager') suitable.push(agentName);
      else if (!suitable.includes('fileManager')) recommendations.push("Consider using file-manager for file operations");
    }
    
    if (taskLower.includes('system') || taskLower.includes('performance') || taskLower.includes('monitor')) {
      if (agentName === 'systemAdmin') suitable.push(agentName);
      else if (!suitable.includes('systemAdmin')) recommendations.push("Consider using system-admin for system-related tasks");
    }
    
    // Default: consider all agents suitable for general problem-solving
    if (!suitable.includes(agentName) && !unsuitable.includes(agentName)) {
      suitable.push(agentName);
    }
  }
  
  return { suitable, unsuitable, recommendations };
}
