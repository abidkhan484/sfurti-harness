import { AdapterError } from "./process.ts";
import type { LlmRequest, LlmResult } from "./codex.ts";

export const llmTaskTypes = ["generation", "review"] as const;
export type LlmTaskType = (typeof llmTaskTypes)[number];
export interface TaskModelAssignment {
  provider: string;
  model: string;
}
export type TaskModelAssignments = Partial<Record<LlmTaskType, TaskModelAssignment>>;

export interface LlmProvider {
  capabilities: { text: boolean; images: boolean; audio: boolean; video: boolean };
  supportsModel(model: string): boolean;
  structured<T>(model: string, request: LlmRequest<T>): Promise<LlmResult<T>>;
}

/** Chooses a configured provider/model while keeping workflow task names provider-neutral. */
export class TaskModelRouter {
  assignments: TaskModelAssignments;
  providers: Record<string, LlmProvider>;
  constructor(assignments: TaskModelAssignments = {}, providers: Record<string, LlmProvider> = {}) {
    this.assignments = assignments;
    this.providers = providers;
    for (const [taskType, assignment] of Object.entries(assignments)) {
      if (!llmTaskTypes.includes(taskType as LlmTaskType))
        throw new AdapterError("configuration", `Unknown LLM task type: ${taskType}`);
      if (
        !assignment ||
        typeof assignment.provider !== "string" ||
        !assignment.provider.trim() ||
        typeof assignment.model !== "string" ||
        !assignment.model.trim()
      )
        throw new AdapterError(
          "configuration",
          `LLM task ${taskType} requires a nonempty provider and model`
        );
      const provider = providers[assignment.provider];
      if (!provider)
        throw new AdapterError(
          "configuration",
          `LLM task ${taskType} uses unknown provider: ${assignment.provider}`
        );
      if (!provider.supportsModel(assignment.model))
        throw new AdapterError(
          "configuration",
          `LLM task ${taskType} uses unsupported ${assignment.provider} model: ${assignment.model}`
        );
    }
  }
  async structured<T>(taskType: LlmTaskType, request: LlmRequest<T>): Promise<LlmResult<T>> {
    const assignment = this.assignments[taskType];
    if (!assignment)
      throw new AdapterError(
        "configuration",
        `LLM task ${taskType} has no configured provider/model assignment`
      );
    const provider = this.providers[assignment.provider];
    if (!provider)
      throw new AdapterError(
        "configuration",
        `LLM task ${taskType} uses unknown provider: ${assignment.provider}`
      );
    for (const capability of request.requiredCapabilities ?? [])
      if (!provider.capabilities[capability])
        throw new AdapterError(
          "rejected",
          `Configured ${assignment.provider}/${assignment.model} for ${taskType} does not support ${capability}`
        );
    return provider.structured(assignment.model, request);
  }
}
