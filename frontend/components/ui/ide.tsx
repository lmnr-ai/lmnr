import ReactAce, { IAceEditorProps } from "react-ace";

import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/ext-beautify";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/theme-one_dark";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-handlebars";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-markdown";

interface IdeProps extends IAceEditorProps {
}

export default function Ide({ ...props }: IdeProps) {

  return (
    <div className="w-full h-full py-2 bg-secondary">
      <ReactAce
        setOptions={{
          useWorker: false,
          indentedSoftWrap: false,
        }}
        wrapEnabled={true}
        theme="one_dark"
        showPrintMargin={false}
        enableLiveAutocompletion={false}
        enableSnippets={false}
        enableBasicAutocompletion={true}
        tabSize={2}
        style={{
          height: '100%',
          width: '100%',
          backgroundColor: 'transparent'
        }}
        {...props}
      />
    </div>
  )
}