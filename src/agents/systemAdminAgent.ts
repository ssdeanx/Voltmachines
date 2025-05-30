import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { systemInfoTool, webSearchTool } from "../tools/index.js";
import { developmentHooks } from "./voltAgentHooks.js";
import { voltAgentMemory } from "../memory/voltAgentMemory.js";
import { getAgentPrompt } from "./agentPrompt.js";

import type { OnEndHookArgs } from '@voltagent/core';

/**
 * System admin configuration schema
 */
const systemAdminConfigSchema = z.object({
  capabilities: z.array(z.string()).default([
    "system monitoring",
    "performance analysis", 
    "environment configuration",
    "troubleshooting",
    "process management",
    "security diagnostics",
    "web research",
    "compliance checking"
  ]),
  monitoringInterval: z.number().positive().default(300), // 5 minutes
  alertThresholds: z.object({
    cpu: z.number().min(0).max(100).default(80),
    memory: z.number().min(0).max(100).default(85),
    disk: z.number().min(0).max(100).default(90),
  }),
  enableSecurityScans: z.boolean().default(true),
  logRetentionDays: z.number().positive().default(30),
  supportedOs: z.array(z.enum(['windows', 'linux', 'macos'])).default(['windows', 'linux', 'macos']),
});

/**
 * System health report schema
 */
export const systemHealthSchema = z.object({
  timestamp: z.string().datetime(),
  overall: z.enum(['healthy', 'warning', 'critical']),
  metrics: z.object({
    cpu: z.object({
      usage: z.number().min(0).max(100),
      cores: z.number().positive(),
      temperature: z.number().optional(),
    }),
    memory: z.object({
      usage: z.number().min(0).max(100),
      total: z.number().positive(),
      available: z.number().positive(),
    }),
    disk: z.object({
      usage: z.number().min(0).max(100),
      total: z.number().positive(),
      free: z.number().positive(),
    }),
    network: z.object({
      latency: z.number().optional(),
      throughput: z.number().optional(),
      errors: z.number().optional(),
    }).optional(),
  }),
  alerts: z.array(z.object({
    severity: z.enum(['info', 'warning', 'error', 'critical']),
    component: z.string(),
    message: z.string(),
    recommendation: z.string().optional(),
  })),
  recommendations: z.array(z.string()),
});

export type SystemHealth = z.infer<typeof systemHealthSchema>;
export type SystemAdminConfig = z.infer<typeof systemAdminConfigSchema>;

// Validate agent configuration
const agentConfig = systemAdminConfigSchema.parse({
  capabilities: [
    "system monitoring",
    "performance analysis", 
    "environment configuration",
    "troubleshooting",
    "process management",
    "security diagnostics",
    "web research",
    "compliance checking"
  ],
  monitoringInterval: 180, // 3 minutes
  alertThresholds: {
    cpu: 75,
    memory: 80,
    disk: 85,
  },
  enableSecurityScans: true,
  logRetentionDays: 45,
  supportedOs: ['windows', 'linux', 'macos'],
});

export const systemAdminAgent = new Agent({
  name: "system-admin",
  instructions: getAgentPrompt({
    capabilities: agentConfig.capabilities,
    goal: "Monitor system health, troubleshoot issues, and maintain optimal performance.",
    context: `Configuration - Monitoring: ${agentConfig.monitoringInterval}s intervals, Alert thresholds: CPU ${agentConfig.alertThresholds.cpu}%, Memory ${agentConfig.alertThresholds.memory}%, Disk ${agentConfig.alertThresholds.disk}%. Security scans: ${agentConfig.enableSecurityScans ? 'enabled' : 'disabled'}. Supported OS: ${agentConfig.supportedOs.join(', ')}.`,
    task: "Analyze system metrics, provide recommendations, and assist with system administration tasks.",
  }),
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: voltAgentMemory,
  memoryOptions: {
    monitoringInterval: agentConfig.monitoringInterval,
    alertThresholds: agentConfig.alertThresholds,
    enableSecurityScans: agentConfig.enableSecurityScans,
    logRetentionDays: agentConfig.logRetentionDays,
    supportedOs: agentConfig.supportedOs,
     // Enable context sharing for task delegation
    enableContextSharing: true,
    // Enable additional features for data processing
    enableDataProcessing: true,
    // Additional memory options
    maxSteps: 100, // Limit steps to prevent excessive memory usage
    // Enable additional features for system administration tasks
    // Additional memory options
    maxContextLength: 1000000,
    storageLimit: 5000,
    storageType: "voltage",
  },
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] system-admin completed operation for conversation:`, conversationId || 'unknown');
    },
  },
  tools: [systemInfoTool, webSearchTool]
});

/**
 * Generates text using the systemAdminAgent's LLM.
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
    const result = await systemAdminAgent.generateText(prompt, options);
    return result.text;
  } catch (error) {
    // TODO: Integrate project logger if available
    console.error("[systemAdminAgent.generateText] Error:", error);
    throw error;
  }

};