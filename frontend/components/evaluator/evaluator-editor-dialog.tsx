import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { EvaluatorEditor } from './evaluator-editor';
import { LabelClass, Span } from '@/lib/traces/types';
import { DialogDescription, DialogTitle } from '@radix-ui/react-dialog';
import { Graph } from '@/lib/flow/graph';

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
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-[80vw] h-[90vh] p-0">
        <div className="hidden">
          <DialogHeader>
            <DialogTitle></DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex">
          <EvaluatorEditor span={span} labelClass={labelClass} onEvaluatorAdded={onEvaluatorAdded} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
