// Export agents individually to avoid naming conflicts
export { dataAnalysisAgent } from './dataAnalysisAgent.js';
export { systemAdminAgent } from './systemAdminAgent.js';
export { contentCreationAgent } from './contentCreationAgent.js';
export { problemSolvingAgent } from './problemSolvingAgent.js';
export { fileManagerAgent } from './fileManagerAgent.js';
export { developerAgent } from './developerAgent.js';
export { documentationAgent } from './documentationAgent.js';
export { researchAgent } from './researchAgent.js';
export { browserAgent } from './browserAgent.js';

// Export schemas and types
export { developmentTaskSchema } from './developerAgent.js';
export { fileOperationSchema, repositoryAnalysisSchema } from './fileManagerAgent.js';
export { analysisResultSchema } from './dataAnalysisAgent.js';
export { systemHealthSchema } from './systemAdminAgent.js';
export { contentOutputSchema } from './contentCreationAgent.js';
export { problemSolutionSchema } from './problemSolvingAgent.js';
export { browserAgentConfigSchema } from './browserAgent.js';

import { dataAnalysisAgent } from './dataAnalysisAgent.js';
import { systemAdminAgent } from './systemAdminAgent.js';
import { contentCreationAgent } from './contentCreationAgent.js';
import { problemSolvingAgent } from './problemSolvingAgent.js';
import { fileManagerAgent } from './fileManagerAgent.js';
import { developerAgent } from './developerAgent.js';
import { browserAgent } from './browserAgent.js';
import { documentationAgent } from './documentationAgent.js';
import { researchAgent } from './researchAgent.js';
import { workerAgent } from './workerAgent.js';

export const agentRegistry = {
  browser: browserAgent,
  dataAnalyst: dataAnalysisAgent,
  systemAdmin: systemAdminAgent,
  contentCreator: contentCreationAgent,
  problemSolver: problemSolvingAgent,
  fileManager: fileManagerAgent,
  developer: developerAgent,
  documentation: documentationAgent,
  research: researchAgent,
  worker: workerAgent,
} as const;

