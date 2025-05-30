import { BaseRetriever, type BaseMessage } from "@voltagent/core";
import { vectorMemory } from './vectorMemory.js';
import { enhancedVoltMemory } from './voltAgentMemory.js';
import { agentRegistry } from '../agents/index.js';

/**
 * Supervisor-specific retriever that searches both vector memory and conversation history
 * for relevant multi-agent, delegation, and workflow context, including sub-agent context aggregation.
 */
export class SupervisorRetriever extends BaseRetriever {
  constructor(options?: { toolName?: string; toolDescription?: string }) {
    super({
      toolName: options?.toolName || "search_supervisor_context",
      toolDescription: options?.toolDescription ||
        "Searches conversation history, vector memory, and all sub-agent threads for relevant multi-agent, delegation, and workflow context. Use when you need to reference previous delegation decisions, agent outcomes, workflow discussions, or sub-agent results.",
    });
  }

  /**
   * Retrieve relevant supervisor context from both vector and conversation memory, using a thread (conversationId) if provided.
   * Also aggregates context from all sub-agents for orchestration.
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
      // Search vector memory for semantically similar content
      const vectorResults = await vectorMemory.search(query, 5);
      // Supervisor's own recent context
      let recentContext = "";
      if (conversationId) {
        const result = await enhancedVoltMemory.getMessagesWithContext(conversationId, { limit: 10 });
        if (result && result.messages && result.messages.length > 0) {
          recentContext = result.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        }
      }
      // Aggregate context from all sub-agents (by agentRegistry)
      let subAgentContexts = "";
      for (const agentKey of Object.keys(agentRegistry)) {
        // Get all conversations for this agent (limit to 1 most recent for brevity)
        const threads = await enhancedVoltMemory.getConversations(agentKey);
        if (threads && threads.length > 0) {
          const thread = threads[0];
          if (thread && thread.id) {
            const subResult = await enhancedVoltMemory.getMessagesWithContext(thread.id, { limit: 5 });
            if (subResult && subResult.messages && subResult.messages.length > 0) {
              subAgentContexts += `### Sub-Agent: ${agentKey}\n`;
              subAgentContexts += subResult.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
              subAgentContexts += '\n';
            }
          }
        }
      }
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
      if (subAgentContexts) {
        contextString += "## Sub-Agent Contexts (for orchestration):\n\n";
        contextString += subAgentContexts + "\n";
      }
      if (contextString === "") {
        return "No relevant supervisor or sub-agent context found in conversation history or vector memory.";
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
