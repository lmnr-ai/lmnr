
import { NodeHandleType, RouterNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { v4 } from 'uuid';
import { Switch } from '@/components/ui/switch';


export default function SwitchNodeComponent({ data }: { data: RouterNode }) {
  const { updateNodeData, dropEdgeForHandle } = useStore((state) => state);

  const id = data.id;

  return (
    <div className='p-4 flex flex-col space-y-2'>
      <div className='flex flex-col space-y-2'>
        <Label>Routes</Label>
        <div className='flex flex-col space-y-2'>
          {data.routes?.map((route, index) => (
            <div key={index} className='flex flex-col border rounded p-2 space-y-2 group'>
              <div className='h-6 w-full flex items-center justify-between'>
                {(data.hasDefaultRoute && index == data.routes.length - 1)
                  ? <Label>Default route name</Label>
                  : <>
                    <Label>Route name</Label>
                    <Button
                      variant='secondary'
                      className='hidden group-hover:block h-6'
                      onClick={() => {
                        updateNodeData(id, {
                          routes: data.routes.filter((_, i) => i !== index),
                          outputs: data.outputs.filter((_, i) => i !== index)
                        } as RouterNode)

                        dropEdgeForHandle(data.outputs[index].id)

                      }}>
                      delete
                    </Button>
                  </>}
              </div>
              <Input
                placeholder='Route name'
                defaultValue={route.name}
                onChange={(e) => {
                  updateNodeData(id, {
                    routes: data.routes.map((r, i) => i === index ? { ...r, name: e.currentTarget.value } : r),
                    outputs: data.outputs.map((output, i) => i === index ? { ...output, name: e.currentTarget.value } : output)
                  } as RouterNode)
                }}
              />
            </div>
          ))}
        </div>
        <Button
          className='mt-2 h-6 w-24'
          variant={'secondary'}
          onClick={() => {
            let newRoutes = [...data.routes];
            let newOutputs = [...data.outputs];
            if (data.hasDefaultRoute) {
              newRoutes.splice(newRoutes.length - 1, 0, { name: '' });
              newOutputs.splice(newOutputs.length - 1, 0, {
                id: v4(),
                name: 'Route',
                type: NodeHandleType.ANY
              });
            } else {
              newRoutes.push({ name: '' });
              newOutputs.push({
                id: v4(),
                name: 'Route',
                type: NodeHandleType.ANY
              });
            }
            updateNodeData(id, {
              routes: newRoutes,
              outputs: newOutputs
            } as RouterNode)

          }}
        >Add route
        </Button>
      </div>
      <div className='flex items-center w-full justify-between mt-2'>
        <Label className='mr-2'>Enable default route</Label>
        <Switch
          checked={data.hasDefaultRoute}
          onCheckedChange={(checked) => {
            if (checked) {
              updateNodeData(id, {
                hasDefaultRoute: true,
                outputs: [
                  ...data.outputs,
                  {
                    id: v4(),
                    name: 'default',
                    type: NodeHandleType.ANY
                  }
                ],
                routes: [
                  ...data.routes,
                  {
                    name: 'default'
                  }
                ]
              } as RouterNode)
            } else {
              dropEdgeForHandle(data.outputs[data.outputs.length - 1].id)
              updateNodeData(id, {
                hasDefaultRoute: false,
                outputs: data.outputs.slice(0, data.outputs.length - 1),
                routes: data.routes.slice(0, data.routes.length - 1)
              } as RouterNode)

            }
          }}
        />
      </div>
    </div>
  )
}
