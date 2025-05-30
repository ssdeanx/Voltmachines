import { createPrompt } from "@voltagent/core";

/**
 * Factory for agent prompts. Each agent should call this with its own capabilities, goal, context, and task.
 */
export const agentPrompt = createPrompt({
  template: `You are an AI agent with the following capabilities: {{capabilities}}.
Your current goal is: {{goal}}
Available context: {{context}}
Task: {{task}}`,
  variables: {
    capabilities: "", // Should be set per agent
    goal: "",         // Should be set per agent
    context: "",      // Should be set per agent
    task: "",         // Should be set per agent
  },
});

/**
 * Helper to generate a prompt for a specific agent.
 * @param capabilities - Array of capabilities for the agent
 * @param goal - The agent's current goal
 * @param context - Context string for the agent
 * @param task - Task string for the agent
 * @returns The generated prompt string
 */
export function getAgentPrompt({
  capabilities,
  goal,
  context,
  task,
}: {
  capabilities: string[];
  goal: string;
  context: string;
  task: string;
}): string {
  return agentPrompt({
    capabilities: capabilities.join(", "),
    goal,
    context,
    task,
  });
}

/**
 * Helper to generate a task-specific prompt for any agent.
 * @param params - Object with capabilities, goal, context, and task
 * @returns The generated prompt string for the agent's current task
 *
 * @example
 *   const prompt = getAgentTaskPrompt({
 *     capabilities: ["web search", "code execution"],
 *     goal: "Help the user solve a programming problem",
 *     context: "User is working with Node.js and Express",
 *     task: "Debug an error in a REST API endpoint",
 *   });
 */
export function getAgentTaskPrompt({
  capabilities,
  goal,
  context,
  task,
}: {
  capabilities: string[];
  goal: string;
  context: string;
  task: string;
}): string {
  return agentPrompt({
    capabilities: capabilities.join(", "),
    goal,
    context,
    task,
  });
}