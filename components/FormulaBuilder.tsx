'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type {
  FormulaNode,
  FormulaToken,
} from '@/lib/formula-engine';
import {
  parseTokens,
  formulaToTokens,
  formulaToReadableString,
  evaluateCustomModel,
  formulaReferencesBase,
  VALUE_LABELS,
  OP_LABELS,
  PRESET_A,
  PRESET_B,
} from '@/lib/formula-engine';
import FormulaPalette from './FormulaPalette';

type SlotId = 'base' | 'wholesale' | 'retail';

interface FormulaBuilderProps {
  model: {
    formula_base: FormulaNode;
    formula_wholesale: FormulaNode;
    formula_retail: FormulaNode;
  };
  onChange: (model: { formula_base: FormulaNode; formula_wholesale: FormulaNode; formula_retail: FormulaNode }) => void;
  /** Optional: round prices for preview display (e.g. to nearest $1, $5) */
  roundForDisplay?: (num: number) => number;
  /** Optional: computed context for live preview */
  previewContext?: {
    metalCost: number;
    labor: number;
    other: number;
    stoneCost: number;
    stoneRetail: number;
    overhead: number;
    totalMaterials: number;
  };
}

function getSlotTokens(
  model: { formula_base: FormulaNode; formula_wholesale: FormulaNode; formula_retail: FormulaNode },
  slot: SlotId
): FormulaToken[] {
  const node = slot === 'base' ? model.formula_base : slot === 'wholesale' ? model.formula_wholesale : model.formula_retail;
  return formulaToTokens(node);
}

function setSlotFormula(
  model: { formula_base: FormulaNode; formula_wholesale: FormulaNode; formula_retail: FormulaNode },
  slot: SlotId,
  node: FormulaNode | null,
  onChange: (m: typeof model) => void
) {
  if (slot === 'base') {
    onChange({ ...model, formula_base: node ?? PRESET_A.base });
  } else if (slot === 'wholesale') {
    onChange({ ...model, formula_wholesale: node ?? PRESET_A.wholesale });
  } else {
    onChange({ ...model, formula_retail: node ?? PRESET_A.retail });
  }
}

function FormulaSlot({
  slot,
  label,
  model,
  onChange,
  tokens,
  onTokenRemove,
  onConstantChange,
}: {
  slot: SlotId;
  label: string;
  model: { formula_base: FormulaNode; formula_wholesale: FormulaNode; formula_retail: FormulaNode };
  onChange: (m: typeof model) => void;
  tokens: FormulaToken[];
  onTokenRemove: (slot: SlotId, idx: number) => void;
  onConstantChange: (slot: SlotId, idx: number, value: number) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${slot}`,
    data: { slot },
  });

  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-stone-400 uppercase">{label}</p>
      <div
        ref={setNodeRef}
        className={`
          min-h-[44px] p-2 rounded-xl border-2 border-dashed flex flex-wrap items-center gap-1.5
          ${isOver ? 'border-[#A5BEAC] bg-[#A5BEAC]/5' : 'border-stone-200 bg-stone-50/50'}
        `}
      >
        {tokens.length === 0 ? (
          <span className="text-[9px] text-stone-400 italic">Drop blocks here</span>
        ) : (
          tokens.map((t, idx) => (
            <TokenChip
              key={`${slot}-${idx}`}
              token={t}
              onRemove={() => onTokenRemove(slot, idx)}
              onConstantChange={t.kind === 'constant' ? (v) => onConstantChange(slot, idx, v) : undefined}
            />
          ))
        )}
      </div>
      <p className="text-[8px] text-stone-400 truncate" title={formulaToReadableString(slot === 'base' ? model.formula_base : slot === 'wholesale' ? model.formula_wholesale : model.formula_retail)}>
        {formulaToReadableString(slot === 'base' ? model.formula_base : slot === 'wholesale' ? model.formula_wholesale : model.formula_retail)}
      </p>
    </div>
  );
}

function TokenChip({
  token,
  onRemove,
  onConstantChange,
}: {
  token: FormulaToken;
  onRemove: () => void;
  onConstantChange?: (v: number) => void;
}) {
  const label =
    token.kind === 'value'
      ? VALUE_LABELS[token.value]
      : token.kind === 'constant'
        ? String(token.value)
        : OP_LABELS[token.op];

  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white border border-stone-200 text-[10px] font-bold">
      {token.kind === 'constant' && onConstantChange ? (
        <input
          type="number"
          step="0.1"
          className="w-10 text-center text-[10px] font-bold border-0 bg-transparent p-0 outline-none"
          value={token.value}
          onChange={(e) => onConstantChange(Number(e.target.value) || 0)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        label
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="text-stone-400 hover:text-red-500 text-[10px] leading-none"
        aria-label="Remove"
      >
        ×
      </button>
    </span>
  );
}

export default function FormulaBuilder({
  model,
  onChange,
  roundForDisplay,
  previewContext,
}: FormulaBuilderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState<FormulaToken | null>(null);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    const data = e.active.data.current;
    if (data?.token) {
      setActiveToken(data.token);
      if (data.token.kind === 'constant' && data.isConstantPlaceholder) {
        setActiveToken({ kind: 'constant', value: 1 });
      }
    } else {
      setActiveToken(null);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setActiveToken(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const data = active.data.current;
    if (!data?.token || !overId.startsWith('slot-')) return;
    const slot = overId.replace('slot-', '') as SlotId;
    const tokens = getSlotTokens(model, slot);
    const token = data.token.kind === 'constant' && data.isConstantPlaceholder
      ? { kind: 'constant' as const, value: 1 }
      : data.token;
    const newTokens = [...tokens, token];
    const node = parseTokens(newTokens);
    if (node) setSlotFormula(model, slot, node, onChange);
  };

  const handleTokenRemove = (slot: SlotId, idx: number) => {
    const tokens = getSlotTokens(model, slot);
    const copy = tokens.filter((_, i) => i !== idx);
    const node = copy.length > 0 ? parseTokens(copy) : null;
    setSlotFormula(model, slot, node, onChange);
  };

  const handleConstantChange = (slot: SlotId, idx: number, value: number) => {
    const tokens = getSlotTokens(model, slot);
    const copy = [...tokens];
    if (copy[idx]?.kind === 'constant') {
      copy[idx] = { kind: 'constant', value };
      const node = parseTokens(copy);
      if (node) setSlotFormula(model, slot, node, onChange);
    }
  };

  const preview =
    previewContext &&
    (() => {
      try {
        const r = evaluateCustomModel(model, previewContext);
        return r;
      } catch {
        return null;
      }
    })();

  const baseRefsBase = formulaReferencesBase(model.formula_base);

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={pointerWithin}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange({
              formula_base: PRESET_A.base,
              formula_wholesale: PRESET_A.wholesale,
              formula_retail: PRESET_A.retail,
            })}
            className="px-2 py-1 rounded-lg text-[9px] font-bold border border-stone-200 bg-white hover:border-[#A5BEAC]"
          >
            Load Preset A
          </button>
          <button
            type="button"
            onClick={() => onChange({
              formula_base: PRESET_B.base,
              formula_wholesale: PRESET_B.wholesale,
              formula_retail: PRESET_B.retail,
            })}
            className="px-2 py-1 rounded-lg text-[9px] font-bold border border-stone-200 bg-white hover:border-[#A5BEAC]"
          >
            Load Preset B
          </button>
        </div>
        {baseRefsBase && (
          <p className="text-[9px] text-amber-600 font-medium">
            Base formula cannot reference Base (circular).
          </p>
        )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-100">
          <FormulaPalette />
        </div>
        <div className="space-y-4">
          <FormulaSlot
            slot="base"
            label="Base cost"
            model={model}
            onChange={onChange}
            tokens={getSlotTokens(model, 'base')}
            onTokenRemove={handleTokenRemove}
            onConstantChange={handleConstantChange}
          />
          <FormulaSlot
            slot="wholesale"
            label="Wholesale"
            model={model}
            onChange={onChange}
            tokens={getSlotTokens(model, 'wholesale')}
            onTokenRemove={handleTokenRemove}
            onConstantChange={handleConstantChange}
          />
          <FormulaSlot
            slot="retail"
            label="Retail"
            model={model}
            onChange={onChange}
            tokens={getSlotTokens(model, 'retail')}
            onTokenRemove={handleTokenRemove}
            onConstantChange={handleConstantChange}
          />
          {preview && (
            <div className="p-3 rounded-xl bg-white border border-stone-200 text-[10px] space-y-1">
              <p className="font-black text-stone-500 uppercase">Preview</p>
              <p>Base: ${(roundForDisplay ? roundForDisplay(preview.base) : preview.base).toFixed(2)}</p>
              <p>Wholesale: ${(roundForDisplay ? roundForDisplay(preview.wholesale) : preview.wholesale).toFixed(2)}</p>
              <p>Retail: ${(roundForDisplay ? roundForDisplay(preview.retail) : preview.retail).toFixed(2)}</p>
            </div>
          )}
        </div>
      </div>
      </div>

      <DragOverlay>
        {activeToken ? (
          <span className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase border bg-white text-slate-700 border-stone-200 shadow-lg">
            {activeToken.kind === 'value'
              ? VALUE_LABELS[activeToken.value]
              : activeToken.kind === 'constant'
                ? String(activeToken.value)
                : OP_LABELS[activeToken.op]}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
