import { BaseRetriever, type BaseMessage } from "@voltagent/core";
import { vectorMemory } from './vectorMemory.js';
import { globalMemory } from './index.js';

/**
 * Supervisor-specific retriever that searches both vector memory and conversation history
 * for relevant multi-agent, delegation, and workflow context.
 */
export class SupervisorRetriever extends BaseRetriever {
  constructor(options?: { toolName?: string; toolDescription?: string }) {
    super({
      toolName: options?.toolName || "search_supervisor_context",
      toolDescription: options?.toolDescription ||
        "Searches conversation history and vector memory for relevant multi-agent, delegation, and workflow context. Use when you need to reference previous delegation decisions, agent outcomes, or workflow discussions.",
    });
  }

  /**
   * Retrieve relevant supervisor context from both vector and conversation memory, using a thread (conversationId) if provided
   */
  async retrieve(input: string | BaseMessage[], conversationId?: string): Promise<string> {
    try {
      // Determine the actual query string from the input
      let query: string = "";
      if (typeof input === "string") {
        query = input;
      } else if (Array.isArray(input) && input.length > 0) {
        const lastMessage = input[input.length - 1];
        if (typeof lastMessage.content === 'string') {
          query = lastMessage.content;
        } else if (Array.isArray(lastMessage.content)) {
          query = lastMessage.content
            .filter(item => typeof item === 'string' || (item && typeof item === 'object' && item.type === 'text'))
            .map(item => typeof item === 'string' ? item : item.text || '')
            .join(' ');
        } else {
          query = JSON.stringify(lastMessage.content);
        }
      } else {
        return "No search query provided.";
      }

      if (!query || query.trim().length === 0) {
        return "No valid search query provided.";
      }

      console.log(`SupervisorRetriever: Searching for supervisor context related to "${query}"`);

      // Search vector memory for semantically similar content
      const vectorResults = await vectorMemory.search(query, 5);
      // Get recent conversation history for additional context (thread-aware)
      const recentContext = conversationId
        ? await globalMemory.getRecentContext(conversationId, 10)
        : await globalMemory.getRecentContext('main-user', 10);
      // Format the retrieved information
      let contextString = "";
      if (vectorResults.length > 0) {
        contextString += "## Relevant Previous Delegations/Workflows:\n\n";
        vectorResults.forEach((item, index) => {
          contextString += `### Context ${index + 1} (${item.role}):\n`;
          contextString += `${item.text}\n`;
          contextString += `*Created: ${item.created_at}*\n\n`;
        });
      }
      if (recentContext && recentContext !== "No previous conversation context.") {
        contextString += "## Recent Supervisor Conversation Context:\n\n";
        contextString += recentContext + "\n\n";
      }
      if (contextString === "") {
        return "No relevant supervisor context found in conversation history or vector memory.";
      }
      return contextString;
    } catch (error) {
      console.error("Error in SupervisorRetriever:", error);
      return `Error retrieving supervisor context: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

// Export a singleton instance for use in the supervisor agent
export const supervisorRetriever = new SupervisorRetriever();
