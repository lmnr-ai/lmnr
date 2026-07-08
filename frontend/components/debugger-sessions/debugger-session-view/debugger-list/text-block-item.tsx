import NoteContent from "../note-content";
import { textAnchorId } from "../session-outline/utils";

// A standalone note block in the timeline.
export default function TextBlockItem({ id, text }: { id: string; text: string }) {
  return (
    <div id={textAnchorId(id)} className="scroll-mt-4 px-1 py-5">
      <NoteContent content={text} />
    </div>
  );
}
