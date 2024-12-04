import React from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Graph } from '@/lib/flow/graph';
import { LabelClass, Span } from '@/lib/traces/types';

import { EvaluatorEditor } from './evaluator-editor';

interface EvaluatorEditorDialogProps {
  span: Span;
  labelClass: LabelClass;
  onEvaluatorAdded?: (evaluatorRunnableGraph: Graph) => void;
  children: React.ReactNode;
}

export function EvaluatorEditorDialog({
  span,
  labelClass,
  onEvaluatorAdded,
  children
}: EvaluatorEditorDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-[80vw] h-[90vh] flex flex-col p-0 space-y-0 gap-0">
        <DialogHeader className="flex-none border-b p-4 m-0">
          <DialogTitle>
            Online evaluator
          </DialogTitle>
          <DialogDescription>
            Create an evaluator that will be triggered on spans at this path.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-grow">
          <EvaluatorEditor
            span={span}
            labelClass={labelClass}
            onEvaluatorAdded={onEvaluatorAdded}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
