import { Label } from '@/components/ui/label';
import { SemanticSimilarityNode } from '@/lib/flow/types';

const SemanticSimilarityNodeComponent = ({ data }: { data: SemanticSimilarityNode }) => {
  <div className='flex flex-col space-y-2 p-4'>
    <Label className='mt-2'>Compares two strings and produces semantic similarity score (0.0-1.0) between them</Label>
  </div>
}