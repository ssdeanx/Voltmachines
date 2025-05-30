import { z } from "zod";
import { Agent } from "@voltagent/core";
import { GoogleGenAIProvider } from "@voltagent/google-ai";
import { systemInfoTool, webSearchTool } from "../tools/index.js";
import { developmentHooks } from "./agentHooks.js";
import { globalMemory } from "../memory/index.js";

import type { OnEndHookArgs } from '@voltagent/core';

/**
 * System admin configuration schema
 */
const systemAdminConfigSchema = z.object({
  name: z.string().min(1),
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
  name: "system-admin",
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

export const systemAdminAgent = patchAgentMethods(new Agent({
  name: agentConfig.name,
  instructions: `You are a specialized system administration agent with expertise in:
  
  **Configuration:**
  - Monitoring interval: ${agentConfig.monitoringInterval} seconds
  - Alert thresholds: CPU ${agentConfig.alertThresholds.cpu}%, Memory ${agentConfig.alertThresholds.memory}%, Disk ${agentConfig.alertThresholds.disk}%
  - Security scans: ${agentConfig.enableSecurityScans ? 'enabled' : 'disabled'}
  - Log retention: ${agentConfig.logRetentionDays} days
  - Supported OS: ${agentConfig.supportedOs.join(', ')}
  
  **Core Capabilities:**
  - System monitoring and performance analysis
  - Environment configuration and troubleshooting
  - Process management and optimization
  - Security best practices and diagnostics
  - Research for troubleshooting and best practices
  
  **Monitoring & Analysis:**
  - Real-time system health assessment
  - Performance bottleneck identification
  - Resource utilization optimization
  - Predictive maintenance recommendations
  
  **Security & Compliance:**
  - Security vulnerability assessment
  - Configuration hardening recommendations
  - Access control and permission analysis
  - Compliance with security standards
  
  **Best Practices:**
  - Always prioritize system stability and security in your recommendations
  - Provide step-by-step troubleshooting guides when issues are identified
  - Use web search for current security advisories and best practices
  - Document all system changes and configurations
  - Monitor system health against configured thresholds
    All system health reports must conform to systemHealthSchema for consistent monitoring.`,
  llm: new GoogleGenAIProvider({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }),
  model: "models/gemini-2.0-flash-exp",
  memory: globalMemory,
  hooks: {
    ...developmentHooks,
    onEnd: async (args: OnEndHookArgs) => {
      const conversationId = args.context?.userContext?.get('conversationId') || undefined;
      console.log(`[✅ Agent] systemAdminAgent completed operation for conversation:`, conversationId || 'unknown');
    },
  },
  tools: [systemInfoTool, webSearchTool],
}));

export const generateText = async (prompt: string, options?: Record<string, unknown>) => {
  return systemAdminAgent.generateText(prompt, options);
};
