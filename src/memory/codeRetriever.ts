import { BaseRetriever, type BaseMessage } from "@voltagent/core";
import { vectorMemory } from './vectorMemory.js';
import { globalMemory } from './index.js';

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
   * Retrieve relevant code context from both vector and conversation memory
   */
  async retrieve(input: string | BaseMessage[]): Promise<string> {
    try {
      // Determine the actual query string from the input
      const query = typeof input === "string" ? input : (input[input.length - 1]?.content as string);
      
      if (!query) {
        return "No search query provided.";
      }

      console.log(`CodeRetriever: Searching for code context related to "${query}"`);

      // Search vector memory for semantically similar content
      const vectorResults = await vectorMemory.search(query, 5);
      
      // Get recent conversation history for additional context
      const recentContext = await globalMemory.getRecentContext('main-user', 10);
      
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

// Export a singleton instance for use in agents
export const codeRetriever = new CodeRetriever();
