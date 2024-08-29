import { TemplateInfo } from "@/lib/pipeline/types";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { cn } from "@/lib/utils";

interface TemplateSelectProps {
  className?: string
  templateId: string;
  setTemplateId: (id: string) => void;
  templates: TemplateInfo[];
}

export default function TemplateSelect({
  className,
  templateId,
  setTemplateId,
  templates,
}: TemplateSelectProps) {
  const buildTemplates = templates.filter(t => t.displayGroup === 'build');
  const evalTemplates = templates.filter(t => t.displayGroup === 'eval');
  return (
    <div className={cn("flex flex-col space-y-4", className ?? '')}>
      <Label>Build</Label>
      <div className='grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-2'>
        {buildTemplates.map((t) => (
          <Card
            className={cn("hover:bg-secondary p-1", t.id === templateId ? "bg-secondary" : "")}
            key={t.id}
            onClick={() => setTemplateId(t.id)}
          >
            <div className="p-4 space-y-1 cursor-pointer">
              <h4 className="cursor-pointer font-semibold truncate max-w-50"> {t.name} </h4>
              <p className="text-gray-600 text-[12px]">{t.description}</p>
            </div>

          </Card>
        ))}
      </div>

      <Label>Evaluate</Label>
      <div className='grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-2'>
        {evalTemplates.map((t) => (
          <Card
            className={cn("hover:bg-secondary p-1", t.id === templateId ? "bg-secondary" : "")}
            key={t.id}
            onClick={() => setTemplateId(t.id)}
          >
            <div className="p-4 space-y-1 cursor-pointer">
              <h4 className="cursor-pointer font-semibold truncate max-w-50"> {t.name} </h4>
              <p className="text-gray-600 text-[12px]">{t.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}