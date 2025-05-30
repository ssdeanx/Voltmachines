import type {
  BaseMessage,
  MessageRole,
  MessageContent,
  NewTimelineEvent,
  ToolStartEvent,
  ToolSuccessEvent,
  ToolErrorEvent,
  AgentStartEvent,
  AgentSuccessEvent,
  AgentErrorEvent,
  MemoryReadStartEvent,
  MemoryReadSuccessEvent,
  MemoryReadErrorEvent,
  MemoryWriteStartEvent,
  MemoryWriteSuccessEvent,
  MemoryWriteErrorEvent,
  RetrieverStartEvent,
  RetrieverSuccessEvent,
  RetrieverErrorEvent,
} from '@voltagent/core';
import { generateId } from 'ai';
import { databaseConfig } from '../config/database.js';
import type { Client } from '@libsql/client';
import { vectorMemory } from './vectorMemory.js';

/**
 * Memory event data structure
 */
export interface MemoryEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Memory processor function type
 */
export type MemoryProcessor = (event: MemoryEvent) => Promise<void> | void;

/**
 * Conversation metadata interface
 */
export interface ConversationMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  resourceId: string;
  metadata: Record<string, unknown>;
}

/**
 * History value interface for VoltAgent compatibility
 */
export interface HistoryValue {
  conversationId?: string;
  [key: string]: unknown;
}

/**
 * LLM provider interface for summarization
 */
export interface LLMProvider {
  generateText(options: { prompt: string; model: string }): Promise<{ text: string }>;
}

/**
 * Conversation Memory Manager
 * Handles persistent storage and retrieval of conversation history using LibSQL/Turso
 * Implements the VoltAgent Memory interface for full compatibility
 *
 * Best Practices:
 * - Always provide userId and conversationId to agent calls for correct memory scoping and context continuity.
 * - Use ConversationMemory to manage threads/conversations for each user.
 * - To start a new thread: call startConversation(agentName) and use the returned conversationId.
 * - To continue a thread: pass the same userId and conversationId to agent.generateText, streamText, etc.
 * - To list all threads: use getConversations(userId).
 * - To clear or delete a thread: use clearConversation() or implement a delete method.
 */
export class ConversationMemory {
  private db: Client | null = null;
  private conversationId: string | null = null;
  private userId: string;
  private memoryProcessors: Array<MemoryProcessor> = [];

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Initialize database connection and ensure tables exist
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      this.db = await databaseConfig.initialize();
    }
  }

  /**
   * Register a memory processor (e.g., summarizer, embedder, custom logic)
   */
  registerMemoryProcessor(processor: MemoryProcessor) {
    this.memoryProcessors.push(processor);
  }

  /**
   * Call all memory processors for a given event
   */
  private async runMemoryProcessors(event: MemoryEvent) {
    for (const processor of this.memoryProcessors) {
      try {
        await processor(event);
      } catch (error) {
        console.error('Memory processor error:', error);
      }
    }
  }

  /**
   * Start a new conversation or resume existing one for a user/agent thread
   * @param agentName - Name of the agent starting the conversation
   * @returns Conversation ID
   */
  async startConversation(agentName: string): Promise<string> {
    await this.ensureInitialized();
    if (this.conversationId) {
      return this.conversationId;
    }
    try {
      this.conversationId = generateId();
      await this.db!.execute({
        sql: `INSERT INTO conversations (id, user_id, agent_name, created_at, updated_at) \
              VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
        args: [this.conversationId, this.userId, agentName]
      });
      return this.conversationId;
    } catch (error) {
      throw new Error(`Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Get a single conversation (thread) by ID
   * @param conversationId - Conversation/thread ID
   * @returns Conversation metadata or null
   */
  async getConversation(conversationId: string): Promise<ConversationMetadata | null> {
    await this.ensureInitialized();
    const result = await this.db!.execute({
      sql: `SELECT id, agent_name, created_at, updated_at FROM conversations WHERE id = ?`,
      args: [conversationId]
    });
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    let title = '', resourceId = '', metadata = {};
    try {
      const parsed = JSON.parse(row.agent_name as string);
      title = parsed.title || '';
      resourceId = parsed.resourceId || '';
      metadata = parsed.metadata || {};
    } catch { title = row.agent_name as string; }
    return {
      id: row.id as string,
      title,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      resourceId,
      metadata,
    };
  }

  /**
   * List all conversations (threads) for a user
   * @param userId - User ID
   * @returns Array of conversation metadata
   */
  async listConversations(userId: string): Promise<ConversationMetadata[]> {
    await this.ensureInitialized();
    const result = await this.db!.execute({
      sql: `SELECT id, agent_name, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC`,
      args: [userId]
    });
    return result.rows.map(row => {
      let title = '', resourceId = '', metadata = {};
      try {
        const parsed = JSON.parse(row.agent_name as string);
        title = parsed.title || '';
        resourceId = parsed.resourceId || '';
        metadata = parsed.metadata || {};
      } catch { title = row.agent_name as string; }
      return {
        id: row.id as string,
        title,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        resourceId,
        metadata,
      };
    });
  }  /**
   * Add a message to memory (VoltAgent Memory interface)
   * @param message - Message to add (must have BaseMessage structure)
   * @param userId - User ID (required for VoltAgent interface)
   * @param conversationId - Optional conversation/thread ID
   */
  async addMessage(
    message: BaseMessage,
    userId: string,
    conversationId?: string
  ): Promise<void> {
    await this.ensureInitialized();
    const convId = conversationId || this.conversationId;
    if (!convId) {
      throw new Error('No active conversation. Call startConversation() first.');
    }
    try {
      const messageId = generateId();
      // Use MessageContent type for content
      const contentString: MessageContent = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
      // Use MessageRole type for role
      const role: MessageRole = message.role;
      await vectorMemory.addMessage({
        id: messageId,
        text: contentString as string,
        role: role as MessageRole,
      });
      await this.db!.execute({
        sql: `INSERT INTO messages (id, conversation_id, role, content, tool_call_id, tool_name, created_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          messageId,
          convId,
          role,
          contentString,
          null, // tool_call_id
          null  // tool_name
        ]
      });
      await this.db!.execute({
        sql: `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
        args: [convId]
      });
      await this.runMemoryProcessors({
        type: 'addMessage',
        data: { ...message, id: messageId, conversationId: convId, userId }
      });
    } catch (error) {
      throw new Error(`Failed to add message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Legacy addMessage method for backward compatibility
   * @param message - Message to add
   * @param conversationId - Optional conversation/thread ID
   * @param toolCallId - Optional tool call ID for tool messages
   * @param toolName - Optional tool name for tool messages
   */
  async addMessageLegacy(
    message: Omit<BaseMessage, 'id' | 'created_at'>,
    conversationId?: string,
    toolCallId?: string,
    toolName?: string
  ): Promise<void> {
    await this.ensureInitialized();
    const convId = conversationId || this.conversationId;
    if (!convId) {
      throw new Error('No active conversation. Call startConversation() first.');
    }
    
    try {
      const messageId = generateId();
      
      // Serialize content to string for storage
      const contentString = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);
      
      // Add to vector memory for semantic search
      await vectorMemory.addMessage({
        id: messageId,
        text: contentString,
        role: message.role,
      });
      
      await this.db!.execute({
        sql: `INSERT INTO messages (id, conversation_id, role, content, tool_call_id, tool_name, created_at) 
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          messageId,
          convId,
          message.role,
          contentString,
          toolCallId || null,
          toolName || null
        ]
      });
      
      // Update conversation timestamp
      await this.db!.execute({
        sql: `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
        args: [convId]
      });
      
      // Call memory processors
      await this.runMemoryProcessors({ 
        type: 'addMessage', 
        data: { ...message, id: messageId, conversationId: convId } 
      });
    } catch (error) {
      throw new Error(`Failed to add message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add all messages from the current conversation to vector memory (for migration/cold start)
   */
  async syncToVectorMemory() {
    await this.ensureInitialized();
    if (!this.conversationId) return;
    const result = await this.db!.execute({
      sql: `SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      args: [this.conversationId]
    });
    for (const row of result.rows) {
      await vectorMemory.addMessage({
        id: row.id as string,
        text: row.content as string,
        role: row.role as 'user' | 'assistant' | 'system' | 'tool',
      });
    }
  }

  /**
   * Semantic search for similar messages using vector memory
   * @param query - Search query
   * @param topK - Number of top results
   */
  async searchSimilar(query: string, topK: number = 5) {
    return await vectorMemory.search(query, topK);
  }

  /**
   * Retrieve the most relevant messages for a query using vector search
   * @param query - Search query
   * @param topK - Number of top results
   */
  async getRelevantMessages(query: string, topK: number = 5) {
    return await vectorMemory.search(query, topK);
  }  /**
   * Get conversation history for a thread
   * @param conversationId - Conversation/thread ID
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of messages in chronological order
   */
  async getHistory(conversationId: string, limit: number = 50): Promise<BaseMessage[]> {
    await this.ensureInitialized();
    if (!conversationId) {
      return [];
    }
    try {
      const result = await this.db!.execute({
        sql: `SELECT id, role, content, created_at \
              FROM messages \
              WHERE conversation_id = ? \
              ORDER BY created_at ASC \
              LIMIT ?`,
        args: [conversationId, limit]
      });
      return result.rows.map(row => ({
        id: row.id as string,
        role: row.role as BaseMessage['role'],
        content: row.content as string,
        // Note: created_at is not part of BaseMessage interface, so we omit it here
      } as BaseMessage));
    } catch (error) {
      throw new Error(`Failed to get history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recent context for AI model from a thread
   * @param conversationId - Conversation/thread ID
   * @param maxMessages - Maximum number of recent messages
   * @returns Formatted context string
   */
  async getRecentContext(conversationId: string, maxMessages: number = 10): Promise<string> {
    const history = await this.getHistory(conversationId, maxMessages);
    if (history.length === 0) {
      return "No previous conversation context.";
    }
    return history
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
  }

  /**
   * Clear current conversation (thread)
   */
  async clearConversation(): Promise<void> {
    this.conversationId = null;
  }

  /**
   * Get conversation summary statistics for a thread
   * @param conversationId - Conversation/thread ID
   */
  async getConversationStats(conversationId: string): Promise<{
    messageCount: number;
    toolCalls: number;
    startTime: string | null;
    lastActivity: string | null;
  }> {
    await this.ensureInitialized();
    if (!conversationId) {
      return {
        messageCount: 0,
        toolCalls: 0,
        startTime: null,
        lastActivity: null,
      };
    }
    try {
      const [countResult, timeResult] = await Promise.all([
        this.db!.execute({
          sql: `SELECT \
                  COUNT(*) as total_messages,\
                  COUNT(CASE WHEN role = 'tool' THEN 1 END) as tool_calls\
                FROM messages \
                WHERE conversation_id = ?`,
          args: [conversationId]
        }),
        this.db!.execute({
          sql: `SELECT created_at, updated_at \
                FROM conversations \
                WHERE id = ?`,
          args: [conversationId]
        })
      ]);
      const counts = countResult.rows[0];
      const times = timeResult.rows[0];
      return {
        messageCount: Number(counts.total_messages),
        toolCalls: Number(counts.tool_calls),
        startTime: times?.created_at as string || null,
        lastActivity: times?.updated_at as string || null,
      };
    } catch (error) {
      throw new Error(`Failed to get conversation stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove all messages and metadata for a conversation (thread)
   * @param conversationId - Conversation/thread ID
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.ensureInitialized();
    await this.db!.execute({
      sql: `DELETE FROM messages WHERE conversation_id = ?`,
      args: [conversationId]
    });
    await this.db!.execute({
      sql: `DELETE FROM conversations WHERE id = ?`,
      args: [conversationId]
    });
  }  /**
   * List all messages for a user across all threads (for VoltAgent Memory interface)
   * @param userId - User ID
   * @param limit - Max messages
   */
  async getAllMessages(userId: string, limit: number = 100): Promise<BaseMessage[]> {
    await this.ensureInitialized();
    const result = await this.db!.execute({
      sql: `SELECT id, role, content, created_at FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?) ORDER BY created_at DESC LIMIT ?`,
      args: [userId, limit]
    });
    return result.rows.map(row => ({
      id: row.id as string,
      role: row.role as BaseMessage['role'],
      content: row.content as string,
      // Note: created_at is not part of BaseMessage interface
    } as BaseMessage));
  }
  /**
   * Get messages from memory (VoltAgent Memory interface)
   * @param options - Filter options for retrieving messages
   * @returns Array of messages matching the filter criteria
   */
  async getMessages(options: { 
    userId?: string; 
    conversationId?: string; 
    limit?: number; 
    before?: number; 
    after?: number; 
    role?: string 
  } = {}): Promise<BaseMessage[]> {
    await this.ensureInitialized();
    const { userId, conversationId, limit = 50, before, after, role } = options;
    
    let sql = `SELECT id, role, content, created_at FROM messages WHERE 1=1`;
    const args: (string | number)[] = [];
    
    if (conversationId) {
      sql += ` AND conversation_id = ?`;
      args.push(conversationId);
    } else if (userId) {
      sql += ` AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)`;
      args.push(userId);
    }
    
    if (role) {
      sql += ` AND role = ?`;
      args.push(role);
    }
    
    if (before) {
      sql += ` AND created_at < ?`;
      args.push(new Date(before).toISOString());
    }
    
    if (after) {
      sql += ` AND created_at > ?`;
      args.push(new Date(after).toISOString());
    }
    
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    args.push(limit);
    
    try {
      const result = await this.db!.execute({ sql, args });
      return result.rows.map(row => ({
        id: row.id as string,
        role: row.role as BaseMessage['role'],
        content: row.content as string,
      } as BaseMessage));
    } catch (error) {
      throw new Error(`Failed to get messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new conversation (VoltAgent Memory interface)
   * @param conversation - Conversation data to create
   * @returns Created conversation with timestamps
   */
  async createConversation(conversation: { 
    id: string; 
    resourceId: string; 
    title: string; 
    metadata: Record<string, unknown>; 
  }): Promise<{ 
    id: string; 
    resourceId: string; 
    title: string; 
    metadata: Record<string, unknown>; 
    createdAt: string; 
    updatedAt: string; 
  }> {
    await this.ensureInitialized();
    const now = new Date().toISOString();
    
    try {
      // Store conversation data as JSON to avoid foreign key issues
      const conversationData = {
        title: conversation.title,
        resourceId: conversation.resourceId,
        metadata: conversation.metadata
      };
      
      await this.db!.execute({
        sql: `INSERT INTO conversations (id, user_id, agent_name, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          conversation.id, 
          this.userId, // Use the user from this instance
          JSON.stringify(conversationData), 
          now, 
          now
        ]
      });
      
      return {
        ...conversation,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      throw new Error(`Failed to create conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update a conversation (VoltAgent Memory interface)
   * @param id - Conversation ID
   * @param updates - Partial updates to apply
   * @returns Updated conversation
   */
  async updateConversation(
    id: string, 
    updates: Partial<{ resourceId?: string; title?: string; metadata?: Record<string, unknown>; }>
  ): Promise<{ 
    id: string; 
    resourceId: string; 
    title: string; 
    metadata: Record<string, unknown>; 
    createdAt: string; 
    updatedAt: string; 
  }> {
    await this.ensureInitialized();
    
    try {
      // Read current conversation data
      const result = await this.db!.execute({
        sql: `SELECT agent_name, created_at FROM conversations WHERE id = ?`,
        args: [id]
      });
      
      if (result.rows.length === 0) {
        throw new Error(`Conversation with id ${id} not found`);
      }
      
      let parsed = { title: '', resourceId: '', metadata: {} };
      try {
        parsed = JSON.parse(result.rows[0].agent_name as string);
      } catch { 
        parsed.title = result.rows[0].agent_name as string; 
      }
      
      // Apply updates
      if (updates.title !== undefined) parsed.title = updates.title;
      if (updates.resourceId !== undefined) parsed.resourceId = updates.resourceId;
      if (updates.metadata !== undefined) parsed.metadata = updates.metadata;
      
      const now = new Date().toISOString();
      
      // Update conversation
      await this.db!.execute({
        sql: `UPDATE conversations SET agent_name = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(parsed), now, id]
      });
      
      return {
        id,
        resourceId: parsed.resourceId || '',
        title: parsed.title || '',
        metadata: parsed.metadata || {},
        createdAt: result.rows[0].created_at as string,
        updatedAt: now,
      };
    } catch (error) {
      throw new Error(`Failed to update conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get conversations for a resource (VoltAgent Memory interface)
   * @param resourceId - Resource ID to filter by
   * @returns Array of conversations for the resource
   */
  async getConversations(resourceId: string): Promise<ConversationMetadata[]> {
    await this.ensureInitialized();
    
    try {
      const result = await this.db!.execute({
        sql: `SELECT id, agent_name, created_at, updated_at FROM conversations 
              WHERE user_id = ? OR agent_name LIKE ? 
              ORDER BY updated_at DESC`,
        args: [resourceId, `%"resourceId":"${resourceId}"%`]
      });
      
      return result.rows.map(row => {
        let title = '', resourceIdParsed = '', metadata = {};
        try {
          const parsed = JSON.parse(row.agent_name as string);
          title = parsed.title || '';
          resourceIdParsed = parsed.resourceId || '';
          metadata = parsed.metadata || {};
        } catch { 
          title = row.agent_name as string;
          resourceIdParsed = resourceId; // fallback to provided resourceId
        }
        
        return {
          id: row.id as string,
          title,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          resourceId: resourceIdParsed,
          metadata,
        };
      });
    } catch (error) {
      throw new Error(`Failed to get conversations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Add or update a history entry (VoltAgent Memory interface)
   * @param key Entry ID
   * @param value Entry data
   * @param agentId Agent ID for filtering
   */
  async addHistoryEntry(key: string, value: any, agentId: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      // Use the proper VoltAgent history table
      await this.db!.execute({
        sql: `INSERT OR REPLACE INTO voltagent_memory_agent_history (key, value, agent_id, created_at) 
              VALUES (?, ?, ?, datetime('now'))`,
        args: [
          key,
          JSON.stringify(value),
          agentId
        ]
      });

      await this.runMemoryProcessors({ 
        type: 'addHistoryEntry', 
        data: { key, value, agentId } 
      });
    } catch (error) {
      throw new Error(`Failed to add history entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Update an existing history entry (VoltAgent Memory interface)
   * @param key Entry ID
   * @param value Updated entry data
   * @param agentId Agent ID for filtering
   */
  async updateHistoryEntry(key: string, value: any, agentId: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await this.db!.execute({
        sql: `UPDATE voltagent_memory_agent_history SET value = ?, agent_id = ? WHERE key = ?`,
        args: [JSON.stringify(value), agentId, key]
      });

      await this.runMemoryProcessors({ 
        type: 'updateHistoryEntry', 
        data: { key, value, agentId } 
      });
    } catch (error) {
      throw new Error(`Failed to update history entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Add a history step (VoltAgent Memory interface)
   * @param key Step ID
   * @param value Step data
   * @param historyId Related history entry ID
   * @param agentId Agent ID for filtering
   */
  async addHistoryStep(key: string, value: any, historyId: string, agentId: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      // Use the proper VoltAgent history steps table
      await this.db!.execute({
        sql: `INSERT OR REPLACE INTO voltagent_memory_agent_history_steps (key, value, history_id, agent_id, created_at) 
              VALUES (?, ?, ?, ?, datetime('now'))`,
        args: [
          key,
          JSON.stringify(value),
          historyId,
          agentId
        ]
      });

      await this.runMemoryProcessors({ 
        type: 'addHistoryStep', 
        data: { key, value, historyId, agentId } 
      });
    } catch (error) {
      throw new Error(`Failed to add history step: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Update a history step (VoltAgent Memory interface)
   * @param key Step ID
   * @param value Updated step data
   * @param historyId Related history entry ID
   * @param agentId Agent ID for filtering
   */
  async updateHistoryStep(key: string, value: any, historyId: string, agentId: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await this.db!.execute({
        sql: `UPDATE voltagent_memory_agent_history_steps SET value = ?, agent_id = ? 
              WHERE key = ? AND history_id = ?`,
        args: [JSON.stringify(value), agentId, key, historyId]
      });

      await this.runMemoryProcessors({ 
        type: 'updateHistoryStep', 
        data: { key, value, historyId, agentId } 
      });
    } catch (error) {
      throw new Error(`Failed to update history step: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a history entry by ID (VoltAgent Memory interface)
   * @param key Entry ID
   * @returns The history entry or undefined if not found
   */
  async getHistoryEntry(key: string): Promise<any | undefined> {
    await this.ensureInitialized();
    
    try {
      const result = await this.db!.execute({
        sql: `SELECT value FROM voltagent_memory_agent_history WHERE key = ?`,
        args: [key]
      });
      
      if (result.rows.length === 0) return undefined;
      return JSON.parse(result.rows[0].value as string);
    } catch (error) {
      throw new Error(`Failed to get history entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a history step by ID (VoltAgent Memory interface)
   * @param key Step ID
   * @returns The history step or undefined if not found
   */
  async getHistoryStep(key: string): Promise<any | undefined> {
    await this.ensureInitialized();
    
    try {
      const result = await this.db!.execute({
        sql: `SELECT content FROM messages WHERE id = ? AND tool_call_id = 'history_step'`,
        args: [key]
      });
      
      if (result.rows.length === 0) return undefined;
      return JSON.parse(result.rows[0].content as string);
    } catch (error) {
      throw new Error(`Failed to get history step: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get multiple history entries (all for an agent)
   */
  async getHistoryEntries(agentId: string): Promise<HistoryValue[]> {
    await this.ensureInitialized();
    const result = await this.db!.execute({
      sql: `SELECT m.content FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE m.tool_call_id = 'history' AND c.agent_name = ?`,
      args: [agentId]
    });
    return result.rows.map(row => JSON.parse(row.content as string));
  }

  /**
   * Get the latest history entry
   */
  async getLatestHistoryEntry(): Promise<HistoryValue | undefined> {
    await this.ensureInitialized();
    const result = await this.db!.execute({
      sql: `SELECT content FROM messages WHERE tool_call_id = 'history' ORDER BY created_at DESC LIMIT 1`,
      args: []
    });
    if (result.rows.length === 0) return undefined;
    return JSON.parse(result.rows[0].content as string);
  }

  /**
   * Clear all history entries/events/steps
   */
  async clearHistory(): Promise<void> {
    await this.ensureInitialized();
    await this.db!.execute({
      sql: `DELETE FROM messages WHERE tool_call_id IN ('history', 'event', 'step')`,
      args: []
    });
  }
  /**
   * Get all history entries for an agent (VoltAgent Memory interface)
   * @param agentId Agent ID
   * @returns Array of all history entries for the agent
   */
  async getAllHistoryEntriesByAgent(agentId: string): Promise<any[]> {
    await this.ensureInitialized();
    
    try {
      const result = await this.db!.execute({
        sql: `SELECT id, content, created_at FROM messages 
              WHERE tool_call_id = 'history_entry' AND tool_name = ? 
              ORDER BY created_at ASC`,
        args: [agentId]
      });
      
      return result.rows.map(row => ({
        id: row.id,
        createdAt: row.created_at,
        ...JSON.parse(row.content as string)
      }));
    } catch (error) {
      throw new Error(`Failed to get history entries: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Add a timeline event (VoltAgent Memory interface)
   * @param key Event ID (UUID)
   * @param value Timeline event data with immutable structure
   * @param historyId Related history entry ID
   * @param agentId Agent ID for filtering
   */
  async addTimelineEvent(
    key: string,
    value: NewTimelineEvent | ToolStartEvent | ToolSuccessEvent | ToolErrorEvent | AgentStartEvent | AgentSuccessEvent | AgentErrorEvent | MemoryReadStartEvent | MemoryReadSuccessEvent | MemoryReadErrorEvent | MemoryWriteStartEvent | MemoryWriteSuccessEvent | MemoryWriteErrorEvent | RetrieverStartEvent | RetrieverSuccessEvent | RetrieverErrorEvent,
    historyId: string,
    agentId: string
  ): Promise<void> {
    await this.ensureInitialized();
    // Type guards to ensure all event types are handled (for VoltAgent compatibility)
    if (
      value &&
      [
        'tool:start', 'tool:success', 'tool:error',
        'agent:start', 'agent:success', 'agent:error',
        'memory:read:start', 'memory:read:success', 'memory:read:error',
        'memory:write:start', 'memory:write:success', 'memory:write:error',
        'retriever:start', 'retriever:success', 'retriever:error',
      ].includes((value as any).name)
    ) {
      // Store the event in the VoltAgent timeline events table
      await this.db!.execute({
        sql: `INSERT OR REPLACE INTO voltagent_memory_agent_history_events (key, value, history_id, agent_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        args: [key, JSON.stringify(value), historyId, agentId]
      });
      await this.runMemoryProcessors({
        type: 'addTimelineEvent',
        data: { key, value, historyId, agentId }
      });
    } else {
      throw new Error('Invalid timeline event type');
    }
  }

  /**
   * Get a timeline event by ID (helper method)
   * @param key Event ID
   * @returns Timeline event data or undefined
   */
  async getTimelineEvent(key: string): Promise<any | undefined> {
    await this.ensureInitialized();
    
    try {
      const result = await this.db!.execute({
        sql: `SELECT content FROM messages WHERE id = ? AND tool_call_id = 'timeline_event'`,
        args: [key]
      });
      
      if (result.rows.length === 0) return undefined;
      return JSON.parse(result.rows[0].content as string);
    } catch (error) {
      throw new Error(`Failed to get timeline event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all timeline events for a history entry (helper method)
   * @param historyId Related history entry ID
   * @returns Array of timeline events
   */
  async getTimelineEvents(historyId: string): Promise<any[]> {
    await this.ensureInitialized();
    
    try {
      const result = await this.db!.execute({
        sql: `SELECT id, content, tool_name, created_at FROM messages 
              WHERE conversation_id = ? AND tool_call_id = 'timeline_event' 
              ORDER BY created_at ASC`,
        args: [historyId]
      });
      
      return result.rows.map(row => ({
        id: row.id,
        agentId: row.tool_name,
        createdAt: row.created_at,
        ...JSON.parse(row.content as string)
      }));
    } catch (error) {
      throw new Error(`Failed to get timeline events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear messages from memory (VoltAgent Memory interface)
   * @param options - Options for clearing messages
   */
  async clearMessages(options: { userId: string; conversationId?: string }): Promise<void> {
    await this.ensureInitialized();
    const { userId, conversationId } = options;
    
    try {
      if (conversationId) {
        // Clear messages for specific conversation
        await this.db!.execute({
          sql: `DELETE FROM messages WHERE conversation_id = ?`,
          args: [conversationId]
        });
      } else {
        // Clear all messages for user
        await this.db!.execute({
          sql: `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)`,
          args: [userId]
        });
      }
      
      await this.runMemoryProcessors({ 
        type: 'clearMessages', 
        data: { userId, conversationId } 
      });
    } catch (error) {
      throw new Error(`Failed to clear messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Global memory instance for the main user
 */
export const globalMemory = new ConversationMemory('main-user');

/**
 * Utility: Start or switch to a thread for a user
 * @param agentName - Name of the agent
 * @returns Conversation ID
 */
export async function getOrStartThread(agentName: string): Promise<string> {
  return await globalMemory.startConversation(agentName);
}

/**
 * Utility: List all threads for a user
 * @param userId - User ID (default: 'main-user')
 */
export async function listThreads(userId: string = 'main-user') {
  return await globalMemory.getConversations(userId);
}

/**
 * Utility: Get conversation history for a thread
 * @param conversationId - Conversation/thread ID
 * @param limit - Maximum number of messages
 */
export async function getThreadHistory(conversationId: string, limit: number = 50) {
  return await globalMemory.getHistory(conversationId, limit);
}

/**
 * Conversation summarization processor
 * Automatically summarizes long conversations and stores summary as a system message.
 * @param memory - ConversationMemory instance
 * @param llm - LLM provider instance (GoogleGenAIProvider)
 * @param model - Model string (e.g., 'models/gemini-2.0-flash-exp')
 * @param threshold - Number of messages before summarization triggers
 */
export function createSummarizationProcessor({
  memory,
  llm,
  model = 'models/gemini-2.0-flash-exp',
  threshold = 20,
}: {
  memory: ConversationMemory,
  llm: LLMProvider,
  model?: string,
  threshold?: number
}) {  return async function summarizationProcessor(event: MemoryEvent) {
    if (event.type !== 'addMessage') return;
    const { conversationId } = event.data;
    if (!conversationId || typeof conversationId !== 'string') return;
    // Get message count
    const stats = await memory.getConversationStats(conversationId as string);
    if (stats.messageCount < threshold) return;
    // Get recent history
    const history = await memory.getHistory(conversationId as string, threshold);    const context = history.map((m: BaseMessage) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    // Generate summary using Gemini
    let summary = '';
    try {
      const prompt = `Summarize the following conversation in 5-8 sentences, focusing on key topics, decisions, and unresolved questions.\n\n${context}`;
      const result = await llm.generateText({ prompt, model });
      summary = result.text || '';
    } catch {
      // Fallback: simple truncation
      summary = context.slice(0, 1000) + (context.length > 1000 ? '... [truncated]' : '');
    }
    // Store summary as a system message
    await memory.addMessageLegacy({
      role: 'system',
      content: `[SUMMARY]\n${summary}`,
    }, conversationId);
  };
}

/**
 * Retrieve the latest summary for a conversation
 * @param conversationId - Conversation/thread ID
 * @returns Summary string or undefined
 */
export async function getLatestSummary(memory: ConversationMemory, conversationId: string): Promise<string | undefined> {
  // Use a public method that handles initialization internally
  const messages = await memory.getMessages({
    conversationId,
    limit: 1,
    role: undefined
  });
  
  // Filter for summary messages since getMessages doesn't support tool_call_id filtering
  const result = messages.find(msg => {
    const contentString = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return contentString.includes('[SUMMARY]');
  });
  
  if (!result) return undefined;
  
  // Ensure we return a string
  return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
}
// Generated on 2025-05-28