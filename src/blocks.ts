import { Child } from "hono/jsx";

export type VariableType = "number" | "text" | "bool" | "date" | "currency";
export type BlockType =
  | "short_text"
  | "long_text"
  | "email"
  | "number"
  | "phone"
  | "url"
  | "date"
  | "select"
  | "radio"
  | "checkbox_choice"
  | "checkbox"
  | "rating"
  | "file"
  | "heading"
  | "paragraph"
  | "divider"
  | "page";

export type Block = {
  id: string;
  type: BlockType;
  label: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  min?: number | null;
  max?: number | null;
  multiple?: boolean;
  page_id?: string;
  variable?: string;
  calculation?: string;
  accept?: string;
  maxSize?: number | null;
};

export type FormSettings = {
  submitText: string;
  successMessage: string;
  redirectUrl: string;
  progressStyle?: "bar" | "steps" | "none";
  conversational?: boolean;
};

export type FormPage = { id: string; title: string; description?: string };
export type FormVariable = {
  id: string;
  name: string;
  type: VariableType;
  defaultValue?: string | number | boolean | null;
  expression?: string;
};

export type LogicSource = "answer" | "var" | "url" | "meta";
export type LogicOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "is_empty"
  | "is_not_empty"
  | "includes_any"
  | "includes_all";
export type LogicCondition = {
  source: LogicSource;
  key: string;
  operator: LogicOperator;
  value?: string | number | boolean | string[];
};
export type LogicGroup = { match: "all" | "any"; conditions: LogicCondition[] };
export type LogicAction =
  | { type: "show" | "hide" | "require"; target: string; value?: boolean }
  | { type: "show-section" | "hide-section"; target: string }
  | { type: "jump-to-page"; target: string }
  | { type: "jump-to-ending" | "disqualify"; target: string }
  | { type: "redirect"; target: string }
  | { type: "set-variable"; target: string; value: string };
export type LogicRule = {
  id: string;
  match: "all" | "any";
  conditions: LogicCondition[];
  actions: LogicAction[];
};
export type LLogicRule = LogicRule;
export type FormEnding = { id: string; title: string; message: string; redirectUrl?: string; conditions?: LogicGroup[]; disqualified?: boolean };

export type FormSchemaV1 = {
  version: 1;
  blocks: Block[];
  settings: FormSettings;
};

export type FormSchemaV2 = {
  version: 2;
  blocks: Block[];
  settings: FormSettings;
  pages: FormPage[];
  variables: FormVariable[];
  logic: LogicRule[];
  endings: FormEnding[];
};

export type FormSchema = FormSchemaV1 | FormSchemaV2;

export function isSchemaV2(schema: FormSchema | null | undefined): schema is FormSchemaV2 {
  return !!schema && schema.version === 2;
}

export function defaultSettings(): FormSettings {
  return { submitText: "Submit", successMessage: "", redirectUrl: "", progressStyle: "bar", conversational: false };
}

export function emptySchema(): FormSchemaV2 {
  return { version: 2, blocks: [], settings: defaultSettings(), pages: [{ id: "page_1", title: "Page 1" }], variables: [], logic: [], endings: [] };
}

function normalizeV2(o: Record<string, unknown>): FormSchemaV2 {
  const rawSettings = typeof o.settings === "object" && o.settings !== null ? o.settings as Record<string, unknown> : {};
  const pages = Array.isArray(o.pages) ? o.pages.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null).map((p, i) => ({
    id: typeof p.id === "string" && p.id ? p.id : `page_${i + 1}`,
    title: typeof p.title === "string" && p.title ? p.title : `Page ${i + 1}`,
    description: typeof p.description === "string" ? p.description : undefined,
  })) : [];
  return {
    version: 2,
    blocks: Array.isArray(o.blocks) ? o.blocks as Block[] : [],
    settings: {
      ...defaultSettings(),
      submitText: typeof rawSettings.submitText === "string" ? rawSettings.submitText : "Submit",
      successMessage: typeof rawSettings.successMessage === "string" ? rawSettings.successMessage : "",
      redirectUrl: typeof rawSettings.redirectUrl === "string" ? rawSettings.redirectUrl : "",
      progressStyle: rawSettings.progressStyle === "steps" || rawSettings.progressStyle === "none" ? rawSettings.progressStyle : "bar",
      conversational: rawSettings.conversational === true,
    },
    pages: pages.length > 0 ? pages as FormPage[] : [{ id: "page_1", title: "Page 1" }],
    variables: Array.isArray(o.variables) ? o.variables as FormVariable[] : [],
    logic: Array.isArray(o.logic) ? o.logic as LogicRule[] : [],
    endings: Array.isArray(o.endings) ? o.endings as FormEnding[] : [],
  };
}

export function parseSchema(raw: string | null | undefined): FormSchema | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(o.blocks)) return null;
    if (o.version === 1) {
      return {
        version: 1,
        blocks: o.blocks as Block[],
        settings: {
          ...defaultSettings(),
          ...(typeof o.settings === "object" && o.settings !== null ? o.settings as FormSettings : {}),
        },
      };
    }
    if (o.version === 2) return normalizeV2(o);
    return null;
  } catch { return null; }
}

export function genBlockId(): string {
  const a = "abcdefghijkmnopqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  let s = "blk_";
  for (const x of b) s += a[x % a.length];
  return s;
}

export const BLOCK_DEFS: Record<BlockType, { label: string; group: "Basic" | "Choice" | "Content" | "Advanced"; icon: string }> = {
  short_text: { label: "Short text", group: "Basic", icon: "M4 6h16M4 12h16M4 18h10" },
  long_text: { label: "Long text", group: "Basic", icon: "M3 6h18M3 12h18M8 18h10" },
  email: { label: "Email", group: "Basic", icon: "M4 4h16v16H4z M4 7l8 6 8-6" },
  number: { label: "Number", group: "Basic", icon: "M7 20l5-16 5 16M9 14h10" },
  phone: { label: "Phone", group: "Basic", icon: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M12 17h.01" },
  url: { label: "URL", group: "Basic", icon: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 1 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71" },
  date: { label: "Date", group: "Basic", icon: "M8 2v4 M16 2v4 M3 8h18 M3 4h18v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4z" },
  select: { label: "Dropdown", group: "Choice", icon: "M6 9l6 6 6-6" },
  radio: { label: "Single choice", group: "Choice", icon: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 0 0-18 0 M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 0 0-6 0" },
  checkbox_choice: { label: "Multiple choice", group: "Choice", icon: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  checkbox: { label: "Checkbox (consent)", group: "Choice", icon: "M9 11l3 3L22 4" },
  rating: { label: "Rating 1–5", group: "Choice", icon: "M12 2l3 5h6l-5 4 2 6-6-4-6 4h6z" },
  file: { label: "File upload", group: "Advanced", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6" },
  heading: { label: "Heading", group: "Content", icon: "M4 6h16M4 12h10M4 18h13" },
  paragraph: { label: "Paragraph", group: "Content", icon: "M3 6h18M7 12h14M7 18h14" },
  divider: { label: "Divider", group: "Content", icon: "M5 12h14" },
  page: { label: "Page break", group: "Content", icon: "M4 5h16M4 19h16M8 9l4 3-4 3" },
};

export function defaultsFor(type: BlockType): Block {
  const base: Block = { id: genBlockId(), type, label: BLOCK_DEFS[type].label, required: false, page_id: "page_1" };
  if (type === "select" || type === "radio" || type === "checkbox_choice") base.options = ["Option 1", "Option 2"];
  if (type === "file") base.multiple = false;
  if (type === "heading") base.label = "Section heading";
  if (type === "paragraph") base.label = "Add some helpful text for respondents.";
  if (type === "page") base.label = "Next page";
  return base;
}

export function validateBlockValue(block: Block, raw: unknown): string | null {
  const v = raw == null ? "" : String(raw).trim();
  const isEmpty = v === "" || (Array.isArray(raw) && raw.length === 0);
  if (block.type === "heading" || block.type === "divider" || block.type === "paragraph" || block.type === "page") return null;
  if (block.required && isEmpty) return "This field is required.";
  if (isEmpty) return null;
  if (block.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email.";
  if (block.type === "url" && (()=>{ try{ new URL(v); return false;} catch{return true;}})()) return "Enter a valid URL (include https://).";
  if (block.type === "number") {
    if (isNaN(Number(v))) return "Enter a number.";
    const n = Number(v);
    if (block.min != null && n < block.min) return `Must be ≥ ${block.min}.`;
    if (block.max != null && n > block.max) return `Must be ≤ ${block.max}.`;
  }
  if (block.type === "phone" && !/^[\d\s+()-]{7,20}$/.test(v)) return "Enter a valid phone number.";
  if (block.type === "date" && isNaN(Date.parse(v))) return "Enter a valid date.";
  if ((block.type === "select" || block.type === "radio") && block.options && !block.options.includes(v)) return "Invalid choice.";
  if (block.type === "checkbox_choice" && Array.isArray(raw)) {
    const arr = raw as string[];
    if (block.options && arr.some(x => !block.options!.includes(x))) return "Invalid choice.";
  }
  if (block.type === "rating") {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) return "Rating must be 1–5.";
  }
  if (block.type === "checkbox" && block.required && v !== "on" && v !== "true" && v !== "1" && v !== "checked") return "This field is required.";
  return null;
}

export function inputName(block: Block): string { return block.id; }

export type BlockRenderer = (block: Block, value: unknown) => Child;
void (null as unknown as BlockRenderer);
