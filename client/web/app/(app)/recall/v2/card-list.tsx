'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef } from 'react';
import { RECALL_MAX_MAP_NODES } from '@mantle/content-core/recall-compile';
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react';
import type { RecallNodeDTO } from '@mantle/web-ui/types/recall-v2';
import { Button } from '@mantle/web-ui/ui/button';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { cn } from '@mantle/web-ui/lib/utils';
import { RECALL_ENTRY_SLUG, dropCard, moveCard } from '@/lib/recall-v2';

/**
 * The card column, in order, entry first. Drag a card by its grip, or use
 * the up and down buttons (they are also the keyboard path). The entry card
 * never moves and nothing can be dropped above it. Every move sends the
 * FULL order: the brain leaves unlisted cards at their old rank.
 */
export function CardList({
  nodes,
  openSlug,
  onOpen,
  onReorder,
  onAdd,
  busy,
  full,
}: {
  nodes: RecallNodeDTO[];
  openSlug: string | null;
  onOpen: (slug: string) => void;
  onReorder: (slugs: string[]) => void;
  onAdd: () => void;
  busy: boolean;
  full: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const slugs = dropCard(nodes, String(e.active.id), String(e.over.id));
    if (slugs) onReorder(slugs);
  }

  return (
    <div className="flex max-h-64 shrink-0 flex-col border-b border-border md:max-h-none md:w-64 md:border-r md:border-b-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {nodes.length} {nodes.length === 1 ? 'card' : 'cards'}
        </span>
        <Button
          size="2xs"
          variant="outline"
          onClick={onAdd}
          disabled={full}
          title={full ? `A map holds at most ${RECALL_MAX_MAP_NODES} cards.` : undefined}
        >
          <Plus /> Card
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={nodes.map((n) => n.slug)} strategy={verticalListSortingStrategy}>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
            {nodes.map((n, i) => (
              <CardRow
                key={n.id}
                index={i}
                node={n}
                open={n.slug === openSlug}
                onOpen={onOpen}
                onMove={(dir) => {
                  const slugs = moveCard(nodes, n.slug, dir);
                  if (slugs) onReorder(slugs);
                }}
                canUp={moveCard(nodes, n.slug, -1) !== null}
                canDown={moveCard(nodes, n.slug, 1) !== null}
                busy={busy}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function CardRow({
  index,
  node,
  open,
  onOpen,
  onMove,
  canUp,
  canDown,
  busy,
}: {
  index: number;
  node: RecallNodeDTO;
  open: boolean;
  onOpen: (slug: string) => void;
  onMove: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
  busy: boolean;
}) {
  const entry = node.slug === RECALL_ENTRY_SLUG;
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.slug, disabled: entry || busy });

  // Keep the keyboard where it was across a move. The row is re-ordered in
  // the DOM, and a button that just became disabled (the card reached the
  // top, or the bottom) drops focus to the page; the other one takes it.
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef<-1 | 1 | null>(null);
  useEffect(() => {
    const dir = refocus.current;
    if (dir === null) return;
    refocus.current = null;
    const want = dir === -1 ? (canUp ? upRef : downRef) : canDown ? downRef : upRef;
    want.current?.focus();
  }, [index, canUp, canDown]);

  function move(dir: -1 | 1) {
    // Not `disabled` while a write runs: that would drop focus on every move.
    if (busy) return;
    refocus.current = dir;
    onMove(dir);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative flex items-center gap-1', isDragging && 'z-10 opacity-80')}
    >
      {entry ? (
        <span className="size-6 shrink-0" aria-hidden />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-2xs"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag to reorder ${node.title}`}
          className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical />
        </Button>
      )}
      <RowButton
        onClick={() => onOpen(node.slug)}
        aria-current={open ? 'true' : undefined}
        className={cn(
          'min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-muted',
          (open || isDragging) && 'bg-muted',
        )}
      >
        <span className="block truncate text-sm">{node.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {entry && <span className="font-medium text-primary-ink">entry</span>}
          {node.kind === 'prompt' && <span className="text-info-ink">prompt</span>}
          {node.promptPending && <span className="text-info-ink">prompt requested</span>}
          <span className="truncate font-mono">{node.slug}</span>
        </span>
      </RowButton>
      {!entry && (
        // Shown on hover or focus where there is a pointer that hovers; always
        // shown on touch, which has no hover to reveal them.
        <div className="flex shrink-0 flex-col opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
          <Button
            ref={upRef}
            variant="ghost"
            size="icon-2xs"
            aria-label={`Move ${node.title} up`}
            aria-disabled={busy || undefined}
            disabled={!canUp}
            onClick={() => move(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            ref={downRef}
            variant="ghost"
            size="icon-2xs"
            aria-label={`Move ${node.title} down`}
            aria-disabled={busy || undefined}
            disabled={!canDown}
            onClick={() => move(1)}
          >
            <ArrowDown />
          </Button>
        </div>
      )}
    </li>
  );
}
