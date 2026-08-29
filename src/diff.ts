import { Block, FormSchema, parseSchema } from "./blocks";

/**
 * Structural diff between two saved form versions.
 *
 * Blocks are matched by id rather than position, so a reorder reads as a move instead of
 * a delete plus an add. This is what makes the diff useful for review: the interesting
 * changes are the ones that alter what respondents see or what lands in the data.
 */
export type FieldChange = { key: string; before: string; after: string };

export type BlockDiff =
  | { kind: "added"; id: string; label: string; type: string }
  | { kind: "removed"; id: string; label: string; type: string }
  | { kind: "moved"; id: string; label: string; from: number; to: number }
  | { kind: "changed"; id: string; label: string; changes: FieldChange[] };

export type SettingsDiff = FieldChange[];

export type SchemaDiff = {
  blocks: BlockDiff[];
  settings: SettingsDiff;
  /** True when nothing at all differs between the two versions. */
  identical: boolean;
};

function show(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return value.length ? value.map((v) => String(v)).join(", ") : "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = String(value);
  return text.trim() === "" ? "—" : text;
}

/** Block properties worth surfacing in a review. Internal keys are ignored. */
const BLOCK_FIELDS: (keyof Block)[] = ["type", "label", "help", "placeholder", "required", "options", "page_id"];

function compareBlocks(before: Block, after: Block): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of BLOCK_FIELDS) {
    const a = show(before[key]);
    const b = show(after[key]);
    if (a !== b) changes.push({ key: String(key), before: a, after: b });
  }
  return changes;
}

function compareSettings(before: FormSchema, after: FormSchema): SettingsDiff {
  const keys = new Set([...Object.keys(before.settings ?? {}), ...Object.keys(after.settings ?? {})]);
  const changes: SettingsDiff = [];
  for (const key of [...keys].sort()) {
    const a = show((before.settings as Record<string, unknown>)?.[key]);
    const b = show((after.settings as Record<string, unknown>)?.[key]);
    if (a !== b) changes.push({ key, before: a, after: b });
  }
  return changes;
}

export function diffSchemas(beforeJson: string | null, afterJson: string | null): SchemaDiff {
  const before = parseSchema(beforeJson);
  const after = parseSchema(afterJson);
  const beforeBlocks = before?.blocks ?? [];
  const afterBlocks = after?.blocks ?? [];

  const beforeById = new Map(beforeBlocks.map((block, index) => [block.id, { block, index }]));
  const afterById = new Map(afterBlocks.map((block, index) => [block.id, { block, index }]));

  const blocks: BlockDiff[] = [];

  for (const [id, { block, index }] of afterById) {
    const previous = beforeById.get(id);
    if (!previous) {
      blocks.push({ kind: "added", id, label: block.label || id, type: block.type });
      continue;
    }
    const changes = compareBlocks(previous.block, block);
    if (changes.length) blocks.push({ kind: "changed", id, label: block.label || id, changes });
    if (previous.index !== index) {
      blocks.push({ kind: "moved", id, label: block.label || id, from: previous.index + 1, to: index + 1 });
    }
  }

  for (const [id, { block }] of beforeById) {
    if (!afterById.has(id)) blocks.push({ kind: "removed", id, label: block.label || id, type: block.type });
  }

  const order = { added: 0, removed: 1, changed: 2, moved: 3 } as const;
  blocks.sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label));

  const settings = before && after ? compareSettings(before, after) : [];
  return { blocks, settings, identical: blocks.length === 0 && settings.length === 0 };
}

/** One-line summary for a version list, e.g. "2 added · 1 changed". */
export function summarizeDiff(diff: SchemaDiff): string {
  if (diff.identical) return "no changes";
  const counts = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const block of diff.blocks) counts[block.kind] += 1;
  const parts: string[] = [];
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (counts.changed) parts.push(`${counts.changed} changed`);
  if (counts.moved) parts.push(`${counts.moved} moved`);
  if (diff.settings.length) parts.push(`${diff.settings.length} setting${diff.settings.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
