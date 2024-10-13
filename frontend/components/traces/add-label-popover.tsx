import { LabelClass, LabelType, SpanLabel } from '@/lib/traces/types';
import { cn, swrFetcher } from '@/lib/utils';
import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Tag, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useProjectContext } from '@/contexts/project-context';
import { Table, TableBody, TableCell, TableRow } from '../ui/table';
import { AddLabel } from './add-label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useUserContext } from '@/contexts/user-context';

interface AddLabelPopoverProps {
  spanId: string;
  className?: string;
}

export function AddLabelPopover({
  spanId,
}: AddLabelPopoverProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { projectId } = useProjectContext();
  const { data: labelClasses, mutate: mutateLabelClasses } = useSWR<LabelClass[]>(`/api/projects/${projectId}/label-classes`, swrFetcher);
  const { data: labels, mutate: mutateLabels } = useSWR<SpanLabel[]>(`/api/projects/${projectId}/spans/${spanId}/labels`, swrFetcher);
  const [mode, setMode] = useState<'add' | 'list'>('list');

  const { email } = useUserContext();

  const addLabel = async (value: string, labelClass: LabelClass) => {
    const response = await fetch(`/api/projects/${projectId}/spans/${spanId}/labels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        classId: labelClass.id,
        value: labelClass.valueMap.findIndex(v => v === value),
      }),
    });

    if (response.ok) {
      mutateLabels();
    }
  };

  const removeLabel = async (labelId: string) => {
    const response = await fetch(`/api/projects/${projectId}/spans/${spanId}/labels/${labelId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      mutateLabels();
    }
  };

  const indexToValue = (index: number, labelClass: LabelClass) => {
    if (labelClass.labelType === LabelType.BOOLEAN) {
      if (index === 1) {
        return 'true';
      } else if (index === 0) {
        return 'false';
      }
      return undefined;
    }
    return labelClass.valueMap[index];
  };

  const findLabel = (labelClassId: string): SpanLabel | undefined =>
    labels?.find(label => label.classId === labelClassId && label.userEmail === email);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline"><Tag size={14} className="mr-2" /> Add label</Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="min-w-[400px]">
        <div className="flex-col items-center space-y-2">
          {mode === 'list' && (
            <>
              <div className="flex justify-between">
                <h2 className="text-lg font-medium">Labels</h2>
                <Button variant="outline"
                  onClick={() => {
                    setMode('add');
                  }}
                >
                  <Plus size={14} className="mr-1" />
                  New label
                </Button>
              </div>
              <div className="flex-col space-y-1">
                <Table>
                  <TableBody className="text-base">
                    {labelClasses?.map(labelClass =>
                      <TableRow key={labelClass.name}>
                        <TableCell className="p-0 py-2">
                          <div className={cn('flex justify-start text-secondary-foreground/30', findLabel(labelClass.id) ? 'text-white' : '')}>
                            <p className="border rounded-md p-0.5 px-2 text-ellipsis overflow-hidden truncate max-w-[200px]">
                              {labelClass.name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {labelClass.labelType === LabelType.BOOLEAN &&
                            <LabelBooleanInput
                              value={indexToValue(findLabel(labelClass.id)?.value as number, labelClass) || undefined}
                              onChange={value => {
                                addLabel(value, labelClass);
                              }} />
                          }
                          {labelClass.labelType === LabelType.CATEGORICAL &&
                            <LabelCategoricalInput
                              value={indexToValue(findLabel(labelClass.id)?.value as number, labelClass) || undefined}
                              values={labelClass.valueMap}
                              onChange={(value) => {
                                addLabel(value, labelClass);
                              }}
                            />
                          }
                        </TableCell>
                        <TableCell>
                          <div className="w-4">
                            {labels?.some(label => label.classId === labelClass.id) &&
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  removeLabel(findLabel(labelClass.id)?.id as string);
                                }}>
                                <X size={14} />
                              </Button>
                            }
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          {mode === 'add' && (
            <AddLabel spanId={spanId} onClose={() => {
              setMode('list');
              mutateLabels();
              mutateLabelClasses();
            }} />
          )}
        </div>
      </PopoverContent>
    </Popover >
  );
}


function LabelBooleanInput({ value, onChange }: { value: string | undefined, onChange: (value: string) => void }) {
  return (
    <div className="flex justify-start cursor-pointer text-secondary-foreground/50 h-8">
      <div className="flex rounded border overflow-clip">
        <div className={cn('px-1.5 border-r-2 flex items-center justify-center', value === 'false' ? 'bg-secondary text-white' : '')} onClick={() => {
          onChange('false');
        }}>
          <span className="">False</span>
        </div>
        <div className={cn('px-1.5 flex items-center justify-center', value === 'true' ? 'bg-secondary text-white' : '')} onClick={() => {
          onChange('true');
        }}>
          <span className="">True</span>
        </div>
      </div>
    </div>
  );
}

function LabelCategoricalInput({ value, values, onChange }: { value: string | undefined, values: string[], onChange: (value: string) => void }) {
  return (
    <div className={cn('text-secondary-foreground/50', value ? 'text-white' : '')}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {values.map(value => (
            <SelectItem key={value} value={value}>{value}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
