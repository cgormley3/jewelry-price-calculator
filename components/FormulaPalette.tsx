'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { ValueType, OpType, FormulaToken } from '@/lib/formula-engine';
import { VALUE_LABELS, OP_LABELS } from '@/lib/formula-engine';

const VALUE_BLOCKS: ValueType[] = [
  'metal',
  'labor',
  'other',
  'stoneCost',
  'stoneRetail',
  'overhead',
  'totalMaterials',
  'base',
];

const OP_BLOCKS: OpType[] = ['add', 'subtract', 'multiply', 'divide', 'percentOf'];

interface DraggableBlockProps {
  token: FormulaToken;
  id: string;
}

function DraggableBlock({ token, id }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { token },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const label =
    token.kind === 'value'
      ? VALUE_LABELS[token.value]
      : token.kind === 'constant'
        ? String(token.value)
        : OP_LABELS[token.op];

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      type="button"
      className={`
        px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all
        ${token.kind === 'op' ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-white text-slate-700 border-stone-200 hover:border-[#A5BEAC]'}
        ${isDragging ? 'opacity-50 shadow-lg' : ''}
      `}
    >
      {label}
    </button>
  );
}

export default function FormulaPalette() {
  return (
    <div className="space-y-3">
      <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider">
        Value blocks
      </p>
      <div className="flex flex-wrap gap-1.5">
        {VALUE_BLOCKS.map((v) => (
          <DraggableBlock
            key={`val-${v}`}
            id={`val-${v}`}
            token={{ kind: 'value', value: v }}
          />
        ))}
      </div>
      <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mt-2">
        Operations
      </p>
      <div className="flex flex-wrap gap-1.5">
        {OP_BLOCKS.map((o) => (
          <DraggableBlock
            key={`op-${o}`}
            id={`op-${o}`}
            token={{ kind: 'op', op: o }}
          />
        ))}
      </div>
      <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider mt-2">
        Constant
      </p>
      <ConstantBlock />
    </div>
  );
}

function ConstantBlock() {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: 'constant',
    data: { token: { kind: 'constant' as const, value: 1 }, isConstantPlaceholder: true },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      type="button"
      className={`
        px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all
        bg-white text-slate-700 border-stone-200 hover:border-[#A5BEAC]
        ${isDragging ? 'opacity-50 shadow-lg' : ''}
      `}
    >
      #
    </button>
  );
}
