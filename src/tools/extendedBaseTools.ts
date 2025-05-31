import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { ToolExecuteOptions, ToolExecutionContext } from "@voltagent/core";
import * as crypto from 'crypto';

// ============================================================================
// ADVANCED AI & ML TOOLS
// ============================================================================

export const semanticAnalysisTool = createTool({
  name: 'semantic_analysis',
  description: 'Advanced semantic analysis including similarity, clustering, topic modeling, and intent detection',
  parameters: z.object({
    texts: z.array(z.string()).describe('Array of texts to analyze'),
    operation: z.enum(['similarity', 'clustering', 'topic_modeling', 'intent_detection', 'entity_extraction', 'keyword_density']).describe('Analysis operation'),
    options: z.object({
      similarity_threshold: z.number().min(0).max(1).optional().default(0.7),
      num_topics: z.number().min(1).max(20).optional().default(5),
      min_cluster_size: z.number().min(2).optional().default(3),
      language: z.string().optional().default('en'),
    }).optional()
  }),
  execute: async (
    { texts, operation, options = {} }: {
      texts: string[];
      operation: 'similarity' | 'clustering' | 'topic_modeling' | 'intent_detection' | 'entity_extraction' | 'keyword_density';
      options?: {
        similarity_threshold?: number;
        num_topics?: number;
        min_cluster_size?: number;
        language?: string;
      };
    },
    execOptions?: ToolExecuteOptions,
    execContext?: ToolExecutionContext
  ) => {
    try {
      const { similarity_threshold = 0.7, num_topics = 5, min_cluster_size = 3 } = options;

      // Advanced text preprocessing
      const preprocessText = (text: string) => {
        return text.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .filter(word => word.length > 2 && !['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'].includes(word));
      };

      // TF-IDF calculation
      const calculateTfIdf = (texts: string[]) => {
        const processedTexts = texts.map(preprocessText);
        const vocabulary = [...new Set(processedTexts.flat())];
        
        const tfIdfVectors = processedTexts.map(words => {
          const tf: Record<string, number> = {};
          words.forEach(word => tf[word] = (tf[word] || 0) + 1);
          
          return vocabulary.map(word => {
            const termFreq = (tf[word] || 0) / words.length;
            const docFreq = processedTexts.filter(doc => doc.includes(word)).length;
            const idf = Math.log(texts.length / (docFreq || 1));
            return termFreq * idf;
          });
        });

        return { vectors: tfIdfVectors, vocabulary };
      };

      // Cosine similarity
      const cosineSimilarity = (vecA: number[], vecB: number[]) => {
        const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
        const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
        const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
        return dotProduct / (magnitudeA * magnitudeB) || 0;
      };

      let result: Record<string, unknown>;

      switch (operation) {
        case 'similarity':
          { const { vectors } = calculateTfIdf(texts);
          const similarities: Array<{text1: number, text2: number, similarity: number}> = [];
          
          for (let i = 0; i < vectors.length; i++) {
            for (let j = i + 1; j < vectors.length; j++) {
              const sim = cosineSimilarity(vectors[i], vectors[j]);
              similarities.push({ text1: i, text2: j, similarity: Number(sim.toFixed(4)) });
            }
          }
          
          result = {
            similarities: similarities.sort((a, b) => b.similarity - a.similarity),
            high_similarity_pairs: similarities.filter(s => s.similarity >= similarity_threshold),
            average_similarity: similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length
          };
          break; }

        case 'clustering':
          { const { vectors: clusterVectors } = calculateTfIdf(texts);
          const clusters: number[][] = [];
          const assigned = new Set<number>();

          for (let i = 0; i < clusterVectors.length; i++) {
            if (assigned.has(i)) continue;
            
            const cluster = [i];
            assigned.add(i);
            
            for (let j = i + 1; j < clusterVectors.length; j++) {
              if (assigned.has(j)) continue;
              
              const sim = cosineSimilarity(clusterVectors[i], clusterVectors[j]);
              if (sim >= similarity_threshold) {
                cluster.push(j);
                assigned.add(j);
              }
            }
            
            if (cluster.length >= min_cluster_size) {
              clusters.push(cluster);
            }
          }

          result = {
            clusters: clusters.map((cluster, idx) => ({
              id: idx,
              text_indices: cluster,
              size: cluster.length,
              texts: cluster.map(i => texts[i].substring(0, 100) + '...')
            })),
            total_clusters: clusters.length,
            clustered_texts: clusters.flat().length,
            unclustered_texts: texts.length - clusters.flat().length
          };
          break; }

        case 'topic_modeling':
          { const { vectors: topicVectors, vocabulary } = calculateTfIdf(texts);
          const topics: Array<{id: number, keywords: Array<{word: string, weight: number}>, texts: number[]}> = [];
          
          // Simple topic extraction based on high TF-IDF terms
          for (let topic = 0; topic < Math.min(num_topics, texts.length); topic++) {
            const topicKeywords: Array<{word: string, weight: number}> = [];
            const relatedTexts: number[] = [];
            
            // Find top terms for this topic
            for (let termIdx = 0; termIdx < vocabulary.length; termIdx++) {
              const weights = topicVectors.map(vec => vec[termIdx]);
              const avgWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length;
              
              if (avgWeight > 0.01) {
                topicKeywords.push({ word: vocabulary[termIdx], weight: Number(avgWeight.toFixed(4)) });
              }
            }
            
            topicKeywords.sort((a, b) => b.weight - a.weight);
            topics.push({
              id: topic,
              keywords: topicKeywords.slice(0, 10),
              texts: relatedTexts
            });
          }

          result = {
            topics: topics.filter(t => t.keywords.length > 0),
            vocabulary_size: vocabulary.length,
            total_documents: texts.length
          };
          break; }

        case 'intent_detection':
          { const intentPatterns = {
            question: /\b(what|how|when|where|why|who|which|can|could|would|will|is|are|do|does|did)\b/i,
            request: /\b(please|could you|can you|would you|help|assist|show|tell|explain)\b/i,
            complaint: /\b(problem|issue|wrong|error|broken|not working|failed|bad|terrible)\b/i,
            compliment: /\b(great|good|excellent|amazing|wonderful|perfect|love|like|awesome)\b/i,
            booking: /\b(book|reserve|schedule|appointment|meeting|call|visit)\b/i,
            cancellation: /\b(cancel|remove|delete|stop|end|quit|unsubscribe)\b/i
          };

          const intents = texts.map((text, idx) => {
            const detectedIntents: Array<{intent: string, confidence: number}> = [];
            
            Object.entries(intentPatterns).forEach(([intent, pattern]) => {
              const matches = text.match(pattern);
              if (matches) {
                const confidence = Math.min(matches.length * 0.3, 1);
                detectedIntents.push({ intent, confidence: Number(confidence.toFixed(3)) });
              }
            });

            return {
              text_index: idx,
              text_preview: text.substring(0, 100) + '...',
              intents: detectedIntents.sort((a, b) => b.confidence - a.confidence),
              primary_intent: detectedIntents.length > 0 ? detectedIntents[0].intent : 'unknown'
            };
          });

          result = {
            intent_analysis: intents,
            intent_distribution: Object.keys(intentPatterns).map(intent => ({
              intent,
              count: intents.filter(i => i.primary_intent === intent).length,
              percentage: Number((intents.filter(i => i.primary_intent === intent).length / texts.length * 100).toFixed(2))
            }))
          };
          break; }

        case 'entity_extraction':
          { const entityPatterns = {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
            url: /https?:\/\/[^\s]+/g,
            date: /\b\d{1,2}[\\/\\-]\d{1,2}[\\/\\-]\d{2,4}\b/g,
            time: /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?\b/g,
            money: /\$\d+(?:,\d{3})*(?:\.\d{2})?/g,
            percentage: /\d+(?:\.\d+)?%/g,
            number: /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g
          };

          const entities = texts.map((text, idx) => {
            const extractedEntities: Record<string, string[]> = {};
            
            Object.entries(entityPatterns).forEach(([type, pattern]) => {
              const matches = text.match(pattern);
              if (matches) {
                extractedEntities[type] = [...new Set(matches)];
              }
            });

            return {
              text_index: idx,
              entities: extractedEntities,
              entity_count: Object.values(extractedEntities).flat().length
            };
          });

          result = {
            entity_extraction: entities,
            entity_summary: Object.keys(entityPatterns).map(type => ({
              type,
              total_found: entities.reduce((sum, e) => sum + (e.entities[type]?.length || 0), 0),
              unique_values: [...new Set(entities.flatMap(e => e.entities[type] || []))]
            }))
          };
          break; }

        case 'keyword_density':
          { const allWords = texts.flatMap(preprocessText);
          const wordFreq: Record<string, number> = {};
          allWords.forEach(word => wordFreq[word] = (wordFreq[word] || 0) + 1);
          
          const totalWords = allWords.length;
          const keywordDensity = Object.entries(wordFreq)
            .map(([word, count]) => ({
              keyword: word,
              frequency: count,
              density: Number((count / totalWords * 100).toFixed(3)),
              documents_containing: texts.filter(text => preprocessText(text).includes(word)).length
            }))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 50);

          result = {
            keyword_density: keywordDensity,
            total_unique_words: Object.keys(wordFreq).length,
            total_words: totalWords,
            vocabulary_richness: Number((Object.keys(wordFreq).length / totalWords).toFixed(4))
          };
          break; }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return {
        success: true,
        operation,
        input_texts_count: texts.length,
        result,
        processing_time: Date.now(),
        execOptions,
        execContext
      };
    } catch (error) {
      return {
        success: false,
        error: `Semantic analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        operation,
        execOptions,
        execContext
      };
    }
  }});