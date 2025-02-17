import { useFieldArray, useFormContext } from "react-hook-form";

import Message from "@/components/playground/messages/message";
import { PlaygroundForm } from "@/components/playground/playground";

const Messages = () => {
  const { control } = useFormContext<PlaygroundForm>();
  const { fields, remove, insert } = useFieldArray({
    control,
    name: "messages",
  });

  return (
    <div className="flex flex-col gap-2 p-2 border-[1px] rounded-sm">
      {fields.map((message, index) => (
        <Message key={message.id} index={index} insert={insert} remove={remove} />
      ))}
    </div>
  );
};

export default Messages;
