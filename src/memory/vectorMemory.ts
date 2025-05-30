import { pipeline } from '@xenova/transformers';

/**
 * VectorMemory: Hybrid memory for semantic search using @xenova/transformers
 * Stores messages with embeddings and supports similarity search
 */
export interface VectorMemoryItem {
  id: string;
  text: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  embedding: number[];
  created_at: string;
}

export class VectorMemory {
  private items: VectorMemoryItem[] = [];
  private embedder: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor() {}

  /**
   * Initialize the embedding model (lazy)
   */
  async ensureEmbedder() {
    if (!this.embedder) {
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  }

  /**
   * Add a message to vector memory
   */
  async addMessage({ id, text, role }: { id: string; text: string; role: VectorMemoryItem['role'] }) {
    await this.ensureEmbedder();
    const embedding = await this.embedder(text);
    const vector = Array.from(embedding.data).map(Number);
    this.items.push({
      id,
      text,
      role,
      embedding: vector,
      created_at: new Date().toISOString(),
    });
  }
  /**
   * Search for similar messages using cosine similarity
   */
  async search(query: string, topK: number = 5): Promise<VectorMemoryItem[]> {
    try {
      // Validate input
      if (!query || typeof query !== 'string') {
        console.warn('[VectorMemory] Invalid query provided:', query);
        return [];
      }

      const trimmedQuery = query.trim();
      if (trimmedQuery.length === 0) {
        console.warn('[VectorMemory] Empty query provided');
        return [];
      }

      await this.ensureEmbedder();
      
      // If no items stored yet, return empty array
      if (this.items.length === 0) {
        return [];
      }

      const queryEmbedding = Array.from((await this.embedder(trimmedQuery)).data).map(Number);
      const scored = this.items.map(item => ({
        item,
        score: cosineSimilarity(queryEmbedding, item.embedding),
      }));
      
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(s => s.item);
    } catch (error) {
      console.error('[VectorMemory] Error during search:', error);
      return [];
    }
  }

  /**
   * Get all items (for debugging)
   */
  getAll() {
    return this.items;
  }
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (normA * normB + 1e-8);
}

// Export a singleton for global use
export const vectorMemory = new VectorMemory();
