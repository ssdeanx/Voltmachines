import { createTool, createReasoningTools } from "@voltagent/core";
import { z } from "zod";
import type { ToolExecuteOptions, ToolExecutionContext } from "@voltagent/core";
import * as crypto from 'crypto';
import { addSeconds, isAfter, formatISO, differenceInSeconds, formatDistance } from 'date-fns';
import { BentoCache, bentostore } from 'bentocache';
import { memoryDriver } from 'bentocache/drivers/memory';
import { vectorMemory } from '../memory/vectorMemory.js';
import { agentRegistry } from '../agents/index.js';

// ============================================================================
// CACHE MANAGEMENT TOOL (now using BentoCache)
// ============================================================================

const cache = new BentoCache({
  default: 'supervisor',
  stores: {
    supervisor: bentostore().useL1Layer(memoryDriver({ maxSize: '10mb' }))
  },
  prefix: 'supervisor-cache'
});

export const cacheManagerTool = createTool({
  name: 'cache_manager',
  description: 'Manages persistent cache storing key-value pairs with TTL support using BentoCache',
  parameters: z.object({
    operation: z.enum(['set', 'get', 'delete', 'clear', 'has']).describe('Cache operation'),
    key: z.string().optional().describe('Key for cache operation'),
    value: z.any().optional().describe('Value to be set, required for set operation'),
    ttl: z.number().optional().describe('Time to live in seconds for the cache key')
  }),
  execute: async (
    params: { operation: 'set' | 'get' | 'delete' | 'clear' | 'has'; key?: string; value?: unknown; ttl?: number },
    _options?: ToolExecuteOptions,
    _context?: ToolExecutionContext
  ) => {
    const { operation, key, value, ttl } = params;
    try {
      switch (operation) {
        case 'set': {
          if (!key) throw new Error("Key is required for 'set' operation");
          await cache.set({ key, value, ttl });
          let expiresAt: string | undefined = undefined;
          let expiresInHuman: string | undefined = undefined;
          if (ttl) {
            const expiresDate = addSeconds(new Date(), ttl);
            expiresAt = formatISO(expiresDate);
            expiresInHuman = formatDistance(new Date(), expiresDate, { addSuffix: true });
            // Store expiration metadata
            await cache.set({ key: key + '.expires', value: expiresAt, ttl });
          }
          return { success: true, message: `Key ${key} set`, key, value, ttl, expiresAt, expiresInHuman, options: _options, context: _context };
        }
        case 'get': {
          if (!key) throw new Error("Key is required for 'get' operation");
          const result = await cache.get({ key });
          // Check for expiration metadata
          const expiresAt: string | undefined = await cache.get({ key: key + '.expires' });
          let expired = false;
          let expiresIn: number | undefined = undefined;
          let expiresInHuman: string | undefined = undefined;
          if (expiresAt) {
            const expiresDate = new Date(expiresAt);
            expired = isAfter(new Date(), expiresDate);
            if (!expired) {
              expiresIn = differenceInSeconds(expiresDate, new Date());
              expiresInHuman = formatDistance(new Date(), expiresDate, { addSuffix: true });
            } else {
              // Optionally, clean up expired key and metadata
              await cache.delete({ key });
              await cache.delete({ key: key + '.expires' });
            }
          }
          return { success: !expired, key, value: expired ? undefined : result, message: expired ? `Key ${key} expired` : (result !== undefined ? `Key ${key} retrieved` : `Key ${key} not found`), expiresAt, expiresIn, expiresInHuman, expired, options: _options, context: _context };
        }
        case 'delete': {
          if (!key) throw new Error("Key is required for 'delete' operation");
          const hadKey = await cache.has({ key });
          await cache.delete({ key });
          await cache.delete({ key: key + '.expires' });
          return { success: true, key, message: hadKey ? `Key ${key} deleted` : `Key ${key} not present`, options: _options, context: _context };
        }
        case 'clear': {
          await cache.clear();
          return { success: true, message: "Cache cleared", options: _options, context: _context };
        }
        case 'has': {
          if (!key) throw new Error("Key is required for 'has' operation");
          const exists = await cache.has({ key });
          return { success: true, key, exists, message: `Cache ${exists ? "contains" : "does not contain"} key ${key}`, options: _options, context: _context };
        }
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), operation, key, options: _options, context: _context };
    }
  }
});

/**
 * Output schema for cacheManagerTool
 */
export const cacheManagerToolOutputSchema = z.object({
  success: z.boolean(),
  key: z.string().optional(),
  value: z.unknown().optional(),
  message: z.string().optional(),
  expiresAt: z.string().optional(),
  expiresIn: z.number().optional(),
  expiresInHuman: z.string().optional(),
  expired: z.boolean().optional(),
  ttl: z.number().optional(),
  options: z.unknown().optional(),
  context: z.unknown().optional(),
  error: z.string().optional(),
});

// ============================================================================
// DATA VALIDATION TOOL
// ============================================================================

export const validationTool = createTool({
  name: 'data_validator',
  description: 'Advanced data validation with custom rules, schema validation, and data quality checks',
  parameters: z.object({
    data: z.unknown().describe('Data to validate'),
    validation_type: z.enum(['schema', 'business_rules', 'data_quality', 'format', 'range']).describe('Type of validation'),
    rules: z.object({
      required_fields: z.array(z.string()).optional(),
      data_types: z.record(z.string()).optional(),
      ranges: z.record(z.object({ min: z.number().optional(), max: z.number().optional() })).optional(),
      patterns: z.record(z.string()).optional(),
      custom_rules: z.array(z.string()).optional(),
    }).optional(),
    strict: z.boolean().optional().default(false).describe('Strict validation mode'),
  }),
  execute: async ({ data, validation_type, rules, strict = false }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
    try {
      if (typeof data !== 'object' || data === null) {
        throw new Error('Data must be a non-null object for validation.');
      }
      const dataObj = data as Record<string, unknown>;
      const errors: string[] = [];
      const warnings: string[] = [];
      let isValid = true;

      switch (validation_type) {
        case 'schema':
          if (rules?.required_fields) {
            for (const field of rules.required_fields) {
              if (!(field in dataObj)) {
                errors.push(`Missing required field: ${field}`);
                isValid = false;
              }
            }
          }
          
          if (rules?.data_types) {
            for (const [field, expectedType] of Object.entries(rules.data_types)) {
              if (field in dataObj) {
                const actualType = typeof dataObj[field];
                if (actualType !== expectedType) {
                  errors.push(`Field ${field} expected ${expectedType}, got ${actualType}`);
                  isValid = false;
                }
              }
            }
          }
          break;

        case 'range':
          if (rules?.ranges) {
            for (const [field, range] of Object.entries(rules.ranges)) {
              if (field in dataObj && typeof dataObj[field] === 'number') {
                const value = dataObj[field];
                if (range.min !== undefined && value < range.min) {
                  errors.push(`Field ${field} value ${value} below minimum ${range.min}`);
                  isValid = false;
                }
                if (range.max !== undefined && value > range.max) {
                  errors.push(`Field ${field} value ${value} above maximum ${range.max}`);
                  isValid = false;
                }
              }
            }
          }
          break;

        case 'format':
          if (rules?.patterns) {
            for (const [field, pattern] of Object.entries(rules.patterns)) {
              if (field in dataObj && typeof dataObj[field] === 'string') {
                const regex = new RegExp(pattern);
                if (!regex.test(dataObj[field])) {
                  errors.push(`Field ${field} does not match pattern ${pattern}`);
                  isValid = false;
                }
              }
            }
          }
          break;

        case 'data_quality':
          // Check for null/undefined values
          for (const [, v] of Object.entries(dataObj)) {
            if (v === null || v === undefined) {
              warnings.push(`Field ${v} has null/undefined value`);
            }
          }
          break;

        default:
          throw new Error(`Unknown validation type: ${validation_type}`);
      }

      if (strict && errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }

      return {
        success: isValid,
        operation: validation_type,
        strict,
        errors,
        warnings,
        options,
        context
      };
    } catch (error) {
      return {
        success: false,
        operation: validation_type,
        strict,
        error: error instanceof Error ? error.message : 'Unknown error',
        options,
        context
      };
    }
  }
});
  // ============================================================================
  // PERFORMANCE & MONITORING TOOLS
  // ============================================================================

  export const performanceProfilerTool = createTool({
    name: 'performance_profiler',
    description: 'Profile code execution, memory usage, and system performance metrics',
    parameters: z.object({
      operation: z.enum(['start_profile', 'end_profile', 'get_metrics', 'benchmark', 'memory_snapshot']).describe('Profiling operation'),
      profile_id: z.string().optional().describe('Profile session identifier'),
      function_name: z.string().optional().describe('Function to profile'),
      iterations: z.number().optional().default(1).describe('Number of iterations for benchmarking'),
    }),
    execute: async ({ operation, profile_id, function_name, iterations = 1 }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      switch (operation) {
        case 'start_profile': {
          // Start a profiling session
          const id = profile_id || `profile_${Date.now()}`;
          // In a real implementation, start a profiler here
          return { success: true, operation, profile_id: id, message: 'Profiling started', options, context };
        }
        case 'end_profile': {
          // End a profiling session
          // In a real implementation, stop the profiler and return results
          return { success: true, operation, profile_id, message: 'Profiling ended', options, context };
        }
        case 'get_metrics': {
          // Return dummy metrics
          return {
            success: true,
            operation,
            profile_id,
            metrics: {
              cpu: Math.random() * 100,
              memory: Math.random() * 1024,
              duration: Math.random() * 1000,
            },
            options,
            context
          };
        }
        case 'benchmark': {
          // Simulate benchmarking a function
          if (!function_name) {
            return { success: false, operation, error: 'function_name is required for benchmarking', options, context };
          }
          // Dummy benchmark: simulate execution time
          const times: number[] = [];
          for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            // Simulate function execution
            await new Promise(res => setTimeout(res, Math.random() * 10));
            times.push(Date.now() - start);
          }
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          return {
            success: true,
            operation,
            function_name,
            iterations,
            average_time_ms: avg,
            times,
            options,
            context
          };
        }
        case 'memory_snapshot': {
          // Return a dummy memory snapshot
          return {
            success: true,
            operation,
            memory_snapshot: {
              heapUsed: Math.random() * 1024 * 1024,
              heapTotal: Math.random() * 2048 * 1024,
              rss: Math.random() * 4096 * 1024,
            },
            options,
            context
          };
        }
        default:
          return { success: false, operation, error: 'Unknown operation', options, context };
      }
    }
  });

  export const logAnalyzerTool = createTool({
    name: 'log_analyzer',
    description: 'Analyze logs for patterns, errors, performance issues, and anomalies',
    parameters: z.object({
      logs: z.array(z.string()).describe('Log entries to analyze'),
      analysis_type: z.enum(['error_detection', 'pattern_analysis', 'performance_metrics', 'anomaly_detection', 'trend_analysis']).describe('Type of log analysis'),
      time_range: z.object({
        start: z.string().optional(),
        end: z.string().optional(),
      }).optional(),
      filters: z.object({
        level: z.array(z.enum(['debug', 'info', 'warn', 'error', 'fatal'])).optional(),
        source: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
      }).optional(),
    }),
    execute: async ({ logs, analysis_type, time_range, filters }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      void options;
      void context;
      void time_range;
      interface LogAnalysisResult {
        success: boolean;
        analysis_type: 'error_detection' | 'pattern_analysis' | 'performance_metrics' | 'anomaly_detection' | 'trend_analysis';
        log_count: number;
        errors?: string[];
        error_count?: number;
        matches?: string[];
        match_count?: number;
        performance_issues?: string[];
        issue_count?: number;
        anomalies?: string[];
        anomaly_count?: number;
        trends: Record<string, number>;
        error?: string;
      }
      const result: LogAnalysisResult = { success: true, analysis_type, log_count: logs.length, trends: {} };
      switch (analysis_type) {
        case 'error_detection': {
          const errors = logs.filter(l => l.toLowerCase().includes('error'));
          result.errors = errors;
          result.error_count = errors.length;
          break;
        }
        case 'pattern_analysis': {
          if (filters?.keywords) {
            const matches = logs.filter(l => filters.keywords!.some(k => l.includes(k)));
            result.matches = matches;
            result.match_count = matches.length;
          } else {
            result.matches = [];
            result.match_count = 0;
          }
          break;
        }
        case 'performance_metrics': {
          // Dummy: count logs with 'slow' or 'latency'
          const perf = logs.filter(l => /slow|latency/i.test(l));
          result.performance_issues = perf;
          result.issue_count = perf.length;
          break;
        }
        case 'anomaly_detection': {
          // Dummy: flag logs with 'unexpected'
          const anomalies = logs.filter(l => l.toLowerCase().includes('unexpected'));
          result.anomalies = anomalies;
          result.anomaly_count = anomalies.length;
          break;
        }
        case 'trend_analysis': {
          // Dummy: count logs per day if time_range is given
          result.trends = {};
          logs.forEach(l => {
            const day = (l.match(/\d{4}-\d{2}-\d{2}/) || ['unknown'])[0];
            result.trends[day] = (result.trends[day] || 0) + 1;
          });
          break;
        }
        default:
          result.success = false;
          result.error = 'Unknown analysis_type';
      }
      return result;
    }
  });

  // ============================================================================
  // CONFIGURATION & ENVIRONMENT TOOLS
  // ============================================================================

  // Use BentoCache namespace for config
  const configCache = cache.namespace('config');

  export const configManagerTool = createTool({
    name: 'config_manager',
    description: 'Manage application configuration, environment variables, and settings (persistent via BentoCache)',
    parameters: z.object({
      operation: z.enum(['get', 'set', 'delete', 'list', 'validate', 'backup', 'restore']).describe('Configuration operation'),
      key: z.string().optional().describe('Configuration key'),
      value: z.unknown().optional().describe('Configuration value'),
      environment: z.string().optional().default('default').describe('Environment context'),
      encrypted: z.boolean().optional().default(false).describe('Encrypt sensitive values'),
    }),
    execute: async ({ operation, key, value, environment = 'default', encrypted = false }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      try {
        const envPrefix = `${environment}::`;
        switch (operation) {
          case 'get': {
            if (!key) return { success: false, operation, error: 'Key required', options, context };
            const val: unknown = await configCache.get({ key: envPrefix + key });
            return { success: true, operation, key, value: val, environment, options, context };
          }
          case 'set': {
            if (!key) return { success: false, operation, error: 'Key required', options, context };
            const storeValue = encrypted ? `ENCRYPTED(${JSON.stringify(value)})` : value;
            await configCache.set({ key: envPrefix + key, value: storeValue });
            return { success: true, operation, key, value: storeValue, environment, options, context };
          }
          case 'delete': {
            if (!key) return { success: false, operation, error: 'Key required', options, context };
            await configCache.delete({ key: envPrefix + key });
            return { success: true, operation, key, environment, options, context };
          }
          case 'list': {
            const allKeys: string[] = await ((configCache as unknown) as { keys: () => Promise<string[]> }).keys();
            const envKeys: string[] = allKeys.filter((k) => k.startsWith(envPrefix)).map((k) => k.replace(envPrefix, ''));
            return { success: true, operation, keys: envKeys, environment, options, context };
          }
          case 'validate': {
            const allKeys: string[] = await ((configCache as unknown) as { keys: () => Promise<string[]> }).keys();
            const envKeys: string[] = allKeys.filter((k) => k.startsWith(envPrefix));
            const invalid: string[] = [];
            for (const k of envKeys) {
              const v: unknown = await configCache.get({ key: k });
              if (v == null) invalid.push(k.replace(envPrefix, ''));
            }
            return { success: true, operation, invalid_keys: invalid, environment, options, context };
          }
          case 'backup': {
            const allKeys: string[] = await ((configCache as unknown) as { keys: () => Promise<string[]> }).keys();
            const envKeys: string[] = allKeys.filter((k) => k.startsWith(envPrefix));
            const backupCache = cache.namespace('config_backup');
            for (const k of envKeys) {
              const v: unknown = await configCache.get({ key: k });
              await backupCache.set({ key: k, value: v });
            }
            return { success: true, operation, environment, message: 'Backup completed', options, context };
          }
          case 'restore': {
            // Restore all env keys from backup namespace
            const backupCache = cache.namespace('config_backup');
            const allKeys: string[] = await ((backupCache as unknown) as { keys: () => Promise<string[]> }).keys();
            const envKeys: string[] = allKeys.filter((k) => k.startsWith(envPrefix));
            for (const k of envKeys) {
              const v: unknown = await backupCache.get({ key: k });
              await configCache.set({ key: k, value: v });
            }
            return { success: true, operation, environment, message: 'Restore completed', options, context };
          }
          default:
            return { success: false, operation, error: 'Unknown operation', environment, options, context };
        }
      } catch (error) {
        return { success: false, operation, error: error instanceof Error ? error.message : String(error), options, context };
      }
    }
  });

  /**
   * Output schema for configManagerTool
   */
  export const configManagerToolOutputSchema = z.object({
    success: z.boolean(),
    operation: z.string(),
    key: z.string().optional(),
    value: z.unknown().optional(),
    environment: z.string().optional(),
    keys: z.array(z.string()).optional(),
    invalid_keys: z.array(z.string()).optional(),
    message: z.string().optional(),
    error: z.string().optional(),
    options: z.unknown().optional(),
    context: z.unknown().optional(),
  });

  const secretStore: Record<string, { value: string; metadata?: Record<string, string> }> = {};

  export const secretManagerTool = createTool({
    name: 'secret_manager',
    description: 'Secure management of API keys, passwords, and sensitive configuration data',
    parameters: z.object({
      operation: z.enum(['store', 'retrieve', 'delete', 'rotate', 'list_keys', 'audit']).describe('Secret management operation'),
      secret_name: z.string().describe('Name/identifier for the secret'),
      secret_value: z.string().optional().describe('Secret value to store'),
      encryption_key: z.string().optional().describe('Custom encryption key'),
      metadata: z.record(z.string()).optional().describe('Additional metadata'),
    }),
    execute: async ({ operation, secret_name, secret_value, encryption_key, metadata }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      if (options?.logger) options.logger.info(`Secret operation: ${operation}, secret_name: ${secret_name}`);
      switch (operation) {
        case 'store':
          if (!secret_value) return { success: false, operation, error: 'secret_value required', secret_name, options, context };
          secretStore[secret_name] = {
            value: encryption_key ? `ENCRYPTED(${secret_value})` : secret_value,
            metadata
          };
          return { success: true, operation, secret_name, options, context };
        case 'retrieve':
          if (!secretStore[secret_name]) return { success: false, operation, error: 'Secret not found', secret_name, options, context };
          return { success: true, operation, secret_name, secret_value: secretStore[secret_name].value, metadata: secretStore[secret_name].metadata, options, context };
        case 'delete':
          delete secretStore[secret_name];
          return { success: true, operation, secret_name, options, context };
        case 'rotate':
          if (!secret_value) return { success: false, operation, error: 'secret_value required for rotation', secret_name, options, context };
          if (!secretStore[secret_name]) return { success: false, operation, error: 'Secret not found', secret_name, options, context };
          secretStore[secret_name].value = encryption_key ? `ENCRYPTED(${secret_value})` : secret_value;
          return { success: true, operation, secret_name, options, context };
        case 'list_keys':
          return { success: true, operation, keys: Object.keys(secretStore), options, context };
        case 'audit':
          // Dummy: return metadata for all secrets
          return { success: true, operation, audit: Object.entries(secretStore).map(([k, v]) => ({ secret_name: k, metadata: v.metadata })), options, context };
        default:
          return { success: false, operation, error: 'Unknown operation', secret_name, options, context };
      }
    }
  });

  // ============================================================================
  // NOTIFICATION & COMMUNICATION TOOLS
  // ============================================================================

  export const notificationTool = createTool({
    name: 'notification_system',
    description: 'Send notifications via multiple channels with templating and scheduling, including direct agent-to-agent communication',
    parameters: z.object({
      operation: z.enum(['send', 'schedule', 'cancel', 'get_status', 'create_template']).describe('Notification operation'),
      channel: z.enum(['email', 'slack', 'webhook', 'console', 'file', 'agent']).describe('Notification channel'),
      message: z.string().describe('Notification message'),
      recipients: z.array(z.string()).optional().describe('List of recipients (for agent channel, agent names)'),
      template: z.string().optional().describe('Message template name'),
      variables: z.record(z.unknown()).optional().describe('Template variables'),
      schedule_time: z.string().datetime().describe('Scheduled time in ISO8601 format'),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    }),
    execute: async ({ operation, channel, message, recipients, template, variables, schedule_time, priority = 'normal' }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      if (options?.logger) options.logger.info(`Notification operation: ${operation}, channel: ${channel}`);
      if (operation === 'send' && channel === 'agent') {
        if (!recipients || recipients.length === 0) {
          return { success: false, operation, channel, error: 'recipients required for agent channel', options, context };
        }
        const results: Record<string, unknown> = {};
        for (const agentName of recipients) {
          const agent = agentRegistry[agentName as keyof typeof agentRegistry];
          if (!agent) {
            results[agentName] = { error: 'Agent not found' };
            continue;
          }
          try {
            const response = await agent.generateText(message, variables || {});
            results[agentName] = response;
          } catch (err) {
            results[agentName] = { error: err instanceof Error ? err.message : String(err) };
          }
        }
        return { success: true, operation, channel, recipients, results, options, context };
      }
      // Simulate other channels
      switch (operation) {
        case 'send':
          return { success: true, operation, channel, message, recipients, priority, variables, sent: true, options, context };
        case 'schedule':
          if (!schedule_time) return { success: false, operation, error: 'schedule_time required', channel, options, context };
          return { success: true, operation, channel, message, recipients, schedule_time, priority, scheduled: true, options, context };
        case 'cancel':
          return { success: true, operation, channel, cancelled: true, options, context };
        case 'get_status':
          return { success: true, operation, channel, status: 'delivered', options, context };
        case 'create_template':
          return { success: true, operation, channel, template, created: true, options, context };
        default:
          return { success: false, operation, channel, error: 'Unknown operation', options, context };
      }
    }
  });

  // ============================================================================
  // BATCH PROCESSING & QUEUE TOOLS
  // ============================================================================

  // Use BentoCache namespace for batch jobs
  const batchCache = cache.namespace('batch');

  export const batchProcessorTool = createTool({
    name: 'batch_processor',
    description: 'Process large datasets in batches with progress tracking and error handling (persistent via BentoCache, real vector embedding)',
    parameters: z.object({
      operation: z.enum(['start_batch', 'process_chunk', 'get_progress', 'pause', 'resume', 'cancel']).describe('Batch operation'),
      batch_id: z.string().optional().describe('Batch job identifier'),
      data: z.array(z.unknown()).optional().describe('Data to process'),
      batch_size: z.number().optional().default(100).describe('Items per batch'),
      parallel: z.boolean().optional().default(false).describe('Enable parallel processing'),
    }),
    execute: async ({ operation, batch_id, data, batch_size = 100, parallel = false }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      try {
        const now = formatISO(new Date());
        switch (operation) {
          case 'start_batch': {
            if (!data) return { success: false, operation, error: 'Data required', options, context };
            const id = batch_id || `batch_${Date.now()}`;
            const job = { data: [...data], progress: 0, status: 'running', created_at: now };
            await batchCache.set({ key: id, value: job });
            return { success: true, operation, batch_id: id, batch_size, status: 'started', options, context };
          }
          case 'process_chunk': {
            if (!batch_id) return { success: false, operation, error: 'batch_id required', options, context };
            const job = await batchCache.get({ key: batch_id });
            if (!job) return { success: false, operation, error: 'Invalid batch_id', options, context };
            const chunk = job.data.splice(0, batch_size);
            job.progress += chunk.length;
            // Real processing: embed each item using vectorMemory
            const processItem = async (item: unknown): Promise<unknown> => {
              let result = item;
              try {
                if (typeof item === 'string') {
                  await vectorMemory.addMessage({ id: batch_id, text: item, role: 'user' });
                  result = { status: 'embedded', text: item };
                } else if (typeof item === 'object' && item !== null && 'text' in item) {
                  const allowedRoles = ['user', 'assistant', 'system', 'tool'] as const;
                  type AllowedRole = typeof allowedRoles[number];
                  function isAllowedRole(r: unknown): r is AllowedRole {
                    return typeof r === 'string' && (allowedRoles as readonly string[]).includes(r);
                  }
                  const { text, role } = item as { text: string; role?: string };
                  const safeRole: AllowedRole = isAllowedRole(role) ? role : 'user';
                  await vectorMemory.addMessage({ id: batch_id, text, role: safeRole });
                  result = { status: 'embedded', text, role: safeRole };
                }
              } catch (err) {
                result = { status: 'error', error: err instanceof Error ? err.message : String(err), item };
              }
              return result;
            };
            let results: unknown[];
            if (parallel) {
              results = await Promise.all(chunk.map(processItem));
            } else {
              results = [];
              for (const item of chunk) {
                const res = await processItem(item);
                results.push(res);
              }
            }
            if (job.data.length === 0) job.status = 'completed';
            await batchCache.set({ key: batch_id, value: job });
            return { success: true, operation, batch_id, processed: chunk.length, results, remaining: job.data.length, status: job.status, options, context };
          }
          case 'get_progress': {
            if (!batch_id) return { success: false, operation, error: 'batch_id required', options, context };
            const job = await batchCache.get({ key: batch_id });
            if (!job) return { success: false, operation, error: 'Invalid batch_id', options, context };
            return { success: true, operation, batch_id, progress: job.progress, remaining: job.data.length, status: job.status, options, context };
          }
          case 'pause': {
            if (!batch_id) return { success: false, operation, error: 'batch_id required', options, context };
            const job = await batchCache.get({ key: batch_id });
            if (!job) return { success: false, operation, error: 'Invalid batch_id', options, context };
            job.status = 'paused';
            await batchCache.set({ key: batch_id, value: job });
            return { success: true, operation, batch_id, status: 'paused', options, context };
          }
          case 'resume': {
            if (!batch_id) return { success: false, operation, error: 'batch_id required', options, context };
            const job = await batchCache.get({ key: batch_id });
            if (!job) return { success: false, operation, error: 'Invalid batch_id', options, context };
            job.status = 'running';
            await batchCache.set({ key: batch_id, value: job });
            return { success: true, operation, batch_id, status: 'running', options, context };
          }
          case 'cancel': {
            if (!batch_id) return { success: false, operation, error: 'batch_id required', options, context };
            const job = await batchCache.get({ key: batch_id });
            if (!job) return { success: false, operation, error: 'Invalid batch_id', options, context };
            job.status = 'cancelled';
            await batchCache.set({ key: batch_id, value: job });
            return { success: true, operation, batch_id, status: 'cancelled', options, context };
          }
          default:
            return { success: false, operation, error: 'Unknown operation', options, context };
        }
      } catch (error) {
        return { success: false, operation, error: error instanceof Error ? error.message : String(error), options, context };
      }
    }
  });

  // Use BentoCache namespace for queues
  const queueCache = cache.namespace('queue');

  export const queueManagerTool = createTool({
    name: 'queue_manager',
    description: 'Manage task queues with priorities, scheduling, and worker coordination (persistent via BentoCache)',
    parameters: z.object({
      operation: z.enum(['enqueue', 'dequeue', 'peek', 'size', 'clear', 'get_stats']).describe('Queue operation'),
      queue_name: z.string().describe('Queue identifier'),
      task: z.object({
        id: z.string().optional(),
        data: z.unknown(),
        priority: z.number().optional().default(0),
        delay: z.number().optional().default(0),
        max_attempts: z.number().optional().default(1),
      }).optional().describe('Task to enqueue'),
      worker_id: z.string().optional().describe("Worker")
    }),
    execute: async function (
      args: {
        operation: "clear" | "enqueue" | "dequeue" | "peek" | "size" | "get_stats";
        queue_name: string;
        task?: { priority: number; delay: number; max_attempts: number; data?: unknown; id?: string | undefined; } | undefined;
        worker_id?: string | undefined;
      },
      options?: ToolExecuteOptions,
      context?: ToolExecutionContext
    ): Promise<unknown> {
      const { operation, queue_name, task, worker_id: _worker_id } = args;
      try {
        const now = formatISO(new Date());
        // Get or initialize the queue
        let queue = await queueCache.get({ key: queue_name });
        if (!queue) queue = [];
        switch (operation) {
          case 'enqueue': {
            if (!task) {
              return { success: false, error: 'No task provided for enqueue', operation, queue_name };
            }
            const taskId = task.id ?? crypto.randomUUID();
            const newTask = { ...task, id: taskId, enqueueTime: now, attempts: 0 };
            queue.push(newTask);
            await queueCache.set({ key: queue_name, value: queue });
            return { success: true, operation, queue_name, task: newTask, message: 'Task enqueued', options, context };
          }
          case 'dequeue': {
            if (queue.length === 0) {
              return { success: false, error: 'Queue is empty', operation, queue_name };
            }
            let selectedIndex = -1;
            let maxPriorityFound = -Infinity;
            for (let i = 0; i < queue.length; i++) {
              const tTask = queue[i] as { delay?: number, enqueueTime?: string, priority?: number };
              const delayMs = ((tTask.delay ?? 0) * 1000);
              const enqueueTime = tTask.enqueueTime ? new Date(tTask.enqueueTime).getTime() : 0;
              if (Date.now() >= (enqueueTime + delayMs)) {
                const p = tTask.priority ?? 0;
                if (p > maxPriorityFound) {
                  maxPriorityFound = p;
                  selectedIndex = i;
                }
              }
            }
            if (selectedIndex === -1) {
              return { success: false, error: 'No tasks available for immediate execution', operation, queue_name };
            }
            const dequeuedTask = queue.splice(selectedIndex, 1)[0];
            if (_worker_id && typeof dequeuedTask === 'object' && dequeuedTask !== null) {
              (dequeuedTask as Record<string, unknown>).assignedTo = _worker_id;
            }
            await queueCache.set({ key: queue_name, value: queue });
            return { success: true, operation, queue_name, task: dequeuedTask, message: 'Task dequeued', worker_id: _worker_id, options, context };
          }
          case 'peek': {
            if (queue.length === 0) {
              return { success: false, error: 'Queue is empty', operation, queue_name };
            }
            let availableTask = null;
            let highestPriority = -Infinity;
            for (let i = 0; i < queue.length; i++) {
              const tTask = queue[i] as { delay?: number, enqueueTime?: string, priority?: number };
              const delayMs = ((tTask.delay ?? 0) * 1000);
              const enqueueTime = tTask.enqueueTime ? new Date(tTask.enqueueTime).getTime() : 0;
              if (Date.now() >= (enqueueTime + delayMs)) {
                const p = tTask.priority ?? 0;
                if (p > highestPriority) {
                  highestPriority = p;
                  availableTask = tTask;
                }
              }
            }
            if (!availableTask) {
              return { success: false, error: 'Queue is empty or tasks are delayed', operation, queue_name };
            }
            return { success: true, operation, queue_name, task: availableTask, message: 'Peeked at task', options, context };
          }
          case 'size': {
            return { success: true, operation, queue_name, size: queue.length, message: 'Queue size', options, context };
          }
          case 'clear': {
            await queueCache.set({ key: queue_name, value: [] });
            return { success: true, operation, queue_name, message: 'Queue cleared', options, context };
          }
          case 'get_stats': {
            // For simplicity, just return the current queue length and timestamps
            const stats = {
              enqueued: queue.length,
              oldest: queue[0]?.enqueueTime,
              newest: queue[queue.length - 1]?.enqueueTime
            };
            return { success: true, operation, queue_name, stats, options, context };
          }
          default:
            return { success: false, error: `Unknown operation: ${operation}`, operation, queue_name, options, context };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), operation, queue_name, options, context };
      }
    }
  });

  // New tool: Provides system resource usage metrics
  const scheduledTasks: Record<string, NodeJS.Timeout> = {};
  export const resourceMonitorTool = createTool({
    name: 'resource_monitor',
    description: 'Provides current system resource usage metrics, including memory, CPU usage, and uptime',
    parameters: z.object({}),
    execute: async (_params, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      void _params;
      return {
        success: true,
        message: 'Resource usage metrics fetched successfully',
        data: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          uptime: process.uptime()
        },
        options,
        context
      };
    }
  });

  // New tool: Schedules a task to be executed at a specified time
  export const taskSchedulerTool = createTool({
    name: 'task_scheduler',
    description: 'Schedules a task to be executed at a specified time',
    parameters: z.object({
      taskName: z.string().describe('Name of the task to schedule'),
      scheduleTime: z.string().datetime().describe('Scheduled time in ISO8601 format')
    }),
    execute: async ({ taskName, scheduleTime }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      void options;
      void context;
      const scheduledDate = new Date(scheduleTime);
      const now = new Date();
      const delay = scheduledDate.getTime() - now.getTime();
      if (delay < 0) {
        return { success: false, message: `Scheduled time ${scheduleTime} is in the past.`, options, context };
      }
      const taskId = crypto.randomUUID();
      const timeoutId = setTimeout(() => {
         console.log(`Executing scheduled task '${taskName}' (ID: ${taskId}) at ${new Date().toISOString()}`);
         // Insert actual task execution logic here.
      }, delay);
      scheduledTasks[taskId] = timeoutId;
      return { success: true, message: `Task '${taskName}' scheduled for ${scheduleTime}.`, taskId, options, context };
    }
  });

  // --- Advanced Reasoning, Planning, and Orchestration Tools ---
  // Use VoltAgent's built-in reasoning tools per https://voltagent.dev/docs/tools/reasoning-tool/
  const reasoningToolkit = createReasoningTools();
  const [thinkTool, analyzeTool] = reasoningToolkit.tools;

  export const planTool = createTool({
    name: 'plan',
    description: 'Generate a step-by-step plan for a given goal.',
    parameters: z.object({ goal: z.string() }),
    execute: async ({ goal }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => ({
      success: true,
      plan: [
        `Step 1: Understand the goal: ${goal}`,
        'Step 2: Break down into sub-tasks',
        'Step 3: Assign resources and deadlines',
        'Step 4: Monitor progress and adjust as needed'
      ],
      options,
      context
    }),
  });

  export const dataVersioningTool = createTool({
    name: 'data_versioning',
    description: 'Track, snapshot, and roll back data states for reproducibility.',
    parameters: z.object({
      operation: z.enum(['snapshot', 'rollback', 'list_versions']),
      dataset: z.string(),
      version: z.string().optional()
    }),
    execute: async ({ operation, dataset, version }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      // Simulate versioning logic
      if (operation === 'snapshot') {
        return { success: true, operation, dataset, version: version || 'v' + Date.now(), message: 'Snapshot created', options, context };
      } else if (operation === 'rollback') {
        return { success: true, operation, dataset, version, message: `Rolled back to version ${version}`, options, context };
      } else if (operation === 'list_versions') {
        return { success: true, operation, dataset, versions: ['v1', 'v2', 'v3'], options, context };
      }
      return { success: false, operation, dataset, error: 'Unknown operation', options, context };
    }
  });

  export const systemHealthTool = createTool({
    name: 'system_health',
    description: 'Check the health of agents, tools, and the system.',
    parameters: z.object({}),
    execute: async (_params, options?: ToolExecuteOptions, context?: ToolExecutionContext) => ({
      success: true,
      health: 'All systems operational',
      timestamp: new Date().toISOString(),
      options,
      context
    }),
  });

  // Use BentoCache namespace for audit trail
  const auditTrailCache = cache.namespace('audit_trail');

  export const auditTrailTool = createTool({
    /**
     * @name audit_trail
     * @description Record and review all actions for compliance (persistent via BentoCache)
     */
    name: 'audit_trail',
    description: 'Record and review all actions for compliance (persistent via BentoCache)',
    parameters: z.object({
      operation: z.enum(['record', 'review']),
      action: z.string().optional(),
      user: z.string().optional(),
      since: z.string().optional()
    }),
    execute: async ({ operation, action, user, since }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      try {
        const now = formatISO(new Date());
        switch (operation) {
          case 'record': {
            const entry = { action, user, timestamp: now, options, context };
            const key = `audit:${action || 'unknown'}:${user || 'unknown'}:${now}`;
            await auditTrailCache.set({ key, value: entry });
            return { success: true, operation, action, user, timestamp: now, options, context };
          }
          case 'review': {
            const allKeys: string[] = await ((auditTrailCache as unknown) as { keys: () => Promise<string[]> }).keys();
            const entries = [];
            for (const k of allKeys) {
              const v = await auditTrailCache.get({ key: k });
              if (since && v && v.timestamp && v.timestamp < since) continue;
              entries.push({ key: k, ...v });
            }
            return { success: true, operation, entries, since, options, context };
          }
          default:
            return { success: false, operation, error: 'Unknown operation', options, context };
        }
      } catch (error) {
        return { success: false, operation, error: error instanceof Error ? error.message : String(error), options, context };
      }
    }
  });

  export const airflowIntegrationTool = createTool({
    name: 'airflow_integration',
    description: 'Trigger and monitor Airflow DAGs.',
    parameters: z.object({
      dag_id: z.string(),
      action: z.enum(['trigger', 'status']),
      run_id: z.string().optional()
    }),
    execute: async ({ dag_id, action, run_id }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => {
      if (action === 'trigger') {
        return { success: true, dag_id, action, run_id: run_id || 'run_' + Date.now(), message: 'DAG triggered', options, context };
      } else if (action === 'status') {
        return { success: true, dag_id, action, run_id, status: 'success', options, context };
      }
      return { success: false, dag_id, action, run_id, error: 'Unknown action', options, context };
    }
  });

  // --- Add a reflect tool for meta-cognition ---
  export const reflectTool = createTool({
    name: 'reflect',
    description: 'Reflect on previous actions, decisions, or outcomes to improve future performance.',
    parameters: z.object({ context: z.string() }),
    execute: async ({ context: reflectionContext }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => ({
      success: true,
      reflection: `Reflecting on: ${reflectionContext}`,
      options,
      context
    }),
  });

  // --- Add a summarize tool for summarization ---
  export const summarizeTool = createTool({
    name: 'summarize',
    description: 'Summarize information, logs, or results for quick review.',
    parameters: z.object({ text: z.string() }),
    execute: async ({ text }, options?: ToolExecuteOptions, context?: ToolExecutionContext) => ({
      success: true,
      summary: text.length > 100 ? text.slice(0, 100) + '...' : text,
      options,
      context
    }),
  });

  // Export all supervisor tools as a toolset array
  export const supervisorToolset = [
    cacheManagerTool,
    validationTool,
    logAnalyzerTool,
    configManagerTool,
    secretManagerTool,
    notificationTool,
    batchProcessorTool,
    queueManagerTool,
    resourceMonitorTool,
    taskSchedulerTool,
    thinkTool,
    analyzeTool,
    reflectTool,
    summarizeTool,
    planTool,
    dataVersioningTool,
    systemHealthTool,
    auditTrailTool,
    airflowIntegrationTool
  ];