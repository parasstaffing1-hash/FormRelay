import {
  FormSchemaV2,
  FormVariable,
  LogicAction,
  LogicCondition,
  LogicRule,
  LogicSource,
  LogicOperator,
} from "./blocks";

export type LogicContext = {
  answers: Record<string, unknown>;
  variables: Record<string, unknown>;
  url: Record<string, string>;
  meta: Record<string, unknown>;
};

export type LogicState = {
  visible: Record<string, boolean>;
  required: Record<string, boolean>;
  variables: Record<string, unknown>;
  page?: string;
  ending?: string;
  redirect?: string;
};

export type LogicValidation = { errors: string[]; warnings: string[] };

function asString(value: unknown): string {
  if (Array.isArray(value)) return value.map(asString).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolveSource(source: LogicSource, key: string, ctx: LogicContext): unknown {
  if (source === "answer") return ctx.answers[key];
  if (source === "var") return ctx.variables[key];
  if (source === "url") return ctx.url[key];
  return ctx.meta[key];
}

function compareValue(left: unknown, operator: LogicOperator, right: unknown): boolean {
  const leftText = asString(left).toLowerCase();
  const rightText = asString(right).toLowerCase();
  if (operator === "is_empty") return leftText === "";
  if (operator === "is_not_empty") return leftText !== "";
  if (operator === "equals") return leftText === rightText;
  if (operator === "not_equals") return leftText !== rightText;
  if (operator === "contains") return leftText.includes(rightText);
  if (operator === "gt") return asNumber(left) > asNumber(right);
  if (operator === "lt") return asNumber(left) < asNumber(right);
  if (operator === "gte") return asNumber(left) >= asNumber(right);
  if (operator === "lte") return asNumber(left) <= asNumber(right);
  const leftItems = Array.isArray(left) ? left.map(asString) : [asString(left)];
  const rightItems = Array.isArray(right) ? right.map(asString) : [asString(right)];
  if (operator === "includes_any") return rightItems.some((item) => leftItems.includes(item));
  if (operator === "includes_all") return rightItems.every((item) => leftItems.includes(item));
  return false;
}

export function evaluateCondition(condition: LogicCondition, ctx: LogicContext): boolean {
  return compareValue(resolveSource(condition.source, condition.key, ctx), condition.operator, condition.value);
}

export function evaluateRule(rule: LogicRule, ctx: LogicContext): boolean {
  const results = rule.conditions.map((condition) => evaluateCondition(condition, ctx));
  return rule.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

function setVariable(state: LogicState, target: string, expression: string): void {
  const value = evaluateExpression(expression, { ...state.variables });
  if (value !== undefined) state.variables[target] = value;
}

export function evaluateRules(rules: LogicRule[], ctx: LogicContext): LogicState {
  const state: LogicState = { visible: {}, required: {}, variables: { ...ctx.variables } };
  for (const rule of rules) {
    if (!evaluateRule(rule, { ...ctx, variables: state.variables })) continue;
    for (const action of rule.actions) {
      applyAction(action, state);
    }
  }
  return state;
}

export function applyAction(action: LogicAction, state: LogicState): void {
  if (action.type === "show") state.visible[action.target] = true;
  else if (action.type === "hide") state.visible[action.target] = false;
  else if (action.type === "require") state.required[action.target] = action.value !== false;
  else if (action.type === "show-section") state.visible[action.target] = true;
  else if (action.type === "hide-section") state.visible[action.target] = false;
  else if (action.type === "jump-to-page") state.page = action.target;
  else if (action.type === "jump-to-ending") state.ending = action.target;
  else if (action.type === "redirect") state.redirect = action.target;
  else if (action.type === "set-variable") setVariable(state, action.target, action.value);
}

export function pipeText(text: string, ctx: LogicContext): string {
  return text.replace(/\{\{\s*(answer|var|url|meta):([^}]+)\s*\}\}|\{\{\s*([^}:]+)\s*\}\}/g, (_match, source: string | undefined, key: string | undefined, simple: string | undefined) => {
    const value = source ? resolveSource(source as LogicSource, key?.trim() ?? "", ctx) : ctx.variables[simple?.trim() ?? ""] ?? ctx.answers[simple?.trim() ?? ""];
    return asString(value);
  });
}

type Token = { kind: "number" | "string" | "identifier" | "operator" | "paren"; value: string };

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === "(") { tokens.push({ kind: "paren", value: ch }); i += 1; continue; }
    if (ch === ")") { tokens.push({ kind: "paren", value: ch }); i += 1; continue; }
    if (/[+\-*/]/.test(ch)) { tokens.push({ kind: "operator", value: ch }); i += 1; continue; }
    if (ch === "\"" || ch === "'") {
      const quote = ch;
      let value = "";
      i += 1;
      while (i < expression.length && expression[i] !== quote) {
        value += expression[i];
        i += 1;
      }
      if (expression[i] !== quote) return null;
      i += 1;
      tokens.push({ kind: "string", value });
      continue;
    }
    const number = expression.slice(i).match(/^\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      i += number[0].length;
      continue;
    }
    const identifier = expression.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0] });
      i += identifier[0].length;
      continue;
    }
    return null;
  }
  return tokens;
}

export function resolveVariables(definitions: FormVariable[], answers: Record<string, unknown>, base: Record<string, unknown> = {}): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...base };
  for (const definition of definitions) resolved[definition.name] = definition.defaultValue ?? "";
  const inputs = { ...answers, ...resolved };
  for (let pass = 0; pass < definitions.length + 1; pass += 1) {
    let changed = false;
    for (const definition of definitions) {
      if (!definition.expression) continue;
      const value = evaluateExpression(definition.expression, { ...inputs, ...resolved });
      if (value !== undefined && resolved[definition.name] !== value) { resolved[definition.name] = value; changed = true; }
    }
    if (!changed) break;
  }
  return resolved;
}

export function evaluateExpression(expression: string, variables: Record<string, unknown>): unknown {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return undefined;
  let index = 0;
  const parsePrimary = (): unknown => {
    const token = tokens[index];
    if (!token) return undefined;
    if (token.kind === "number") { index += 1; return Number(token.value); }
    if (token.kind === "string") { index += 1; return token.value; }
    if (token.kind === "identifier") {
      index += 1;
      if (token.value === "true") return true;
      if (token.value === "false") return false;
      if (token.value === "null") return null;
      return variables[token.value];
    }
    if (token.value === "(") {
      index += 1;
      const value = parseAdditive();
      if (tokens[index]?.value !== ")") return undefined;
      index += 1;
      return value;
    }
    return undefined;
  };
  const parseMultiplicative = (): unknown => {
    let left = parsePrimary();
    while (tokens[index]?.kind === "operator" && (tokens[index].value === "*" || tokens[index].value === "/")) {
      const op = tokens[index].value;
      index += 1;
      const right = parsePrimary();
      if (typeof left !== "number" || typeof right !== "number") return undefined;
      left = op === "*" ? left * right : right === 0 ? undefined : left / right;
    }
    return left;
  };
  const parseAdditive = (): unknown => {
    let left = parseMultiplicative();
    while (tokens[index]?.kind === "operator" && (tokens[index].value === "+" || tokens[index].value === "-")) {
      const op = tokens[index].value;
      index += 1;
      const right = parseMultiplicative();
      if (typeof left === "number" && typeof right === "number") left = op === "+" ? left + right : left - right;
      else if (op === "+") left = `${asString(left)}${asString(right)}`;
      else return undefined;
    }
    return left;
  };
  const result = parseAdditive();
  return index === tokens.length ? result : undefined;
}

export function validateSchemaV2(schema: FormSchemaV2): LogicValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockIds = new Set(schema.blocks.map((block) => block.id));
  const pageIds = new Set(schema.pages.map((page) => page.id));
  const variableIds = new Set(schema.variables.map((variable) => variable.name));
  const endingIds = new Set(schema.endings.map((ending) => ending.id));
  for (const block of schema.blocks) {
    if (block.page_id && !pageIds.has(block.page_id)) errors.push(`Block ${block.id} references a missing page.`);
    if (block.calculation && evaluateExpression(block.calculation, Object.fromEntries(schema.variables.map((variable) => [variable.name, variable.defaultValue]))) === undefined) {
      warnings.push(`Calculation on ${block.label || block.id} could not be evaluated with current defaults.`);
    }
  }
  for (const rule of schema.logic) {
    for (const condition of rule.conditions) {
      if (condition.source === "answer" && !blockIds.has(condition.key)) errors.push(`Logic ${rule.id} references a missing field ${condition.key}.`);
      if (condition.source === "var" && !variableIds.has(condition.key)) errors.push(`Logic ${rule.id} references a missing variable ${condition.key}.`);
    }
    for (const action of rule.actions) {
      if (["show", "hide", "require", "show-section", "hide-section"].includes(action.type) && !blockIds.has(action.target) && !pageIds.has(action.target)) errors.push(`Logic ${rule.id} targets a missing field or page ${action.target}.`);
      if (action.type === "jump-to-page" && !pageIds.has(action.target)) errors.push(`Logic ${rule.id} jumps to a missing page ${action.target}.`);
      if (action.type === "jump-to-ending" && !endingIds.has(action.target)) errors.push(`Logic ${rule.id} references a missing ending ${action.target}.`);
      if (action.type === "set-variable" && !variableIds.has(action.target)) errors.push(`Logic ${rule.id} sets a missing variable ${action.target}.`);
    }
  }
  const reachablePages = new Set<string>(schema.pages.length > 0 ? [schema.pages[0].id] : []);
  for (const rule of schema.logic) {
    for (const action of rule.actions) if (action.type === "jump-to-page") reachablePages.add(action.target);
  }
  for (const page of schema.pages) if (!reachablePages.has(page.id) && schema.pages.length > 1) warnings.push(`Page ${page.title} has no explicit incoming logic path.`);
  return { errors, warnings };
}
