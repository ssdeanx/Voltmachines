/**
 * @fileoverview VoltAgent Memory Configuration and Management
 * 
 * This module provides the official VoltAgent memory configuration using LibSQLStorage
 * for persistent conversation storage, enhanced with vector-based semantic search
 * capabilities for intelligent context retrieval.
 * 
 * The memory system combines:
 * - Persistent conversation storage via LibSQLStorage
 * - Semantic search capabilities via VectorMemory
 * - Thread-aware conversation management
 * - Automatic message embedding and indexing
 * 
 * @author VoltMachines Team
 * @version 0.0.12
 * @since 2025-05-30
 */

import { LibSQLStorage } from "@voltagent/core";
import { vectorMemory, VectorMemory } from "./vectorMemory.js";

/**
 * System configuration for VoltAgent memory subsystem.
 * 
 * Defines database connection, authentication, storage limits, and operational
 * parameters for the memory management system.
 */
const memoryConfig = {
  /** Database URL - supports SQLite file paths and remote database URLs */
  databaseUrl: process.env.DATABASE_URL || "file:./.voltagent/memory.db",
  /** Authentication token for database access (required for Turso/remote databases) */
  authToken: process.env.DATABASE_AUTH_TOKEN,
  /** Table prefix to avoid naming conflicts in shared databases */
  tablePrefix: "voltage",
  /** Maximum number of messages to store per conversation */
  storageLimit: 5000,
  /** Enable debug logging for memory operations */
  debug: true,
};

/**
 * Official VoltAgent LibSQL Memory Storage instance with vector search capabilities.
 * 
 * This is the primary memory storage system that replaces custom ConversationMemory
 * implementations. It provides persistent storage with automatic vector indexing
 * for semantic search and context retrieval.
 * 
 * Features:
 * - Persistent conversation storage via LibSQL
 * - Automatic message embedding and vector indexing
 * - Thread-aware conversation management
 * - Semantic search across conversation history
 * - Configurable storage limits and cleanup
 * 
 * @example
 * 
 * // Store a message with automatic vector indexing
 * await voltAgentMemory.addMessage({
 *   conversationId: "conv-123",
 *   role: "user",
 *   content: "Analyze the sales data"
 * });
 * 
 * // Search for semantically similar messages
 * const similar = await searchSimilarMessages("data analysis", 5);
 * 
 */
export const voltAgentMemory = new LibSQLStorage({
  url: memoryConfig.databaseUrl,
  authToken: memoryConfig.authToken, // Required for Turso
  tablePrefix: memoryConfig.tablePrefix, // Default prefix
  storageLimit: memoryConfig.storageLimit, // Max messages per conversation
  debug: memoryConfig.debug, // Enable debug logging
});

/**
 * Enhanced memory interface that combines persistent storage with vector search.
 * 
 * This class extends the base LibSQL functionality with semantic search capabilities,
 * allowing for intelligent context retrieval based on message similarity rather than
 * just chronological order.
 */
class EnhancedVoltMemory {
  private storage: LibSQLStorage;
  private vectorStore: VectorMemory;

  constructor(storage: LibSQLStorage, vectorStore: VectorMemory) {
    this.storage = storage;
    this.vectorStore = vectorStore;
  }

  /**
   * Adds a message to both persistent storage and vector index.
   * 
   * @param params - Message parameters including conversation ID, role, and content
   * @returns Promise resolving when message is stored and indexed
   * 
   * @example
   * 
   * await enhancedMemory.addMessage({
   *   conversationId: "conv-123",
   *   role: "user",
   *   content: "What's the weather like today?"
   * });
   * 
   */
  async addMessage(params: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }) {
    // Store in persistent storage
    await this.storage.addMessage({
        id: params.conversationId,
        role: params.role,
        content: params.content,
        type: "text",
        createdAt: ""
    });

    // Add to vector index for semantic search
    await this.vectorStore.addMessage({
      id: params.conversationId,
      text: params.content,
      role: params.role,
    });

    return {
      id: params.conversationId,
      role: params.role,
      content: params.content,
      type: "text",
      createdAt: ""
    };
  }

  /**
   * Searches for semantically similar messages across all conversations.
   * 
   * @param query - Search query text
   * @param limit - Maximum number of results to return
   * @returns Promise resolving to array of similar messages with metadata
   * 
   * @example
   * 
   * const similar = await enhancedMemory.searchSimilar("data analysis", 5);
   * similar.forEach(msg => {
   *   console.log(`Similar: ${msg.text} (${msg.role})`);
   * });
   * 
   */
  async searchSimilar(query: string, limit: number = 5) {
    return await this.vectorStore.search(query, limit);
  }

  /**
   * Retrieves conversation messages with optional semantic context.
   * 
   * @param conversationId - Conversation identifier
   * @param options - Retrieval options including limit and context search
   * @returns Promise resolving to messages with optional semantic context
   */
  async getMessagesWithContext(
    conversationId: string, 
    options: {
      limit?: number;
      includeSemanticContext?: boolean;
      contextQuery?: string;
      contextLimit?: number;
    } = {}
  ) {
    const { 
      limit = 50, 
      includeSemanticContext = false, 
      contextQuery, 
      contextLimit = 3 
    } = options;

    // Get conversation messages
    const messages = await this.storage.getMessages({ conversationId, limit });

    if (!includeSemanticContext || !contextQuery) {
      return { messages, context: [] };
    }

    // Get semantic context
    const semanticContext = await this.searchSimilar(contextQuery, contextLimit);

    return {
      messages,
      context: semanticContext,
    };
  }

  // Delegate other methods to the storage instance
  async createConversation(params: {
    id: string;
    resourceId: string;
    title: string;
    metadata: Record<string, unknown>;
  }) {
    return await this.storage.createConversation(params);
  }
  async getConversations(resourceId: string) {
    return await this.storage.getConversations(resourceId);
  }

  async getMessages(params: { conversationId: string; limit?: number }) {
    return await this.storage.getMessages(params);
  }}

/**
 * Enhanced memory instance combining persistent storage with vector search.
 * 
 * This instance provides all the functionality of the base LibSQL storage
 * plus semantic search capabilities for intelligent context retrieval.
 */
export const enhancedVoltMemory = new EnhancedVoltMemory(voltAgentMemory, vectorMemory);

/**
 * Utility function to start or switch to a conversation thread.
 * 
 * Creates a new conversation with a unique ID and associates it with the
 * specified resource (typically an agent name or user identifier).
 * 
 * @param resourceId - Resource ID (typically agent name or user identifier)
 * @returns Promise resolving to the conversation ID
 * 
 * @example
 * 
 * const conversationId = await getOrStartThread("supervisor");
 * console.log(`Started conversation: ${conversationId}`);
 * 
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
 * Utility function to list all conversation threads for a user.
 * 
 * Retrieves all conversations associated with a specific resource ID,
 * providing an overview of conversation history and metadata.
 * 
 * @param resourceId - Resource ID (default: 'main-user')
 * @returns Promise resolving to array of conversation objects
 * 
 * @example
 * 
 * const threads = await listThreads("main-user");
 * console.log(`Found ${threads.length} conversation threads`);
 * 
 * threads.forEach(thread => {
 *   console.log(`Thread: ${thread.title} (${thread.id})`);
 * });
 * 
 */
export async function listThreads(resourceId: string = 'main-user') {
  return await voltAgentMemory.getConversations(resourceId);
}

/**
 * Utility function to get conversation history for a specific thread.
 * 
 * Retrieves messages from a conversation with optional limit, providing
 * access to the chronological message history for context and continuity.
 * 
 * @param conversationId - Conversation/thread ID
 * @param limit - Maximum number of messages to retrieve (default: 50)
 * @returns Promise resolving to array of message objects
 * 
 * @example
 * 
 * const history = await getThreadHistory("conv-123", 20);
 * console.log(`Retrieved ${history.length} messages`);
 * 
 * history.forEach(msg => {
 *   console.log(`${msg.role}: ${msg.content}`);
 * });
 * 
 */
export async function getThreadHistory(conversationId: string, limit: number = 50) {
  return await voltAgentMemory.getMessages({ conversationId, limit });
}

/**
 * Advanced utility function to search for similar messages across conversations.
 * 
 * Uses vector embeddings to find semantically similar messages, enabling
 * intelligent context retrieval based on meaning rather than exact text matches.
 * 
 * @param query - Search query text
 * @param topK - Number of most similar results to return (default: 5)
 * @returns Promise resolving to array of similar messages with similarity scores
 * 
 * @example
 * 
 * const similar = await searchSimilarMessages("data analysis tasks", 3);
 * 
 * similar.forEach(msg => {
 *   console.log(`Found similar message: "${msg.text}"`);
 *   console.log(`Role: ${msg.role}, Created: ${msg.created_at}`);
 * });
 * 
 */
export async function searchSimilarMessages(query: string, topK: number = 5) {
  return await vectorMemory.search(query, topK);
}

/**
 * Utility function to add a message with automatic vector indexing.
 * 
 * Stores a message in both the persistent conversation storage and the
 * vector index for future semantic search capabilities.
 * 
 * @param params - Message parameters
 * @returns Promise resolving to the stored message object
 * 
 * @example
 * 
 * const message = await addMessageWithVectorIndex({
 *   conversationId: "conv-123",
 *   role: "user",
 *   content: "Can you help me analyze this dataset?"
 * });
 * 
 * console.log(`Stored message: ${message.id}`);
 * 
 */
export async function addMessageWithVectorIndex(params: {
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}) {
  return await enhancedVoltMemory.addMessage(params);
}

/**
 * Utility function to get conversation messages with semantic context.
 * 
 * Retrieves conversation messages along with semantically related messages
 * from other conversations, providing rich context for agent responses.
 * 
 * @param conversationId - Conversation identifier
 * @param options - Retrieval and context options
 * @returns Promise resolving to messages with semantic context
 * 
 * @example
 * 
 * const result = await getMessagesWithSemanticContext("conv-123", {
 *   limit: 20,
 *   includeSemanticContext: true,
 *   contextQuery: "data analysis",
 *   contextLimit: 3
 * });
 * 
 * console.log(`Messages: ${result.messages.length}`);
 * console.log(`Context: ${result.context.length}`);
 * 
 */
export async function getMessagesWithSemanticContext(
  conversationId: string,
  options: {
    limit?: number;
    includeSemanticContext?: boolean;
    contextQuery?: string;
    contextLimit?: number;
  } = {}
) {
  return await enhancedVoltMemory.getMessagesWithContext(conversationId, options);
}

/**
 * Memory management best practices and usage guidelines.
 * 
 * @namespace MemoryBestPractices
 * 
 * @example
 * 
 * // 1. Always provide userId and conversationId for proper scoping
 * const response = await agent.generateText("Hello", {
 *   userId: "user-123",
 *   conversationId: "conv-456"
 * });
 * 
 * // 2. Use semantic search for intelligent context retrieval
 * const context = await searchSimilarMessages("previous analysis", 3);
 * 
 * // 3. Combine persistent and vector storage for optimal performance
 * await addMessageWithVectorIndex({
 *   conversationId: "conv-123",
 *   role: "user",
 *   content: "Analyze quarterly sales data"
 * });
 * 
 */

export default voltAgentMemory;
