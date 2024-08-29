
import { NodeHandleType, SemanticSwitchNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { v4 } from 'uuid';
import { X } from 'lucide-react';

export default function SemanticSwitchNodeComponent({ data }: { data: SemanticSwitchNode }) {
  const { updateNodeData, dropEdgeForHandle } = useStore((state) => state);

  const id = data.id;

  return (
    <div className='p-4'>
      <div>
        <Label>Routes</Label>
        <div className='flex flex-col space-y-4'>
          {data.routes?.map((route, index) => (
            <div key={index} className='flex flex-col border rounded p-2 space-y-2 group'>
              <div className='h-6 w-full flex items-center justify-between'>
                <Label>Route name</Label>
                <Button
                  variant='secondary'
                  className='hidden group-hover:block h-6'
                  onClick={() => {
                    updateNodeData(id, {
                      routes: data.routes.filter((_, i) => i !== index),
                      outputs: data.outputs.filter((_, i) => i !== index)
                    } as SemanticSwitchNode)

                    dropEdgeForHandle(data.outputs[index].id)

                  }}>
                  delete route
                </Button>
              </div>
              <Input defaultValue={route.name} onChange={(e) => {
                updateNodeData(id, {
                  routes: data.routes.map((r, i) => i === index ? { ...r, name: e.currentTarget.value } : r),
                  outputs: data.outputs.map((output, i) => i === index ? { ...output, name: e.currentTarget.value } : output)
                } as SemanticSwitchNode)
              }}
              />
              <Label>Examples</Label>
              <Label className='text-gray-500'>You should provide at least 2 examples</Label>
              <div className='flex flex-col space-y-2 justify-start'>
                {
                  route.examples?.map((example, i) => (
                    <div key={i} className='flex items-center'>
                      <Input
                        key={i}
                        value={example}
                        placeholder='Input example'
                        onChange={(e) => {
                          updateNodeData(id, {
                            routes: data.routes.map((r, j) => j === index ? {
                              ...r,
                              examples: r.examples?.map((_, k) => k === i ? e.currentTarget.value : _)
                            } : r)
                          } as SemanticSwitchNode)
                        }}
                      />
                      <button
                        onClick={() => {
                          if (route.examples.length == 2) return

                          updateNodeData(id, {
                            routes: data.routes.map((r, j) => j === index ? {
                              ...r,
                              examples: r.examples?.filter((_, k) => k !== i)
                            } : r)
                          } as SemanticSwitchNode)
                        }}
                      ><X size={16} className='ml-1 text-gray-500' /></button>
                    </div>
                  ))
                }
                <Button
                  variant={'secondary'}
                  onClick={() => {
                    updateNodeData(id, {
                      routes: data.routes.map((r, i) => i === index ? {
                        ...r,
                        examples: [...r.examples ?? [], '']
                      } : r)
                    } as SemanticSwitchNode)
                  }}
                >Add example</Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          className='mt-2'
          variant={'secondary'}
          onClick={() => {
            updateNodeData(id, {
              routes: [...data.routes, {
                name: 'New route',
                examples: ["Example 1", "Example 2"]
              }],
              outputs: [...data.outputs, {
                id: v4(),
                name: 'New route',
                type: NodeHandleType.STRING
              }]
            } as SemanticSwitchNode)
          }}
        >Add route</Button>
      </div>
    </div>
  )
}
