import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';

/**
 * Database configuration for LibSQL/Turso integration
 * Provides persistent storage for conversation history and agent memory
 */
export class DatabaseConfig {
  private client: Client | null = null;

  /**
   * Initialize database connection
   * Uses in-memory database if no URL provided, LibSQL/Turso if configured
   */
  public async initialize(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    // Use in-memory database for development, can be configured for production
    const dbUrl = process.env.DATABASE_URL || ':memory:';
    const authToken = process.env.DATABASE_AUTH_TOKEN;

    this.client = createClient({
      url: dbUrl,
      authToken: authToken,
    });

    await this.createTables();
    return this.client;
  }  /**
   * Create necessary tables for conversation memory
   * Synchronized with VoltAgent Memory interface requirements
   */
  private async createTables(): Promise<void> {
    if (!this.client) throw new Error('Database not initialized');

    console.log('[LibSQLStorage] Creating database tables...');

    try {
      // Enable foreign keys
      await this.client.execute('PRAGMA foreign_keys = ON');

      // 1. Conversations table - VoltAgent compatible
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS voltagent_memory_conversations (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL,
          title TEXT,
          metadata TEXT DEFAULT '{}', -- JSON metadata
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. Messages table - VoltAgent compatible  
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS voltagent_memory_messages (
          user_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'text',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, conversation_id, message_id),
          FOREIGN KEY (conversation_id) REFERENCES voltagent_memory_conversations (id) ON DELETE CASCADE
        )
      `);

      // 3. Agent History table - VoltAgent required
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS voltagent_memory_agent_history (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL, -- JSON data
          agent_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 4. Agent History Events table - VoltAgent required
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS voltagent_memory_agent_history_events (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL, -- JSON data
          history_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (history_id) REFERENCES voltagent_memory_agent_history (key) ON DELETE CASCADE
        )
      `);

      // 5. Agent History Steps table - VoltAgent required
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS voltagent_memory_agent_history_steps (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL, -- JSON data
          history_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (history_id) REFERENCES voltagent_memory_agent_history (key) ON DELETE CASCADE
        )
      `);

      // Legacy tables for backward compatibility
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          title TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT DEFAULT '{}'
        )
      `);

      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL,
          tool_call_id TEXT,
          tool_name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
        )
      `);

      // Create performance indexes
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_voltagent_conversations_resource ON voltagent_memory_conversations (resource_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_voltagent_messages_lookup ON voltagent_memory_messages (user_id, conversation_id, created_at)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_voltagent_history_agent ON voltagent_memory_agent_history (agent_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_voltagent_events_history ON voltagent_memory_agent_history_events (history_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_voltagent_events_agent ON voltagent_memory_agent_history_events (agent_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_voltagent_steps_history ON voltagent_memory_agent_history_steps (history_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_voltagent_steps_agent ON voltagent_memory_agent_history_steps (agent_id)`);

      // Legacy indexes
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations (user_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations (agent_name)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_messages_tool_call ON messages (tool_call_id)`);
      await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at)`);

      // Ensure system conversations exist for special purposes
      await this.client.execute({
        sql: `INSERT OR IGNORE INTO voltagent_memory_conversations (id, resource_id, title, created_at, updated_at) 
              VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
        args: ['history_entries', 'system', 'System History Entries']
      });

      await this.client.execute({
        sql: `INSERT OR IGNORE INTO voltagent_memory_conversations (id, resource_id, title, created_at, updated_at) 
              VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
        args: ['main-user', 'main-user', 'Main User Default Conversation']
      });

      // Legacy system conversations
      await this.client.execute({
        sql: `INSERT OR IGNORE INTO conversations (id, user_id, agent_name, title, created_at, updated_at) 
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: ['history_entries', 'system', 'history_manager', 'System History Entries']
      });

      await this.client.execute({
        sql: `INSERT OR IGNORE INTO conversations (id, user_id, agent_name, title, created_at, updated_at) 
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: ['main-user', 'main-user', 'supervisor', 'Main User Default Conversation']
      });

      console.log('[LibSQLStorage] Database tables created successfully');
    } catch (error) {
      console.error('[LibSQLStorage] Error creating tables:', error);
      throw new Error(`Failed to create database tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get database client instance
   */
  public getClient(): Client {
    if (!this.client) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}

// Singleton instance
export const databaseConfig = new DatabaseConfig();
