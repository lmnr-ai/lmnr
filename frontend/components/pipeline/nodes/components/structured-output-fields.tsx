import Ide from "@/components/ui/ide"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import useStore from "@/lib/flow/store"
import { LLMNode } from "@/lib/flow/types"
import Link from "next/link"
import { useEffect, useState } from "react"

interface StructuredOutputFieldsProps {
  className?: string
  data: LLMNode,
  editable?: boolean
}

const DEFAULT_SCHEMA =
  `class User {
  id int
  name string
  contact_info ContactInfo
  contact_preference ContactPreference
  notes string?
}

class ContactInfo {
  telephone string
  email_addresses string[]
}

enum ContactPreference {
  EMAIL
  TELEPHONE
}
`;
const extractTargets = (schema: string): string[] => {
  const targets = schema.match(/(class|enum)\s+(\w+)/g);
  return (targets?.map(target => target.replace('class', '').replace('enum', '').trim()) ?? []).filter((v) => v.length > 0);
}

const DEFAULT_TARGET = "User";
const DEFAULT_SCHEMA_TARGETS = extractTargets(DEFAULT_SCHEMA);

export default function StructuredOutputFields({ className, editable = true, data }: StructuredOutputFieldsProps) {
  const { updateNodeData } = useStore();
  const [schemaClasses, setSchemaClasses] = useState<string[]>(DEFAULT_SCHEMA_TARGETS);
  // temporarily store the selected class so we can reset it if it dissapears from the schema
  const [selectedTargetClass, setSelectedTargetClass] = useState<string>(DEFAULT_TARGET);

  useEffect(() => {
    setSchemaClasses(extractTargets(data.structuredOutputSchema ?? DEFAULT_SCHEMA));
    setSelectedTargetClass(data.structuredOutputSchemaTarget ?? DEFAULT_TARGET);
  }, [data]);

  return (
    <div className={className}>
      <div className='flex items-center w-full justify-between'>
        <Label>Structured output</Label>
        <Switch
          disabled={!editable}
          checked={!!data.structuredOutputEnabled}
          onCheckedChange={(checked) => {
            updateNodeData(data.id, {
              structuredOutputEnabled: checked,
              structuredOutputMaxRetries: 3,
              structuredOutputSchema: DEFAULT_SCHEMA,
              structuredOutputSchemaTarget: DEFAULT_TARGET,
            } as LLMNode)
          }}
        />
      </div>
      {(!!data.structuredOutputEnabled) && (
        <div className="flex flex-col space-y-2 border rounded p-2 mt-2">
          <Label>Max retries</Label>
          <Input
            disabled={!editable}
            type='number'
            placeholder='Enter the number of max retries'
            value={data.structuredOutputMaxRetries}
            min={0}
            onChange={(e) => {
              updateNodeData(data.id, {
                structuredOutputMaxRetries: parseInt(e.target.value)
              } as LLMNode)
            }}
          />
          <Label>Schema</Label>
          <Label className='text-gray-500'>Schema for the enforced JSON output</Label>
          <Ide
            readOnly={!editable}
            maxLines={Infinity}
            defaultValue={data.structuredOutputSchema ?? DEFAULT_SCHEMA}
            value={data.structuredOutputSchema ?? ""}
            mode={'jinja2'}
            onChange={(value) => {
              const classes = extractTargets(value);

              if (!classes.includes(selectedTargetClass)) {
                updateNodeData(data.id, {
                  structuredOutputSchemaTarget: null
                } as LLMNode)
              };
              setSchemaClasses(classes);
              try {
                updateNodeData(data.id, {
                  structuredOutputSchema: (value.length > 0) ? value : null
                } as LLMNode)
              } catch (e) {
              }
            }}
          />
          <Label className="text-gray-500">Read more about BAML syntax at&nbsp;
            <Link href="https://docs.boundaryml.com/docs/snippets/class" className="text-primary" target="blank">https://docs.boundaryml.com/docs/snippets/class</Link>
          </Label>
          <Label>Target for schema</Label>
          <Select
            disabled={!editable}
            value={data.structuredOutputSchemaTarget ?? DEFAULT_TARGET}
            onValueChange={(value) => {
              setSelectedTargetClass(value);
              updateNodeData(data.id, {
                structuredOutputSchemaTarget: (value.length > 0) ? value : null
              } as LLMNode)
            }}
          >
            <SelectTrigger className="h-7 font-medium bg-secondary">
              <SelectValue placeholder="target" />
            </SelectTrigger>
            <SelectContent>
              {schemaClasses.map((className) => (
                <SelectItem key={className} value={className ?? "f"}>{className}</SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
      )}
    </div>
  )
}
