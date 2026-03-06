'use client';

import { useState, useEffect, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { FormulaNode, FormulaToken } from '@/lib/formula-engine';
import {
  parseTokensStrict,
  formulaToTokens,
  tokensToReadableString,
  evaluateCustomModel,
  formulaReferencesBase,
  VALUE_LABELS,
  OP_LABELS,
  PRESET_A,
  PRESET_B,
} from '@/lib/formula-engine';
import BlockPicker from './BlockPicker';

type SlotId = 'base' | 'wholesale' | 'retail';

export type FormulaTokens = {
  base: FormulaToken[];
  wholesale: FormulaToken[];
  retail: FormulaToken[];
};

interface FormulaBuilderProps {
  /** Raw tokens per slot - no parsing, no rules during editing */
  tokens: FormulaTokens;
  onChange: (tokens: FormulaTokens) => void;
  /** Called when validation state changes. valid=false when formula can't be saved. */
  onValidationChange?: (valid: boolean) => void;
  /** Optional: round prices for preview display */
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

function setSlotTokens(
  tokens: FormulaTokens,
  slot: SlotId,
  newSlotTokens: FormulaToken[],
  onChange: (t: FormulaTokens) => void
) {
  if (slot === 'base') {
    onChange({ ...tokens, base: newSlotTokens });
  } else if (slot === 'wholesale') {
    onChange({ ...tokens, wholesale: newSlotTokens });
  } else {
    onChange({ ...tokens, retail: newSlotTokens });
  }
}

function FormulaSlot({
  slot,
  label,
  tokens,
  slotTokens,
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
  tokens: FormulaTokens;
  slotTokens: FormulaToken[];
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
  const slotSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

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
        {slotTokens.length === 0 ? (
          <span className="text-[9px] text-stone-400 italic">{placeholderText}</span>
        ) : (
          <DndContext
            sensors={slotSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              const { active, over } = event;
              if (!over || active.id === over.id || !onTokenMove) return;
              const itemIds = slotTokens.map((_, i) => `${slot}-${i}`);
              const oldIndex = itemIds.indexOf(String(active.id));
              const newIndex = itemIds.indexOf(String(over.id));
              if (oldIndex !== -1 && newIndex !== -1) {
                onTokenMove(slot, oldIndex, newIndex);
              }
            }}
          >
            <SortableContext items={slotTokens.map((_, i) => `${slot}-${i}`)} strategy={horizontalListSortingStrategy}>
              {slotTokens.map((t, idx) => (
                <SortableTokenChip
                  key={`${slot}-${idx}`}
                  id={`${slot}-${idx}`}
                  slot={slot}
                  idx={idx}
                  token={t}
                  onRemove={() => onTokenRemove(slot, idx)}
                  onConstantChange={t.kind === 'constant' ? (v) => onConstantChange(slot, idx, v) : undefined}
                  onTokenMove={onTokenMove!}
                  tokens={slotTokens}
                  isMobile={!!isMobile}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      <p className="text-[8px] text-stone-400 truncate" title={tokensToReadableString(slotTokens)}>
        {tokensToReadableString(slotTokens)}
      </p>
    </div>
  );
}

function TokenChip({
  token,
  onRemove,
  onConstantChange,
  isMobile,
  embedded,
}: {
  token: FormulaToken;
  onRemove: () => void;
  onConstantChange?: (v: number) => void;
  isMobile?: boolean;
  embedded?: boolean;
}) {
  const label =
    token.kind === 'value'
      ? VALUE_LABELS[token.value]
      : token.kind === 'constant'
        ? String(token.value)
        : OP_LABELS[token.op];

  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-bold ${embedded ? '' : 'rounded-md bg-white border border-stone-200'}`}>
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
      <button
        type="button"
        onPointerDownCapture={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove();
        }}
        className="text-stone-400 hover:text-red-500 text-[10px] leading-none min-w-[22px] min-h-[22px] flex items-center justify-center -mr-0.5 p-0.5 rounded hover:bg-red-50 touch-manipulation"
        aria-label="Remove"
      >
        ×
      </button>
    </span>
  );
}

function SortableTokenChip({
  id,
  slot,
  idx,
  token,
  onRemove,
  onConstantChange,
  onTokenMove,
  tokens,
  isMobile,
}: {
  id: string;
  slot: SlotId;
  idx: number;
  token: FormulaToken;
  onRemove: () => void;
  onConstantChange?: (v: number) => void;
  onTokenMove: (slot: SlotId, fromIdx: number, toIdx: number) => void;
  tokens: FormulaToken[];
  isMobile: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-0.5 rounded-md bg-white border text-[10px] font-bold touch-manipulation ${isDragging ? 'opacity-60 border-[#A5BEAC] shadow-lg z-50' : 'border-stone-200'}`}
    >
      <span
        {...attributes}
        {...listeners}
        className={`flex items-center justify-center text-stone-400 hover:text-[#A5BEAC] cursor-grab active:cursor-grabbing -ml-0.5 ${isMobile ? 'min-w-[36px] min-h-[44px]' : 'min-w-[20px] min-h-[28px]'}`}
        aria-label="Drag to reorder"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="opacity-60">
          <circle cx="2" cy="2" r="1" />
          <circle cx="5" cy="2" r="1" />
          <circle cx="8" cy="2" r="1" />
          <circle cx="2" cy="5" r="1" />
          <circle cx="5" cy="5" r="1" />
          <circle cx="8" cy="5" r="1" />
          <circle cx="2" cy="8" r="1" />
          <circle cx="5" cy="8" r="1" />
          <circle cx="8" cy="8" r="1" />
        </svg>
      </span>
      <TokenChip token={token} onRemove={onRemove} onConstantChange={onConstantChange} isMobile={isMobile} />
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
  tokens,
  onChange,
  onValidationChange,
  roundForDisplay,
  previewContext,
}: FormulaBuilderProps) {
  const isDesktop = useIsDesktop();
  const [pickerSlot, setPickerSlot] = useState<SlotId | null>(null);
  const baseAddRef = useRef<HTMLButtonElement>(null);
  const wholesaleAddRef = useRef<HTMLButtonElement>(null);
  const retailAddRef = useRef<HTMLButtonElement>(null);

  const handleBlockSelectForSlot = (slot: SlotId, token: FormulaToken) => {
    const slotTokens = slot === 'base' ? tokens.base : slot === 'wholesale' ? tokens.wholesale : tokens.retail;
    setSlotTokens(tokens, slot, [...slotTokens, token], onChange);
    setPickerSlot(null);
  };

  const handleTokenRemove = (slot: SlotId, idx: number) => {
    const slotTokens = slot === 'base' ? tokens.base : slot === 'wholesale' ? tokens.wholesale : tokens.retail;
    const newTokens = slotTokens.filter((_, i) => i !== idx);
    setSlotTokens(tokens, slot, newTokens, onChange);
  };

  const handleConstantChange = (slot: SlotId, idx: number, value: number) => {
    const slotTokens = slot === 'base' ? tokens.base : slot === 'wholesale' ? tokens.wholesale : tokens.retail;
    const copy = [...slotTokens];
    if (copy[idx]?.kind === 'constant') {
      copy[idx] = { kind: 'constant', value };
      setSlotTokens(tokens, slot, copy, onChange);
    }
  };

  const handleTokenMove = (slot: SlotId, fromIdx: number, toIdx: number) => {
    const slotTokens = slot === 'base' ? tokens.base : slot === 'wholesale' ? tokens.wholesale : tokens.retail;
    if (fromIdx < 0 || fromIdx >= slotTokens.length || toIdx < 0 || toIdx >= slotTokens.length || fromIdx === toIdx) return;
    const copy = [...slotTokens];
    const [removed] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, removed);
    setSlotTokens(tokens, slot, copy, onChange);
  };

  const baseResult = parseTokensStrict(tokens.base);
  const wholesaleResult = parseTokensStrict(tokens.wholesale);
  const retailResult = parseTokensStrict(tokens.retail);
  const allValid = baseResult.valid && wholesaleResult.valid && retailResult.valid;
  const baseRefsBase = baseResult.node ? formulaReferencesBase(baseResult.node) : false;
  const isValid = allValid && !baseRefsBase;

  const preview =
    previewContext &&
    isValid &&
    baseResult.node &&
    wholesaleResult.node &&
    retailResult.node &&
    (() => {
      try {
        const model = {
          formula_base: baseResult.node!,
          formula_wholesale: wholesaleResult.node!,
          formula_retail: retailResult.node!,
        };
        return evaluateCustomModel(model, previewContext);
      } catch {
        return null;
      }
    })();

  useEffect(() => {
    onValidationChange?.(isValid);
  }, [tokens, isValid, onValidationChange]);

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange({
              base: formulaToTokens(PRESET_A.base),
              wholesale: formulaToTokens(PRESET_A.wholesale),
              retail: formulaToTokens(PRESET_A.retail),
            })}
            className="px-2 py-1 rounded-lg text-[9px] font-bold border border-stone-200 bg-white hover:border-[#A5BEAC]"
          >
            Load Preset A
          </button>
          <button
            type="button"
            onClick={() => onChange({
              base: formulaToTokens(PRESET_B.base),
              wholesale: formulaToTokens(PRESET_B.wholesale),
              retail: formulaToTokens(PRESET_B.retail),
            })}
            className="px-2 py-1 rounded-lg text-[9px] font-bold border border-stone-200 bg-white hover:border-[#A5BEAC]"
          >
            Load Preset B
          </button>
        </div>
        {!isValid && (
          <div className="text-red-700 bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-start gap-3 shadow-sm">
            <span className="text-xl leading-none" aria-hidden>⚠</span>
            <div>
              <p className="font-black text-base">Formula is invalid — can&apos;t save</p>
              <p className="text-sm font-medium text-red-600 mt-0.5">Each slot needs values and operations in a valid pattern (e.g. Metal + Labor). Fix the formula above before saving.</p>
            </div>
          </div>
        )}
      <div className="space-y-4 max-w-4xl">
          <FormulaSlot
            slot="base"
            label="Base cost"
            tokens={tokens}
            slotTokens={tokens.base}
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
            tokens={tokens}
            slotTokens={tokens.wholesale}
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
            tokens={tokens}
            slotTokens={tokens.retail}
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
