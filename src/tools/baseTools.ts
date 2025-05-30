import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { ToolExecuteOptions, ToolExecutionContext } from "@voltagent/core";
export const calculatorTool = createTool({
  name: 'calculator',
  description: 'Perform mathematical calculations including basic arithmetic, trigonometry, and advanced operations',
  parameters: z.object({
    expression: z.string().describe('Mathematical expression to evaluate (e.g., "2 + 2", "sin(45)", "sqrt(16)")'),
    operation: z.enum(['arithmetic', 'trigonometry', 'advanced']).optional().describe('Type of mathematical operation'),
  }),
  execute: async (
    { expression, operation }: { expression: string; operation?: 'arithmetic' | 'trigonometry' | 'advanced' },
    options?: ToolExecuteOptions,
    context?: ToolExecutionContext
  ) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().,\s\w]/g, '');
      if (operation === 'arithmetic' || !operation) {
        const result = Function(`"use strict"; return (${sanitized})`)();
        return {
          result: result,
          expression: expression,
          type: 'arithmetic',
          options,
          context
        };
      }
      const mathFunctions = {
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        pow: Math.pow,
        log: Math.log,
        exp: Math.exp,
        abs: Math.abs,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        pi: Math.PI,
        e: Math.E
      };
      const result = Function(
        'sin', 'cos', 'tan', 'sqrt', 'pow', 'log', 'exp', 'abs', 'floor', 'ceil', 'round', 'pi', 'e',
        `"use strict"; return (${sanitized})`
      )(...Object.values(mathFunctions));
      return {
        result: result,
        expression: expression,
        type: operation || 'advanced',
        options,
        context
      };
    } catch (error) {
      return {
        error: `Invalid mathematical expression: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expression: expression,
        options,
        context
      };
    }
  }
});

export const textAnalyzerTool = createTool({
  name: 'text_analyzer',
  description: 'Analyze text for various metrics including length, readability, word frequency, and structure',
  parameters: z.object({
    text: z.string().describe('Text content to analyze'),
    analysis_type: z.enum(['basic', 'detailed', 'sentiment', 'structure']).describe('Type of analysis to perform'),
  }),
  execute: async (
    { text, analysis_type }: { text: string; analysis_type: 'basic' | 'detailed' | 'sentiment' | 'structure' },
    options?: ToolExecuteOptions,
    context?: ToolExecutionContext
  ) => {
    const words = text.trim().split(/\s+/).filter((word: string) => word.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);
    const basicMetrics = {
      character_count: text.length,
      word_count: words.length,
      sentence_count: sentences.length,
      paragraph_count: paragraphs.length,
      average_words_per_sentence: sentences.length > 0 ? (words.length / sentences.length).toFixed(2) : 0,
    };
    if (analysis_type === 'basic') {
      return { metrics: basicMetrics, type: 'basic', options, context };
    }
    const wordFreq = words.reduce((freq: Record<string, number>, word: string) => {
      const clean = word.toLowerCase().replace(/[^\w]/g, '');
      freq[clean] = (freq[clean] || 0) + 1;
      return freq;
    }, {});
    const topWords = Object.entries(wordFreq)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
    if (analysis_type === 'detailed') {
      return {
        metrics: basicMetrics,
        word_frequency: topWords,
        readability: {
          avg_word_length: words.reduce((sum: number, word: string) => sum + word.length, 0) / words.length,
          complex_words: words.filter((word: string) => word.length > 6).length,
        },
        type: 'detailed',
        options,
        context
      };
    }
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome', 'love', 'perfect'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'worst', 'disappointing', 'poor'];
    const positiveCount = words.filter((word: string) => 
      positiveWords.some(pos => word.toLowerCase().includes(pos))
    ).length;
    const negativeCount = words.filter((word: string) => 
      negativeWords.some(neg => word.toLowerCase().includes(neg))
    ).length;
    const sentiment = positiveCount > negativeCount ? 'positive' : 
                     negativeCount > positiveCount ? 'negative' : 'neutral';
    return {
      metrics: basicMetrics,
      sentiment: {
        overall: sentiment,
        positive_indicators: positiveCount,
        negative_indicators: negativeCount,
        confidence: Math.abs(positiveCount - negativeCount) / words.length
      },
      word_frequency: topWords,
      type: 'sentiment',
      options,
      context
    };
  }
});

export const dataFormatterTool = createTool({
  name: 'data_formatter',
  description: 'Convert data between different formats (JSON, CSV, XML, etc.) and validate structure',
  parameters: z.object({
    data: z.string().describe('Input data to format or convert'),
    input_format: z.enum(['json', 'csv', 'xml', 'yaml', 'auto']).describe('Format of input data'),
    output_format: z.enum(['json', 'csv', 'xml', 'yaml', 'table']).describe('Desired output format'),
    options: z.object({
      pretty: z.boolean().optional().describe('Pretty print output'),
      validate: z.boolean().optional().describe('Validate data structure'),
    }).optional()
  }),
  execute: async ({
    data,
    input_format,
    output_format,
    options = {}
  }: {
    data: string;
    input_format: 'json' | 'csv' | 'xml' | 'yaml' | 'auto';
    output_format: 'json' | 'csv' | 'xml' | 'yaml' | 'table';
    options?: { pretty?: boolean; validate?: boolean }
  }, execOptions?: ToolExecuteOptions, execContext?: ToolExecutionContext) => {
    try {
      let parsedData: any;
      if (input_format === 'json' || input_format === 'auto') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          if (input_format === 'json') throw e;
        }
      }
      if (input_format === 'csv' || (input_format === 'auto' && !parsedData)) {
        const lines = data.trim().split('\n');        const headers = lines[0].split(',').map((h: string) => h.trim());
        parsedData = lines.slice(1).map((line: string) => {
          const values = line.split(',').map((v: string) => v.trim());
          return headers.reduce((obj: any, header: string, i: number) => {
            obj[header] = values[i] || '';
            return obj;
          }, {});
        });
      }
      if (!parsedData) {
        throw new Error('Could not parse input data');
      }
      let result: string;
      switch (output_format) {
        case 'json':
          result = options?.pretty ? JSON.stringify(parsedData, null, 2) : JSON.stringify(parsedData);
          break;
        case 'csv':
          if (Array.isArray(parsedData) && parsedData.length > 0) {
            const headers = Object.keys(parsedData[0]);
            const csvLines = [
              headers.join(','),
              ...parsedData.map(row => headers.map(h => row[h] || '').join(','))
            ];
            result = csvLines.join('\n');
          } else {
            throw new Error('Data must be an array of objects for CSV conversion');
          }
          break;
        case 'table':
          if (Array.isArray(parsedData)) {
            const headers = Object.keys(parsedData[0] || {});
            result = `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n` +
                    parsedData.map(row => `| ${headers.map(h => row[h] || '').join(' | ')} |`).join('\n');
          } else {
            result = JSON.stringify(parsedData, null, 2);
          }
          break;
        default:
          result = JSON.stringify(parsedData, null, 2);
      }
      return {
        success: true,
        data: result,
        input_format: input_format,
        output_format: output_format,
        record_count: Array.isArray(parsedData) ? parsedData.length : 1,
        execOptions,
        execContext
      };
    } catch (error) {
      return {
        success: false,
        error: `Data formatting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        input_format: input_format,
        output_format: output_format,
        execOptions,
        execContext
      };
    }
  }
});

export const systemInfoTool = createTool({
  name: 'system_info',
  description: 'Get system information including environment, process details, and performance metrics',
  parameters: z.object({
    info_type: z.enum(['basic', 'process', 'environment', 'performance']).describe('Type of system information to retrieve'),
  }),

  execute: async (
    { info_type }: { info_type: 'basic' | 'process' | 'environment' | 'performance' },
    options?: ToolExecuteOptions,
    context?: ToolExecutionContext
  ) => {
    const basicInfo = {
      platform: process.platform,
      architecture: process.arch,
      node_version: process.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    if (info_type === 'basic') {
      return { info: basicInfo, type: 'basic', options, context };
    }
    if (info_type === 'process') {
      return {
        info: {
          ...basicInfo,
          process_id: process.pid,
          memory_usage: process.memoryUsage(),
          cpu_usage: process.cpuUsage(),
          working_directory: process.cwd(),
        },
        type: 'process',
        options,
        context
      };
    }
    if (info_type === 'environment') {
      const envVars = Object.keys(process.env).filter(key => 
        !key.includes('SECRET') && !key.includes('KEY') && !key.includes('TOKEN')
      ).reduce((env: Record<string, string>, key) => {
        env[key] = process.env[key] || '';
        return env;
      }, {});
      return {
        info: {
          ...basicInfo,
          environment_variables: envVars,
        },
        type: 'environment',
        options,
        context
      };
    }
    return {
      info: {
        ...basicInfo,
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        performance_marks: performance.getEntriesByType('mark'),
        resource_usage: process.resourceUsage(),
      },
      type: 'performance',
      options,
      context
    };
  }
});