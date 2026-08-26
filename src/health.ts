import { FormRow } from "./types";
import { isSchemaV2, parseSchema } from "./blocks";
import { validateSchemaV2 } from "./logic";

export type HealthItem = { level: "error" | "warning" | "ok"; message: string };

export function checkFormHealth(form: FormRow, hasEmailProvider: boolean): HealthItem[] {
  const items: HealthItem[] = [];
  const schema = parseSchema(form.schema_json);
  if (!schema) items.push({ level: "warning", message: "This is a headless form; publish a visual schema to use advanced form features." });
  if (schema && schema.blocks.length === 0) items.push({ level: "warning", message: "The form has no blocks." });
  if (schema) {
    for (const block of schema.blocks) if (!["divider", "page"].includes(block.type) && !block.label.trim()) items.push({ level: "error", message: `Block ${block.id} is missing a label.` });
    if (isSchemaV2(schema)) {
      const validation = validateSchemaV2(schema);
      for (const error of validation.errors) items.push({ level: "error", message: error });
      for (const warning of validation.warnings) items.push({ level: "warning", message: warning });
    }
    const redirect = schema.settings.redirectUrl || form.redirect_url;
    if (redirect) {
      try { new URL(redirect); } catch { items.push({ level: "error", message: "The redirect URL is invalid." }); }
    }
  }
  if (form.notify_email && !hasEmailProvider) items.push({ level: "warning", message: "A notification email is configured but RESEND_API_KEY is missing." });
  if (items.length === 0) items.push({ level: "ok", message: "No blocking issues found." });
  return items;
}
