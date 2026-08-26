import { FormRow, Bindings, WorkflowAction, WorkflowCondition, WorkflowRow } from "./types";
import { createWorkflowRun, createWorkflowStep, finishWorkflowRun, finishWorkflowStep, createNotification } from "./db";
import { sendNotification } from "./email";
import { deliverIntegration, IntegrationProvider } from "./integrations";

function parseConditions(raw: string): WorkflowCondition[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is WorkflowCondition => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).field === "string" && typeof (item as Record<string, unknown>).operator === "string");
  } catch { return []; }
}
function parseActions(raw: string): WorkflowAction[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is WorkflowAction => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).type === "string");
  } catch { return []; }
}
function matchesCondition(data: Record<string, string>, condition: WorkflowCondition): boolean {
  const left = data[condition.field] ?? "";
  const right = condition.value ?? "";
  if (condition.operator === "equals") return left === right;
  if (condition.operator === "not_equals") return left !== right;
  if (condition.operator === "contains") return left.includes(right);
  if (condition.operator === "gt") return Number(left) > Number(right);
  if (condition.operator === "lt") return Number(left) < Number(right);
  if (condition.operator === "is_not_empty") return left.trim() !== "";
  return false;
}
export function workflowMatches(workflow: WorkflowRow, data: Record<string, string>): boolean {
  return parseConditions(workflow.condition_json).every((condition) => matchesCondition(data, condition));
}

async function executeAction(env: Bindings, form: FormRow, data: Record<string, string>, action: WorkflowAction): Promise<string> {
  if (action.type === "email" || action.type === "notify") {
    await sendNotification(env, { ...form, notify_email: action.value || form.notify_email }, data);
    return action.value || form.notify_email ? "notification sent" : "notification skipped: no recipient configured";
  }
  if (action.type === "webhook") {
    const url = action.url || action.value || "";
    return deliverIntegration({ provider: "webhook", url }, data, { id: form.id, name: form.name });
  }
  if (action.type === "integration") {
    const provider = action.provider === "slack" || action.provider === "discord" || action.provider === "airtable" || action.provider === "google_sheets" ? action.provider : "webhook";
    return deliverIntegration({ provider, url: action.url || action.value || "", mapping: action.mapping }, data, { id: form.id, name: form.name });
  }
  if (action.type === "add_tag") {
    const tag = (action.value || "").trim();
    if (!tag) throw new Error("tag is empty");
    const tags = (data._tags || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!tags.includes(tag)) tags.push(tag);
    data._tags = tags.join(", ");
    return `tag added: ${tag}`;
  }
  if (action.type === "wait") {
    const delay = Math.max(0, Math.min(action.delayMs ?? Number(action.value ?? 0), 10000));
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    return `waited ${delay}ms`;
  }
  throw new Error(`unsupported workflow action: ${action.type}`);
}

export async function executeWorkflow(env: Bindings, workflow: WorkflowRow, form: FormRow, submissionId: number | null, input: Record<string, string>): Promise<void> {
  const data = { ...input };
  if (!workflowMatches(workflow, data)) return;
  const run = await createWorkflowRun(env.DB, workflow.id, submissionId);
  const actions = parseActions(workflow.actions_json);
  try {
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const stepId = await createWorkflowStep(env.DB, run.id, index, action.type);
      let lastError = "";
      let success = false;
      for (let attempt = 0; attempt < 2 && !success; attempt += 1) {
        try {
          const detail = await executeAction(env, form, data, action);
          if (stepId !== null) await finishWorkflowStep(env.DB, stepId, "succeeded", attempt > 0 ? `${detail}; retry ${attempt}` : detail);
          success = true;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (attempt === 1 && stepId !== null) await finishWorkflowStep(env.DB, stepId, "failed", lastError);
        }
      }
      if (!success) throw new Error(lastError || `workflow step ${index + 1} failed`);
    }
    await finishWorkflowRun(env.DB, run.id, "succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishWorkflowRun(env.DB, run.id, "failed", message);
    await createNotification(env.DB, "workflow.failed", `Workflow failed: ${workflow.name}`, `${run.id}: ${message}`);
  }
}
