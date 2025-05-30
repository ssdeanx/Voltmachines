import { BaseRetriever, type BaseMessage } from "@voltagent/core";
import { vectorMemory } from './vectorMemory.js';
import { enhancedVoltMemory } from './voltAgentMemory.js';

/**
 * Code-specific retriever that searches both vector memory and conversation history
 * for relevant code examples, documentation, and technical context
 */
export class CodeRetriever extends BaseRetriever {
  constructor(options?: { toolName?: string; toolDescription?: string }) {
    super({
      toolName: options?.toolName || "search_code_context",
      toolDescription: options?.toolDescription || 
        "Searches conversation history and vector memory for relevant code examples, technical documentation, and development context. Use when you need to reference previous code discussions, examples, or technical solutions.",
    });
  }

  /**
   * Retrieve relevant code context from both vector and conversation memory, using a thread (conversationId) if provided
   */
  async retrieve(input: string | BaseMessage[], conversationId?: string): Promise<string> {
    try {
      // Determine the actual query string from the input
      const query = typeof input === "string" ? input : (input[input.length - 1]?.content as string);
      if (!query) {
        return "No search query provided.";
      }
      console.log(`CodeRetriever: Searching for code context related to "${query}"`);
      // Search vector memory for semantically similar content
      const vectorResults = await vectorMemory.search(query, 5);
      // Get recent conversation history for additional context (thread-aware)
      let recentContext = "";
      if (conversationId) {
        const result = await enhancedVoltMemory.getMessagesWithContext(conversationId, { limit: 10 });
        if (result && result.messages && result.messages.length > 0) {
          recentContext = result.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        }
      }
      // Format the retrieved information
      let contextString = "";
      if (vectorResults.length > 0) {
        contextString += "## Relevant Previous Discussions:\n\n";
        vectorResults.forEach((item, index) => {
          contextString += `### Context ${index + 1} (${item.role}):\n`;
          contextString += `${item.text}\n`;
          contextString += `*Created: ${item.created_at}*\n\n`;
        });
      }
      if (recentContext && recentContext !== "No previous conversation context.") {
        contextString += "## Recent Conversation Context:\n\n";
        contextString += recentContext + "\n\n";
      }
      if (contextString === "") {
        return "No relevant code context found in conversation history or vector memory.";
      }
      return contextString;
    } catch (error) {
      console.error("Error in CodeRetriever:", error);
      return `Error retrieving code context: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

// --- Agent-specific retrievers ---

export class DataAnalysisRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_data_analysis_context",
      toolDescription: "Retrieves data analysis context, previous analyses, and relevant datasets from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_data_analysis_context" }).retrieve(input, conversationId);
  }
}
export const dataAnalysisRetriever = new DataAnalysisRetriever();

export class DeveloperRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_developer_context",
      toolDescription: "Retrieves developer context, code reviews, and technical discussions from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_developer_context" }).retrieve(input, conversationId);
  }
}
export const developerRetriever = new DeveloperRetriever();

export class FileManagerRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_file_manager_context",
      toolDescription: "Retrieves file management context, file operations, and project structure discussions from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_file_manager_context" }).retrieve(input, conversationId);
  }
}
export const fileManagerRetriever = new FileManagerRetriever();

export class ContentCreationRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_content_creation_context",
      toolDescription: "Retrieves content creation context, writing drafts, and editorial feedback from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_content_creation_context" }).retrieve(input, conversationId);
  }
}
export const contentCreationRetriever = new ContentCreationRetriever();

export class ResearchRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_research_context",
      toolDescription: "Retrieves research context, literature reviews, and fact-checking discussions from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_research_context" }).retrieve(input, conversationId);
  }
}
export const researchRetriever = new ResearchRetriever();

export class SystemAdminRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_system_admin_context",
      toolDescription: "Retrieves system administration context, monitoring logs, and troubleshooting history from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_system_admin_context" }).retrieve(input, conversationId);
  }
}
export const systemAdminRetriever = new SystemAdminRetriever();

export class DocumentationRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_documentation_context",
      toolDescription: "Retrieves documentation context, API references, and doc feedback from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_documentation_context" }).retrieve(input, conversationId);
  }
}
export const documentationRetriever = new DocumentationRetriever();

export class WorkerRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_worker_context",
      toolDescription: "Retrieves worker agent context, delegated tasks, and sub-agent results from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_worker_context" }).retrieve(input, conversationId);
  }
}
export const workerRetriever = new WorkerRetriever();

export class ProblemSolvingRetriever extends BaseRetriever {
  constructor() {
    super({
      toolName: "search_problem_solving_context",
      toolDescription: "Retrieves problem solving context, hypotheses, and solution steps from memory and vector search."
    });
  }
  async retrieve(input: string | BaseMessage[], conversationId?: string) {
    return new CodeRetriever({ toolName: "search_problem_solving_context" }).retrieve(input, conversationId);
  }
}
export const problemSolvingRetriever = new ProblemSolvingRetriever();

// Default code retriever singleton
export const codeRetriever = new CodeRetriever();
