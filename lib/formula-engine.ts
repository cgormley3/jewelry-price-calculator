/**
 * Formula engine for custom pricing models.
 * Supports expression trees for Base, Wholesale, and Retail calculations.
 */

export type ValueType =
  | 'metal'
  | 'labor'
  | 'other'
  | 'stoneCost'
  | 'stoneRetail'
  | 'overhead'
  | 'totalMaterials'
  | 'base'
  | 'constant';

export type OpType = 'add' | 'subtract' | 'multiply' | 'divide' | 'percentOf';

export type FormulaNode =
  | { type: 'value'; value: ValueType }
  | { type: 'constant'; value: number }
  | { type: 'op'; op: OpType; left: FormulaNode; right: FormulaNode };

/** Context passed to evaluator - computed from item/calculator state */
export interface FormulaContext {
  metalCost: number;
  labor: number;
  other: number;
  stoneCost: number;
  stoneRetail: number;
  overhead: number;
  totalMaterials: number;
  base?: number; // Set when evaluating wholesale/retail (result of base formula)
}

/** Evaluate a formula node given context. base must be provided when node references 'base'. */
export function evaluateFormula(
  node: FormulaNode | null | undefined,
  ctx: FormulaContext
): number {
  if (!node) return 0;

  switch (node.type) {
    case 'value': {
      const v = node.value;
      if (v === 'metal') return ctx.metalCost;
      if (v === 'labor') return ctx.labor;
      if (v === 'other') return ctx.other;
      if (v === 'stoneCost') return ctx.stoneCost;
      if (v === 'stoneRetail') return ctx.stoneRetail;
      if (v === 'overhead') return ctx.overhead;
      if (v === 'totalMaterials') return ctx.totalMaterials;
      if (v === 'base') return ctx.base ?? 0;
      if (v === 'constant') return 0; // Constants use the constant node
      return 0;
    }
    case 'constant':
      return node.value;
    case 'op': {
      const left = evaluateFormula(node.left, ctx);
      const right = evaluateFormula(node.right, ctx);
      switch (node.op) {
        case 'add': return left + right;
        case 'subtract': return left - right;
        case 'multiply': return left * right;
        case 'divide': return right !== 0 ? left / right : 0;
        case 'percentOf': return left * (right / 100);
        default: return 0;
      }
    }
    default:
      return 0;
  }
}

/** Convert formula node to human-readable string for item card display */
export function formulaToReadableString(node: FormulaNode | null | undefined): string {
  if (!node) return '—';

  switch (node.type) {
    case 'value': {
      const labels: Record<ValueType, string> = {
        metal: 'Metal',
        labor: 'Labor',
        other: 'Other',
        stoneCost: 'Stone cost',
        stoneRetail: 'Stone retail',
        overhead: 'Overhead',
        totalMaterials: 'Total materials',
        base: 'Base',
        constant: 'Constant',
      };
      return labels[node.value] ?? node.value;
    }
    case 'constant':
      return String(node.value);
    case 'op': {
      const leftStr = formulaToReadableString(node.left);
      const rightStr = formulaToReadableString(node.right);
      switch (node.op) {
        case 'add': return `${leftStr} + ${rightStr}`;
        case 'subtract': return `${leftStr} − ${rightStr}`;
        case 'multiply': return `(${leftStr} × ${rightStr})`;
        case 'divide': return `(${leftStr} ÷ ${rightStr})`;
        case 'percentOf': return `(${leftStr} × ${rightStr}%)`;
        default: return `${leftStr} ? ${rightStr}`;
      }
    }
    default:
      return '—';
  }
}

/** Preset: Formula A (Base = Metal + Labor + Other + Overhead) */
export const PRESET_A = {
  base: {
    type: 'op' as const,
    op: 'add' as const,
    left: {
      type: 'op' as const,
      op: 'add' as const,
      left: { type: 'value' as const, value: 'metal' as const },
      right: { type: 'value' as const, value: 'labor' as const },
    },
    right: {
      type: 'op' as const,
      op: 'add' as const,
      left: { type: 'value' as const, value: 'other' as const },
      right: { type: 'value' as const, value: 'overhead' as const },
    },
  } as FormulaNode,
  wholesale: {
    type: 'op' as const,
    op: 'add' as const,
    left: { type: 'value' as const, value: 'base' as const },
    right: { type: 'value' as const, value: 'stoneCost' as const },
  } as FormulaNode,
  retail: {
    type: 'op' as const,
    op: 'add' as const,
    left: {
      type: 'op' as const,
      op: 'multiply' as const,
      left: { type: 'value' as const, value: 'base' as const },
      right: { type: 'constant' as const, value: 3 },
    },
    right: { type: 'value' as const, value: 'stoneRetail' as const },
  } as FormulaNode,
};

/** Preset: Formula B */
export const PRESET_B = {
  base: {
    type: 'op' as const,
    op: 'add' as const,
    left: {
      type: 'op' as const,
      op: 'add' as const,
      left: {
        type: 'op' as const,
        op: 'multiply' as const,
        left: {
          type: 'op' as const,
          op: 'add' as const,
          left: { type: 'value' as const, value: 'metal' as const },
          right: { type: 'value' as const, value: 'other' as const },
        },
        right: { type: 'constant' as const, value: 1.8 },
      },
      right: { type: 'value' as const, value: 'labor' as const },
    },
    right: { type: 'value' as const, value: 'overhead' as const },
  } as FormulaNode,
  wholesale: {
    type: 'op' as const,
    op: 'add' as const,
    left: { type: 'value' as const, value: 'base' as const },
    right: { type: 'value' as const, value: 'stoneCost' as const },
  } as FormulaNode,
  retail: {
    type: 'op' as const,
    op: 'add' as const,
    left: {
      type: 'op' as const,
      op: 'multiply' as const,
      left: { type: 'value' as const, value: 'base' as const },
      right: { type: 'constant' as const, value: 2 },
    },
    right: { type: 'value' as const, value: 'stoneRetail' as const },
  } as FormulaNode,
};

/** Custom pricing model schema stored in DB */
export interface PricingModel {
  id?: string;
  user_id: string;
  name: string;
  formula_base: FormulaNode;
  formula_wholesale: FormulaNode;
  formula_retail: FormulaNode;
  created_at?: string;
}

/** Compute base, wholesale, retail from custom formulas */
export function evaluateCustomModel(
  model: { formula_base: FormulaNode; formula_wholesale: FormulaNode; formula_retail: FormulaNode },
  ctx: Omit<FormulaContext, 'base'>
): { base: number; wholesale: number; retail: number } {
  const base = evaluateFormula(model.formula_base, { ...ctx, base: undefined });
  const ctxWithBase = { ...ctx, base };
  const wholesale = evaluateFormula(model.formula_wholesale, ctxWithBase);
  const retail = evaluateFormula(model.formula_retail, ctxWithBase);
  return { base, wholesale, retail };
}

/** Check if a formula references 'base' (for validation - wholesale/retail can use base) */
export function formulaReferencesBase(node: FormulaNode | null | undefined): boolean {
  if (!node) return false;
  if (node.type === 'value' && node.value === 'base') return true;
  if (node.type === 'op') {
    return formulaReferencesBase(node.left) || formulaReferencesBase(node.right);
  }
  return false;
}

/** Token for formula builder - linear list that parses to tree */
export type FormulaToken =
  | { kind: 'value'; value: ValueType }
  | { kind: 'constant'; value: number }
  | { kind: 'op'; op: OpType };

/** Result of parsing tokens - node plus optional warning when placeholders were used */
export interface ParseResult {
  node: FormulaNode | null;
  /** True when placeholders were added (trailing op, leading op, op-only) - formula needs completion */
  hasPlaceholders: boolean;
}

/** Parse token list to FormulaNode. Always produces a node for non-empty input; uses placeholders when needed. */
export function parseTokens(tokens: FormulaToken[]): FormulaNode | null {
  const result = parseTokensWithValidation(tokens);
  return result.node;
}

/** Parse tokens and return node plus validation info (e.g. whether placeholders were added). */
export function parseTokensWithValidation(tokens: FormulaToken[]): ParseResult {
  if (tokens.length === 0) return { node: null, hasPlaceholders: false };

  let hasPlaceholders = false;
  const terms: FormulaNode[] = [];
  const ops: OpType[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'value') terms.push({ type: 'value', value: t.value });
    else if (t.kind === 'constant') terms.push({ type: 'constant', value: t.value });
    else if (t.kind === 'op') {
      if (i === 0) {
        // Leading op: add placeholder left operand so user can arrange later
        terms.push({ type: 'constant', value: 1 });
        ops.push(t.op);
        hasPlaceholders = true;
      } else if (i < tokens.length - 1) {
        // Op between terms
        ops.push(t.op);
      } else if (terms.length >= 2) {
        // Trailing op with 2+ terms - op applies to last two
        ops.push(t.op);
      } else if (terms.length === 1) {
        // Trailing op after single term: add placeholder so user can edit
        terms.push({ type: 'constant', value: 1 });
        ops.push(t.op);
        hasPlaceholders = true;
      }
    }
  }

  // Op-only (e.g. [×] or [+]) - add two placeholders
  if (terms.length === 0 && ops.length > 0) {
    const op = ops[0];
    terms.push({ type: 'constant', value: 1 });
    terms.push({ type: 'constant', value: 1 });
    ops.length = 0;
    ops.push(op);
    hasPlaceholders = true;
  }

  if (terms.length === 0) return { node: null, hasPlaceholders: false };
  // Op-only case: we added 1 term for leading op, need 2nd term for valid formula
  if (terms.length === 1 && ops.length === 1) {
    terms.push({ type: 'constant', value: 1 });
    hasPlaceholders = true;
  }
  if (terms.length === 1 && ops.length === 0) return { node: terms[0], hasPlaceholders };

  // If we have n terms and n-1 ops, valid. If fewer ops, assume add between missing.
  // If MORE ops than terms-1, add placeholder terms (never drop user's operations)
  while (ops.length < terms.length - 1) {
    ops.push('add');
  }
  while (ops.length > terms.length - 1) {
    terms.push({ type: 'constant', value: 1 });
    hasPlaceholders = true;
  }

  const precedence = (op: OpType) =>
    op === 'multiply' || op === 'divide' || op === 'percentOf' ? 1 : 0;

  function build(from: number, to: number): FormulaNode | null {
    if (from === to) return terms[from] ?? null;
    let lowest = from;
    for (let i = from; i < to; i++) {
      if (precedence(ops[i]) < precedence(ops[lowest])) lowest = i;
    }
    const left = build(from, lowest);
    const right = build(lowest + 1, to);
    if (!left || !right) return null;
    return { type: 'op', op: ops[lowest], left, right };
  }
  return { node: build(0, terms.length - 1), hasPlaceholders };
}

/** Strict parse: valid only when tokens form a complete formula with no placeholders. */
export function parseTokensStrict(tokens: FormulaToken[]): { node: FormulaNode | null; valid: boolean } {
  if (tokens.length === 0) return { node: null, valid: false };
  const terms: FormulaNode[] = [];
  const ops: OpType[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'value') terms.push({ type: 'value', value: t.value });
    else if (t.kind === 'constant') terms.push({ type: 'constant', value: t.value });
    else if (t.kind === 'op') {
      if (i === 0) return { node: null, valid: false }; // leading op
      if (i === tokens.length - 1) return { node: null, valid: false }; // trailing op
      ops.push(t.op);
    }
  }
  if (terms.length === 0) return { node: null, valid: false }; // op-only
  if (terms.length !== ops.length + 1) return { node: null, valid: false };
  const precedence = (op: OpType) =>
    op === 'multiply' || op === 'divide' || op === 'percentOf' ? 1 : 0;
  function build(from: number, to: number): FormulaNode | null {
    if (from === to) return terms[from] ?? null;
    let lowest = from;
    for (let i = from; i < to; i++) {
      if (precedence(ops[i]) < precedence(ops[lowest])) lowest = i;
    }
    const left = build(from, lowest);
    const right = build(lowest + 1, to);
    if (!left || !right) return null;
    return { type: 'op', op: ops[lowest], left, right };
  }
  const node = build(0, terms.length - 1);
  return { node, valid: !!node };
}

/** Display tokens as readable string (for invalid formulas) */
export function tokensToReadableString(tokens: FormulaToken[]): string {
  if (tokens.length === 0) return '—';
  return tokens
    .map(t =>
      t.kind === 'value' ? (VALUE_LABELS[t.value] ?? t.value) : t.kind === 'constant' ? String(t.value) : OP_LABELS[t.op]
    )
    .join(' ');
}

/** Convert FormulaNode to token list (for editing in builder) */
export function formulaToTokens(node: FormulaNode | null | undefined): FormulaToken[] {
  if (!node) return [];
  if (node.type === 'value') return [{ kind: 'value', value: node.value }];
  if (node.type === 'constant') return [{ kind: 'constant', value: node.value }];
  if (node.type === 'op') {
    return [
      ...formulaToTokens(node.left),
      { kind: 'op' as const, op: node.op },
      ...formulaToTokens(node.right),
    ];
  }
  return [];
}

/** Value block labels for palette */
export const VALUE_LABELS: Record<ValueType, string> = {
  metal: 'Metal',
  labor: 'Labor',
  other: 'Other',
  stoneCost: 'Stone cost',
  stoneRetail: 'Stone retail',
  overhead: 'Overhead',
  totalMaterials: 'Total materials',
  base: 'Base',
  constant: 'Constant',
};

export const OP_LABELS: Record<OpType, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  percentOf: '% of',
};
