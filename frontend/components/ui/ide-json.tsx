import ReactAce from "react-ace";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-tomorrow";


interface IdeJsonProps {
  value?: string
  onChange?: (value: string) => void
}

export default function IdeJson({ value, onChange }: IdeJsonProps) {

  return (
    <div>
      <ReactAce
        setOptions={{ useWorker: false }}
        className="w-full nodrag rounded border nowheel"
        mode="json"
        wrapEnabled={true}
        value={value}
        onChange={onChange}
        theme="tomorrow"
        enableLiveAutocompletion={false}
        enableSnippets={false}
        enableBasicAutocompletion={false}
        tabSize={2}
        style={{ width: '100%', height: '200px' }}
      />
    </div>
  )

}