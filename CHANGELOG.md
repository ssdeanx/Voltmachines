# Changelog

All notable changes to the VoltAgent multi-agent system project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.13] - 2025-05-30

### ✨ Dynamic Toolkit & Context Awareness

#### **Added**
- **Dynamic Toolkit Capabilities:** Supervisor agent and config now always reflect the real toolset, auto-synced in config, context, and memory options.
- **Memory Context:** `toolkitCapabilities` now available in `memoryOptions` for all subagents and consumers.
- **LLM Context:** Supervisor agent's prompt/context now always lists the real toolkit, so the LLM and UI are always aware of available tools.

#### **Improvements**
- **Type Safety & DRY:** No manual sync needed for capabilities/tool names—everything is auto-generated from the toolkit.
- **Backward Compatibility:** All previous features and tools remain backward compatible.
- **No Build or Linter Errors:** Full TypeScript build and lint pass.

#### **See README for usage and upgrade notes.**

## [0.0.12] - 2025-05-30

### 🚀 **Unified Agent Prompt & Capabilities Pattern**

#### **Added**

- **Dynamic Agent Prompts:** All agents (including supervisor) now use a unified `getAgentPrompt` helper for dynamic, capability-driven, and type-safe prompt generation.
- **Capabilities in Config:** Each agent's Zod config schema now includes a `capabilities` array, ensuring accurate, self-documenting instructions and easy UI integration.
- **Name Separation:** Agent `name` is always a separate property in the Agent constructor, never in the config schema.

#### **Improvements**

- **Memory Options:** Supervisor and all sub-agents now leverage advanced `memoryOptions` (context sharing, data processing, agent coordination, etc.) for robust multi-agent workflows.
- **Consistency:** All agent files are DRY, maintainable, and follow the same pattern for config, prompt, and tool integration.
- **Type Safety:** All prompt fields and config values are type-safe and validated at runtime.
- **Documentation:** Updated code comments and technical documentation to reflect the new agent pattern and memory architecture.

#### **Verification**

- **System Supercharged:** All agents and the supervisor are now fully standardized, maintainable, and ready for advanced orchestration and delegation.
- **No Build Errors:** Full TypeScript build passes successfully with the new pattern.

### Developer Notes

- When adding new agents, always:
  - Define and export a Zod config schema with a `capabilities` array.
  - Use the `getAgentPrompt` helper for instructions.
  - Register the agent in the barrel file and agent registry.
- The new pattern enables rapid UI prototyping, validation, and future-proof extensibility.

---

## [0.0.11] - 2025-05-29

### ✅ **MILESTONE: Complete System Integration**

#### **Fixed**

- **Memory Interface Compatibility**: Resolved all VoltAgent Memory interface compatibility issues
  - Added missing `addTimelineEvent` method to ConversationMemory class
  - Implemented all required VoltAgent Memory interface methods
  - Fixed type compatibility between `CoreMessage` and `BaseMessage` interfaces
  - Ensured proper memory assignment in supervisor agent configuration

#### **Resolved**

- **Agent Error Resolution**: Fixed all compilation errors across the agent ecosystem
  - Cleaned up unused imports in `developerAgent.ts`, `fileManagerAgent.ts`, `systemAdminAgent.ts`
  - Removed unused `systemInfoTool` import from `dataAnalysisAgent.ts`
  - Fixed export conflicts in `agents/index.ts` by switching from wildcard exports to specific exports
  - Resolved `generateText` function naming conflicts across multiple agents

#### **Improvements**

- **Code Quality**: Enhanced TypeScript compliance and maintainability
  - Removed unused parameters from agent hooks
  - Standardized import patterns across all agent files
  - Implemented proper error handling and logging patterns
  - Achieved full TypeScript build success without errors

#### **Verification**

- **System Validation**: Complete end-to-end system verification
  - ✅ All agents error-free and properly wired
  - ✅ Memory system fully compatible with VoltAgent framework
  - ✅ Database configuration working correctly
  - ✅ Full TypeScript build passes successfully
  - ✅ Agent registry properly configured for delegation

### **Technical Achievements**

- **Zero Build Errors**: First successful complete system build
- **Agent Ecosystem**: All 9 specialized agents fully operational
- **Memory Architecture**: Thread-aware, persistent memory across all agents
- **Tool Integration**: Complete MCP and browser automation tool suite
- **Type Safety**: Strict TypeScript compliance with Zod validation

---

## [0.0.10] - 2025-05-29

### **New Agents**

- Added `documentationAgent` and `researchAgent` with advanced Zod-validated configuration schemas, supporting runtime config validation and UI-driven agent configuration.
- Both agents leverage VoltAgent's full tool integration, including web search, URL fetch, text analysis, and data formatting tools for research/documentation workflows.
- Each agent's configuration schema and parsed config are now exported for use in validation, UI forms, and runtime inspection.
- Example schemas:
  - `documentationAgentConfigSchema` includes fields for doc type, output format, citation style, and audience.
  - `researchAgentConfigSchema` includes max research length, supported formats, summarization, and fact-checking toggles.
- Agents are constructed with best practices: Google Gemini LLM, thread-aware memory, robust hooks, and tool arrays.

### **Barrel File Improvements**

- All agent configuration schemas and parsed configs are now exported from the agents barrel file (`src/agents/index.ts`).
- This enables type-safe validation, UI-driven config editing, and dynamic agent instantiation.
- Example: `import { documentationAgentConfigSchema, documentationAgentConfig } from './agents';`

### **Agent Registry**

- Ensured `agentRegistry` includes both `documentation` and `research` agents for supervisor delegation and VoltAgent workflows.
- Registry is now a single source of truth for all agent instances, supporting dynamic agent selection and orchestration.

### **Best Practices & Consistency**

- Improved agent code consistency: all agents now follow the same config validation and export pattern.
- All agents use Zod schemas for config, export their parsed config, and are registered in the barrel file and registry.
- Hooks, memory, and tool integration are standardized across all agents.

### **Developer Notes**

- When adding new agents, always define and export a Zod config schema and parsed config.
- Register new agents and their configs in the barrel file for discoverability and UI integration.
- Use the agent registry for all agent orchestration and supervisor delegation logic.

### **UI/Validation Ready**

- The exported schemas and configs enable rapid UI prototyping for agent configuration panels, validation, and runtime inspection.
- Future: Consider generating UI forms directly from Zod schemas for agent config editing.

### **Documentation**

- Updated agent documentation to reflect new config/export patterns and registry usage.
- Added examples for importing and using agent configs in both backend and frontend contexts.

---

## [0.0.9] - 2025-05-28

- Initial browserAgent implementation using all Playwright-based tools (browserBaseTools, interactionTool, navigationTool, outputTool, playwrightToolHandler, responseTool, screenshotTool, visiblePageTool).
- All agents now use thread-aware, VoltAgent-compatible memory (globalMemory) for robust multi-threaded workflows.
- Supervisor agent and subagents are fully integrated with VoltAgent memory and hooks.
- Improved error handling and type safety for all agent memory operations.
- Project now follows VoltAgent best practices for agent construction, memory, and tool integration.

## [0.0.8] - 2025-05-28

- Major refactor: All agents now use thread-aware ConversationMemory (globalMemory) instead of raw LibSQLStorage.
- Fixed: AppBuilderContainer is now fully integrated and functional in its parent page.
- Project tooling: All package management operations now use pnpm by default.
- Improved: Data schema synchronization warnings and adapter update reminders.
- Documentation: All exported functions, classes, and types now include TSDoc comments.
- Security: All API endpoints and tools now validate and sanitize external input using Zod schemas.
- Improved: Cross-cutting concerns (tracing, logging, error handling) are now consistently integrated in all backend and tool code.

## [0.0.7] - 2025-05-20

- Added VoltAgent system status and agent capability schemas.
- Enhanced agent registry and delegation tool integration.
- Improved: Supervisor agent now uses advanced Gemini model and custom retriever.

## [0.0.6] - 2025-05-15

- Added support for Playwright-based browser automation tools.
- Improved: FileManagerAgent and ContentCreationAgent now support advanced file and content operations.

## [0.0.5] - 2025-05-10

- Schema Sync Warning: All data store adapters must be kept in sync with the canonical project schema.
- Improved: Zod validation for all API and tool boundaries.

## [0.0.4] - 2025-05-01

- Initial project setup with VoltAgent, Google AI, LibSQL, and basic agent/tooling structure.
