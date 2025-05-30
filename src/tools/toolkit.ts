import { z } from "zod";
import { Tool } from "@voltagent/core";

/**
 * Represents a generic tool conforming to the Tool<Any> structure.
 * This interface is used to aid TypeScript's type inference for complex tool types,
 * particularly in collections like Toolkit.tools.
 */


/**
 * Configuration object for creating a toolkit that groups related tools together.
 *
 * @example
 * ```typescript
 * const browserToolkit: Toolkit = {
 *   name: "browser",
 *   description: "Tools for browser automation and web interaction",
 *   instructions: "Use these tools to navigate, interact with, and extract data from web pages.",
 *   addInstructions: true,
 *   tools: [navigationTool, clickTool, screenshotTool]
 * };
 * ```
 */
export type Toolkit = {
  /**
   * Unique identifier name for the toolkit.
   * Should be descriptive and follow kebab-case convention.
   * 
   * @example "browser-automation", "file-system", "api-client"
   */
  name: string;
  
  /**
   * A brief description of what the toolkit does. Optional.
   * This helps users understand the toolkit's purpose and capabilities.
   * 
   * @example "Tools for browser automation and web interaction"
   */
  description?: string;
  
  /**
   * Shared instructions for the LLM on how to use the tools within this toolkit.
   * These instructions provide context and best practices for tool usage.
   * Optional.
   * 
   * @example "Always take a screenshot before and after major interactions to verify success."
   */
  instructions?: string;

  /**
   * Whether to automatically add this toolkit's `instructions` to the agent's system prompt.
   * When true, the instructions will be included in the agent's context.
   * Optional.
   * 
   * @default false // As per createToolkit implementation
   */
  addInstructions?: boolean;
  
  /**
   * An array of tools included in this toolkit.
   * Each tool should conform to the `Tool<z.ZodTypeAny>` interface.
   * 
   * @example `[navigationTool, clickTool, screenshotTool]`
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Tool<any>[];
};

/**
 * Zod schema for validating Toolkit configuration objects.
 * Ensures all required fields are present and properly typed.
 */
export const ToolkitSchema = z.object({
  name: z.string().min(1, "Toolkit name cannot be empty"),
  description: z.string().optional(),
  instructions: z.string().optional(),
  addInstructions: z.boolean().optional(),
  tools: z.array(z.any()).min(1, "Tools array must have at least one tool"),
}) satisfies z.ZodType<Toolkit>;

/**
 * Creates a new toolkit with the provided configuration.
 * Validates the input and applies sensible defaults for optional fields.
 *
 * @param options - The toolkit configuration object
 * @returns A validated Toolkit instance with defaults applied
 *
 * @throws {Error} When toolkit name is missing or invalid
 * @throws {z.ZodError} When the options object fails validation
 *
 * @example
 * ```typescript
 * const browserToolkit = createToolkit({
 *   name: "browser",
 *   description: "Browser automation tools",
 *   instructions: "Use these tools to interact with web pages",
 *   addInstructions: true,
 *   tools: [navigationTool, clickTool, screenshotTool]
 * });
 * ```
 */
export const createToolkit = (options: Toolkit): Toolkit => {
  const validatedOptions = ToolkitSchema.parse(options);
  if (!validatedOptions.name) {
    throw new Error("Toolkit name is required");
  }
  if (!validatedOptions.tools || validatedOptions.tools.length === 0) {
    throw new Error(`Toolkit '${validatedOptions.name}' created without any tools.`);
  }
  return {
    name: validatedOptions.name,
    description: validatedOptions.description || "",
    instructions: validatedOptions.instructions,
    addInstructions: validatedOptions.addInstructions || false,
    tools: validatedOptions.tools,
  };
};

/**
 * Configuration options for creating specialized toolkits with common patterns.
 * Provides convenient presets for typical toolkit configurations.
 *
 * @example
 * ```typescript
 * const options: CreateToolkitOptions = {
 *   addInstructions: true,
 *   think: true,
 *   analyze: false,
 *   addFewShot: true,
 *   fewShotExamples: "Custom examples here..."
 * };
 * ```
 */
export type CreateToolkitOptions = {
  /**
   * Add detailed instructions and few-shot examples to the agent's system prompt.
   * When enabled, provides the agent with context on how to use the toolkit effectively.
   *
   * @default true
   */
  addInstructions?: boolean;
  /**
   * Include the 'think' tool in the toolkit.
   * The think tool allows the agent to reason through problems step by step.
   *
   * @default true
   */
  think?: boolean;
  /**
   * Include the 'analyze' tool in the toolkit.
   * The analyze tool helps the agent break down complex tasks and data.
   *
   * @default true
   */
  analyze?: boolean;
  /**
   * Include default few-shot examples along with instructions (if addInstructions is true).
   * Few-shot examples demonstrate proper tool usage patterns to the agent.
   *
   * @default true
   */
  addFewShot?: boolean;
  /**
   * Provide custom few-shot examples instead of the default ones.
   * Ignored if addInstructions or addFewShot is false.
   * Should contain realistic examples of tool usage in context.
   *
   * @default Predefined examples (see code)
   *
   * @example
   * ```
   * "Example 1: Navigate to a website\nUser: Go to example.com\nAgent: I'll navigate to example.com for you.\nTool: navigate({url: 'https://example.com'})\nResult: Successfully navigated to https://example.com"
   * ```
   */
  fewShotExamples?: string;
};

/**
 * Zod schema for validating CreateToolkitOptions configuration.
 * Ensures all options are properly typed and within expected ranges.
 */
export const CreateToolkitOptionsSchema = z.object({
  addInstructions: z.boolean().optional().default(true),
  think: z.boolean().optional().default(true),
  analyze: z.boolean().optional().default(true),
  addFewShot: z.boolean().optional().default(true),
  fewShotExamples: z.string().optional(),
}) satisfies z.ZodType<CreateToolkitOptions>;
