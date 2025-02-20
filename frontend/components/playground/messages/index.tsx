import { useFieldArray, useFormContext } from "react-hook-form";

import Message from "@/components/playground/messages/message";
import { PlaygroundForm } from "@/lib/playground/types";

const Messages = () => {
  const { control } = useFormContext<PlaygroundForm>();
  const { fields, remove, insert, replace, update } = useFieldArray({
    control,
    name: "messages",
  });

  return (
    <div className="flex flex-col gap-2 p-2 border-[1px] rounded-md">
      {fields.map((message, index) => (
        <Message
          update={update}
          deletable={fields.length > 1}
          key={message.id}
          index={index}
          insert={insert}
          remove={remove}
        />
      ))}
    </div>
  );
};

export default Messages;
