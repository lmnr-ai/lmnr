import { memo } from 'react'
import GenericNodeComponent from './generic-node'
import { DetectorType, ZenguardNode } from '@/lib/flow/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import useStore from '@/lib/flow/store';
import { Button } from '@/components/ui/button'
import { IconZenguard } from '@/components/ui/icons'

const DETECTOR_TYPE_TO_DISPLAY_NAME_MAP: Record<DetectorType, string> = { "prompt_injection": "Prompt Injection", "pii": "PII (Personally Identifiable Info)", "topics/allowed": "Allowed Topics", "topics/banned": "Banned Topics", "keywords": "Keywords", "secrets": "Secrets" };

const ZenguardNodeComponent = ({
  id,
  data,
}: {
  id: string;
  data: ZenguardNode;
}) => {
  const { updateNodeData } = useStore();

  return (
    <>
      <GenericNodeComponent id={id} data={data} className='w-64'>
        <div className="flex flex-col">
          <Label className="mt-6 mb-1">Select detectors</Label>
          {data.detectors.map((detector, i) => (
            <div className="flex mt-2" key={i}>
              <Checkbox
                key={detector.type}
                checked={detector.enabled}
                onCheckedChange={(checked) => {
                  updateNodeData(id, {
                    detectors: data.detectors.map((d) => d.type === detector.type ? { ...d, enabled: checked } : d)
                  } as ZenguardNode)
                }}
              />
              <Label className="ml-1">{DETECTOR_TYPE_TO_DISPLAY_NAME_MAP[detector.type]}</Label>
            </div>
          ))}
          <Label className="mt-6 mb-2">Configure detectors</Label>
          <a target="_blank" href="https://console.zenguard.ai/policy">
            <Button className="flex items-center mr-6">
              <span>Go to Zenguard Console</span>
              <IconZenguard className="ml-2" />
            </Button>
          </a>
        </div>
      </GenericNodeComponent >
    </>
  );
};

export default memo(ZenguardNodeComponent);
