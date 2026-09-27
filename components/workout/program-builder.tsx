"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Plus, Trash2 } from "lucide-react";

type ExerciseItem = {
  id: string; // Internal unique ID for DnD
  exerciseId: string; // Real DB Exercise ID
  name: string;
  sets?: number;
  reps?: number;
};

type Block = {
  id: string; // unique string id
  name: string; // e.g., Warmup
  exercises: ExerciseItem[];
};

function SortableExercise({ exercise, onRemove }: { exercise: ExerciseItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.id,
    data: {
      type: "Exercise",
      exercise,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 mb-2 bg-background border rounded-md shadow-sm group"
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground p-1">
        <GripVertical size={16} />
      </div>
      <div className="flex-1 font-medium">{exercise.name}</div>
      <div className="flex gap-2">
        <div className="text-sm text-muted-foreground">Sets: {exercise.sets || 0}</div>
        <div className="text-sm text-muted-foreground">Reps: {exercise.reps || 0}</div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100" onClick={onRemove}>
        <Trash2 size={16} />
      </Button>
    </div>
  );
}

function SortableBlock({ block, onRemoveBlock, onAddExercise }: { block: Block; onRemoveBlock: () => void; onAddExercise: (blockId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: {
      type: "Block",
      block,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="mb-6 border-2 focus-within:border-primary/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab p-1 bg-muted rounded hover:bg-muted/80">
            <GripVertical size={20} />
          </div>
          <CardTitle className="text-lg font-bold">{block.name}</CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemoveBlock} className="text-destructive">
          <Trash2 size={18} />
        </Button>
      </CardHeader>
      <CardContent>
        <DndContext collisionDetection={closestCenter}>
          <SortableContext items={block.exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div className="min-h-[50px] p-2 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/30 mt-2">
              {block.exercises.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">No exercises here yet.</div>
              ) : (
                block.exercises.map((ex) => (
                  <SortableExercise 
                    key={ex.id} 
                    exercise={ex} 
                    onRemove={() => {}} 
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onAddExercise(block.id)}>
            <Plus size={16} className="mr-2" />
            Add Exercise
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProgramBuilder({ planId, initialBlocks = [] }: { planId: string, initialBlocks?: Block[] }) {
  const [blocks, setBlocks] = useState<Block[]>(
    initialBlocks.length ? initialBlocks : [
      { id: "block-1", name: "Warmup", exercises: [] },
      { id: "block-2", name: "Main Circuit", exercises: [] },
      { id: "block-3", name: "Cooldown", exercises: [] },
    ]
  );
  
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveId(null);
      return;
    }

    if (active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        
        // Only block sorting implemented at top level context
        if (oldIndex !== -1 && newIndex !== -1) {
             return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }

    setActiveId(null);
  };
  
  const addBlock = (name: string) => {
    setBlocks([...blocks, { id: `block-${Date.now()}`, name, exercises: [] }]);
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  const handleSave = async () => {
    // Note: implementation of server action link goes here.
    // e.g. await saveProgramBuilderBlocksAction(planId, blocksFormattedForDB);
    alert('Plan structure saved successfully!');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-lg border">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Program Builder</h2>
          <p className="text-sm text-muted-foreground">Drag and drop blocks to reorder your session.</p>
        </div>
        <Button onClick={handleSave}>Save Program</Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block) => (
            <SortableBlock 
              key={block.id} 
              block={block} 
              onRemoveBlock={() => removeBlock(block.id)} 
              onAddExercise={(blockId) => {
                 // Demo exercise insertion logic
                 setBlocks(blocks.map(b => b.id === blockId ? {
                    ...b, 
                    exercises: [...b.exercises, { id: `ex-${Date.now()}`, exerciseId: 'some-db-id', name: 'New Sample Exercise', sets: 3, reps: 10 }]
                 } : b));
              }}
            />
          ))}
        </SortableContext>
        
        <DragOverlay dropAnimation={{ duration: 250 }}>
          {activeId ? (
            <div className="p-4 bg-primary/10 border-2 border-primary border-dashed rounded-lg opacity-80 h-20 flex items-center justify-center">
              Moving items...
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="flex gap-2 items-center">
         <Button variant="secondary" onClick={() => addBlock("New Block")} className="w-full border-dashed border-2 bg-background hover:bg-muted">
           <Plus size={16} className="mr-2" />
           Add Another Block
         </Button>
      </div>
    </div>
  );
}
