import ReactAce from "react-ace";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/ext-beautify";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-handlebars";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-markdown";
import "ace-builds/src-noconflict/theme-one_dark";
import "ace-builds/src-noconflict/ext-searchbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useState } from "react";
import YAML from 'yaml'

interface OutputFormatterProps {
  value: string;
  defaultMode?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}

export default function Formatter({ value, defaultMode = "text", editable, onChange }: OutputFormatterProps) {

  const [mode, setMode] = useState(defaultMode)

  const renderText = (value: string) => {

    // if mode is YAML try to parse it as YAML
    if (mode === "yaml") {
      try {
        const yamlFormatted = YAML.stringify(JSON.parse(value))
        return yamlFormatted
      } catch (e) {
        return value
      }
    } else if (mode === "json") {
      try {
        const jsonFormatted = JSON.stringify(JSON.parse(value), null, 2)
        return jsonFormatted
      } catch (e) {
        return value
      }
    }
    return value
  }

  return (
    <div className="w-full h-full border rounded bg-secondary pb-2">
      <div className="flex">
        <div className="flex justify-start p-2">
          <Select
            defaultValue={mode}
            onValueChange={(value) => setMode(value)}
          >
            <SelectTrigger className="font-medium text-xs border-gray-600 h-6">
              <SelectValue placeholder="Select tag type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key="TEXT" value="text">
                TEXT
              </SelectItem>
              <SelectItem key="YAML" value="yaml">
                YAML
              </SelectItem>
              <SelectItem key="JSON" value="json">
                JSON
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <ReactAce
        maxLines={Infinity}
        setOptions={{
          useWorker: false,
          displayIndentGuides: false,
          indentedSoftWrap: false,
        }}
        defaultValue={editable ? renderText(value) : undefined}
        value={editable ? undefined : renderText(value)}
        readOnly={!editable}
        mode={mode}
        wrapEnabled={true}
        theme="one_dark"
        showPrintMargin={false}
        enableLiveAutocompletion={false}
        enableSnippets={false}
        enableBasicAutocompletion={false}
        tabSize={2}
        style={{
          height: '100%',
          width: '100%',
          fontSize: '0.8rem',
          backgroundColor: 'transparent',
        }}
        onChange={v => {
          if (mode === "yaml") {
            try {
              const parsedYaml = YAML.parse(v);
              onChange?.(JSON.stringify(parsedYaml, null, 2));
            } catch (e) {
              onChange?.(v);
            }
          } else {
            onChange?.(v)
          }
        }}
      // {...props}
      />
    </div>
  )
}