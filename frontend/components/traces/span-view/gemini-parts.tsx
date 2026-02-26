import React, { memo } from "react";
import { type z } from "zod/v4";

import {
    type GeminiContentSchema,
    type GeminiPartSchema,
} from "@/lib/spans/types/gemini";

import { toStandardBase64 } from "@/lib/utils";

import {
    FileContentPart,
    ImageContentPart,
    TextContentPart,
    ToolCallContentPart,
    ToolResultContentPart,
} from "./common";

const GeminiPartRenderer = ({
    part,
    presetKey,
    messageIndex,
    contentPartIndex,
}: {
    part: z.infer<typeof GeminiPartSchema>;
    presetKey: string;
    messageIndex: number;
    contentPartIndex: number;
}) => {
    // Gemini parts use field-presence discrimination (no "type" key).
    // Unrecognised variants fall through to null.
    if ("text" in part) {
        return (
            <TextContentPart
                content={part.text}
                presetKey={presetKey}
                messageIndex={messageIndex}
                contentPartIndex={contentPartIndex}
            />
        );
    }

    if ("inlineData" in part) {
        const src = `data:${part.inlineData.mimeType};base64,${toStandardBase64(part.inlineData.data)}`;
        if (part.inlineData.mimeType.startsWith("image/")) {
            return <ImageContentPart src={src} />;
        }
        return <FileContentPart data={src} />;
    }

    if ("fileData" in part) {
        return <FileContentPart data={part.fileData.fileUri} />;
    }

    if ("functionCall" in part) {
        return (
            <ToolCallContentPart
                toolName={part.functionCall.name}
                content={part.functionCall.args ?? {}}
                presetKey={presetKey}
                messageIndex={messageIndex}
                contentPartIndex={contentPartIndex}
            />
        );
    }

    if ("functionResponse" in part) {
        return (
            <ToolResultContentPart
                toolCallId={part.functionResponse.name}
                content={part.functionResponse.response}
                presetKey={`${messageIndex}-tool-result-${contentPartIndex}-${presetKey}`}
            />
        );
    }

    if ("executableCode" in part) {
        return (
            <TextContentPart
                content={part.executableCode.code}
                presetKey={presetKey}
                messageIndex={messageIndex}
                contentPartIndex={contentPartIndex}
            />
        );
    }

    if ("codeExecutionResult" in part) {
        return (
            <TextContentPart
                content={part.codeExecutionResult.output ?? ""}
                presetKey={presetKey}
                messageIndex={messageIndex}
                contentPartIndex={contentPartIndex}
            />
        );
    }

    return null;
};

const PureGeminiContentParts = ({
    message,
    parentIndex,
    presetKey,
}: {
    message: z.infer<typeof GeminiContentSchema>;
    parentIndex: number;
    presetKey: string;
}) => (
    <>
        {message.parts.map((part, index) => (
            <GeminiPartRenderer
                key={`${parentIndex}-part-${index}-${presetKey}`}
                part={part}
                presetKey={`${parentIndex}-part-${index}-${presetKey}`}
                messageIndex={parentIndex}
                contentPartIndex={index}
            />
        ))}
    </>
);

const GeminiContentParts = memo(PureGeminiContentParts);
export default GeminiContentParts;
