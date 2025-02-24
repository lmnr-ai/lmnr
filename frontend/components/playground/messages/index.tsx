import { Plus } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import Message from "@/components/playground/messages/message";
import { Button } from "@/components/ui/button";
import { PlaygroundForm } from "@/lib/playground/types";

const defaultMessage: PlaygroundForm["messages"]["0"] = {
  role: "user",
  content: [
    {
      type: "text",
      text: "",
    },
  ],
};

const Messages = () => {
  const { control } = useFormContext<PlaygroundForm>();
  const { fields, remove, insert, update, append } = useFieldArray({
    control,
    name: "messages",
  });

  return (
    <div className="flex flex-col gap-2">
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
      <Button onClick={() => append(defaultMessage)} variant="outline" className="self-start">
        <Plus className="mr-2" size={12} />
        Add message
      </Button>
    </div>
  );
};

export default Messages;
