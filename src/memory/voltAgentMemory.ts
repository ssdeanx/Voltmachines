/**
 * Official VoltAgent Memory Configuration
 * Uses LibSQLStorage from @voltagent/core for persistent memory storage
 * Generated on 2025-05-30
 */

import { LibSQLStorage } from "@voltagent/core";

/**
 * System configuration for VoltAgent memory
 */
const memoryConfig = {
  databaseUrl: process.env.DATABASE_URL || "file:./.voltagent/memory.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
  tablePrefix: "voltagent_memory",
  storageLimit: 100,
  debug: true,
};

/**
 * Official VoltAgent LibSQL Memory Storage instance
 * This replaces the custom ConversationMemory and should be used by all agents
 */
export const voltAgentMemory = new LibSQLStorage({
  url: memoryConfig.databaseUrl,
  authToken: memoryConfig.authToken, // Required for Turso
  tablePrefix: memoryConfig.tablePrefix, // Default prefix
  storageLimit: memoryConfig.storageLimit, // Max messages per conversation
  debug: memoryConfig.debug, // Enable debug logging
});

/**
 * Utility: Start or switch to a conversation thread
 * @param resourceId - Resource ID (typically agent name or user identifier)
 * @returns Conversation ID
 */
export async function getOrStartThread(resourceId: string): Promise<string> {
  // Use createConversation to start a new conversation
  const conversationId = crypto.randomUUID();
  const conversation = await voltAgentMemory.createConversation({
    id: conversationId,
    resourceId,
    title: `${resourceId} conversation`,
    metadata: {},
  });
  return conversation.id;
}

/**
 * Utility: List all threads for a user
 * @param resourceId - Resource ID (default: 'main-user')
 */
export async function listThreads(resourceId: string = 'main-user') {
  return await voltAgentMemory.getConversations(resourceId);
}

/**
 * Utility: Get conversation history for a thread
 * @param conversationId - Conversation/thread ID
 * @param limit - Maximum number of messages
 */
export async function getThreadHistory(conversationId: string, limit: number = 50) {
  return await voltAgentMemory.getMessages({ conversationId, limit });
}

export default voltAgentMemory;
