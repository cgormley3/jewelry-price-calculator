'use client';

import { useState, useEffect, useRef } from 'react';
import type { FormulaNode, FormulaToken } from '@/lib/formula-engine';
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
import BlockPicker from './BlockPicker';

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
  onTokenMove,
  placeholderText = 'Drop blocks here',
  isMobile,
  showAddButton,
  isPickerOpen,
  onAddClick,
  onBlockSelect,
  onPickerClose,
  addButtonRef,
}: {
  slot: SlotId;
  label: string;
  model: { formula_base: FormulaNode; formula_wholesale: FormulaNode; formula_retail: FormulaNode };
  onChange: (m: typeof model) => void;
  tokens: FormulaToken[];
  onTokenRemove: (slot: SlotId, idx: number) => void;
  onConstantChange: (slot: SlotId, idx: number, value: number) => void;
  onTokenMove?: (slot: SlotId, fromIdx: number, toIdx: number) => void;
  placeholderText?: string;
  isMobile?: boolean;
  showAddButton?: boolean;
  isPickerOpen?: boolean;
  onAddClick?: () => void;
  onBlockSelect?: (token: FormulaToken) => void;
  onPickerClose?: () => void;
  addButtonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-black text-stone-400 uppercase">{label}</p>
          {showAddButton && onAddClick && (
            <button
              ref={addButtonRef}
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddClick(); }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-lg font-bold border-2 border-[#A5BEAC] bg-[#A5BEAC]/10 text-[#A5BEAC] hover:bg-[#A5BEAC] hover:text-white active:bg-[#A5BEAC] active:text-white transition-all"
              aria-label={`Add block to ${label}`}
            >
              +
            </button>
          )}
        </div>
        {isPickerOpen && onBlockSelect && onPickerClose && addButtonRef && (
          <BlockPicker
            onSelect={onBlockSelect}
            onClose={onPickerClose}
            excludeBase={slot === 'base'}
            anchorRef={addButtonRef}
          />
        )}
      </div>
      <div
        className="min-h-[44px] p-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50 flex flex-wrap items-center gap-1.5"
      >
        {tokens.length === 0 ? (
          <span className="text-[9px] text-stone-400 italic">{placeholderText}</span>
        ) : (
          tokens.map((t, idx) => (
            <TokenChip
              key={`${slot}-${idx}`}
              token={t}
              onRemove={() => onTokenRemove(slot, idx)}
              onConstantChange={t.kind === 'constant' ? (v) => onConstantChange(slot, idx, v) : undefined}
              onMoveLeft={onTokenMove && idx > 0 ? () => onTokenMove(slot, idx, idx - 1) : undefined}
              onMoveRight={onTokenMove && idx < tokens.length - 1 ? () => onTokenMove(slot, idx, idx + 1) : undefined}
              isMobile={isMobile}
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
  onMoveLeft,
  onMoveRight,
  isMobile,
}: {
  token: FormulaToken;
  onRemove: () => void;
  onConstantChange?: (v: number) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  isMobile?: boolean;
}) {
  const label =
    token.kind === 'value'
      ? VALUE_LABELS[token.value]
      : token.kind === 'constant'
        ? String(token.value)
        : OP_LABELS[token.op];

  const showMoveButtons = isMobile && (onMoveLeft || onMoveRight);

  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white border border-stone-200 text-[10px] font-bold">
      {showMoveButtons && onMoveLeft && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveLeft(); }}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-400 hover:text-[#A5BEAC] active:text-[#A5BEAC] -ml-0.5 touch-manipulation"
          aria-label="Move earlier"
        >
          ←
        </button>
      )}
      {token.kind === 'constant' && onConstantChange ? (
        <input
          type="number"
          step="0.1"
          className={`text-center text-[10px] font-bold border-0 bg-transparent p-0 outline-none ${isMobile ? 'min-w-[44px] w-14' : 'w-10'}`}
          value={token.value}
          onChange={(e) => onConstantChange(Number(e.target.value) || 0)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        label
      )}
      {showMoveButtons && onMoveRight && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveRight(); }}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-400 hover:text-[#A5BEAC] active:text-[#A5BEAC] touch-manipulation"
          aria-label="Move later"
        >
          →
        </button>
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

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export default function FormulaBuilder({
  model,
  onChange,
  roundForDisplay,
  previewContext,
}: FormulaBuilderProps) {
  const isDesktop = useIsDesktop();
  const [pickerSlot, setPickerSlot] = useState<SlotId | null>(null);
  const baseAddRef = useRef<HTMLButtonElement>(null);
  const wholesaleAddRef = useRef<HTMLButtonElement>(null);
  const retailAddRef = useRef<HTMLButtonElement>(null);

  const handleBlockSelectForSlot = (slot: SlotId, token: FormulaToken) => {
    const tokens = getSlotTokens(model, slot);
    const newTokens = [...tokens, token];
    const node = parseTokens(newTokens);
    if (node) setSlotFormula(model, slot, node, onChange);
    setPickerSlot(null);
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

  const handleTokenMove = (slot: SlotId, fromIdx: number, toIdx: number) => {
    const tokens = getSlotTokens(model, slot);
    if (fromIdx < 0 || fromIdx >= tokens.length || toIdx < 0 || toIdx >= tokens.length || fromIdx === toIdx) return;
    const copy = [...tokens];
    const [removed] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, removed);
    const node = parseTokens(copy);
    if (node) setSlotFormula(model, slot, node, onChange);
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
      <div className="space-y-4 max-w-4xl">
          <FormulaSlot
            slot="base"
            label="Base cost"
            model={model}
            onChange={onChange}
            tokens={getSlotTokens(model, 'base')}
            onTokenRemove={handleTokenRemove}
            onConstantChange={handleConstantChange}
            onTokenMove={handleTokenMove}
            placeholderText="Click + to add blocks"
            isMobile={!isDesktop}
            showAddButton={true}
            isPickerOpen={pickerSlot === 'base'}
            onAddClick={() => setPickerSlot('base')}
            onBlockSelect={(token) => handleBlockSelectForSlot('base', token)}
            onPickerClose={() => setPickerSlot(null)}
            addButtonRef={baseAddRef}
          />
          <FormulaSlot
            slot="wholesale"
            label="Wholesale"
            model={model}
            onChange={onChange}
            tokens={getSlotTokens(model, 'wholesale')}
            onTokenRemove={handleTokenRemove}
            onConstantChange={handleConstantChange}
            onTokenMove={handleTokenMove}
            placeholderText="Click + to add blocks"
            isMobile={!isDesktop}
            showAddButton={true}
            isPickerOpen={pickerSlot === 'wholesale'}
            onAddClick={() => setPickerSlot('wholesale')}
            onBlockSelect={(token) => handleBlockSelectForSlot('wholesale', token)}
            onPickerClose={() => setPickerSlot(null)}
            addButtonRef={wholesaleAddRef}
          />
          <FormulaSlot
            slot="retail"
            label="Retail"
            model={model}
            onChange={onChange}
            tokens={getSlotTokens(model, 'retail')}
            onTokenRemove={handleTokenRemove}
            onConstantChange={handleConstantChange}
            onTokenMove={handleTokenMove}
            placeholderText="Click + to add blocks"
            isMobile={!isDesktop}
            showAddButton={true}
            isPickerOpen={pickerSlot === 'retail'}
            onAddClick={() => setPickerSlot('retail')}
            onBlockSelect={(token) => handleBlockSelectForSlot('retail', token)}
            onPickerClose={() => setPickerSlot(null)}
            addButtonRef={retailAddRef}
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
  );
}
