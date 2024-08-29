import { useProjectContext } from '@/contexts/project-context';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { uploadFile } from '@/lib/dataset/utils';
import { useToast } from '@/lib/hooks/use-toast';
import { Loader } from 'lucide-react';

interface DatasetUploadProps {
  datasetId: string;
  onSuccessfulUpload?: () => void;
}

export default function DatasetUpload({
  datasetId,
  onSuccessfulUpload,
}: DatasetUploadProps) {
  const { projectId } = useProjectContext();
  const hiddenInput = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  return (
    <>
      <div className="flex flex-col">
        <Label className="mt-2 text-secondary-foreground">Datapoints file formats: .jsonl, .json, .csv.</Label>
        <Button variant={'secondary'} className="mt-4 w-32" onClick={() => hiddenInput.current?.click()}>
          {isLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
          Select file
        </Button>
        <input
          className="hidden"
          type="file"
          name="file"
          accept="*"
          ref={hiddenInput}
          onChange={e => {
            setIsLoading(true);
            const file = e.target.files![0];
            uploadFile(
              file, `/api/projects/${projectId}/datasets/${datasetId}/file-upload`, false
            ).then(_ => {
              onSuccessfulUpload?.()
            }).catch(error => {
              toast({ title: 'Error', description: 'Error uploading file' + error })
            }).finally(() => {
              setIsLoading(false);
            });
          }}
        />
      </div>
    </>
  );
}
