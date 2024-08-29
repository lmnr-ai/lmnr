import { Button } from "../ui/button";
import useStore from "@/lib/flow/store";
import { cn, deleteLocalEnvVar, getLocalEnvVars, setLocalEnvVar } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { InputPassword } from "../ui/input-password";
import { Graph } from "@/lib/flow/graph";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { LockKeyhole } from "lucide-react";
import { ENV_VAR_TO_ISSUER_URL } from "@/lib/env/utils";

interface PipelineEnvProps {
  projectId: string
}

function getDefaultEnvVars(graph: Graph, projectId: string) {
  const requiredEnvVars = graph.requiredEnvVars();
  const localEnvVars = getLocalEnvVars(projectId);
  const defaultEnvVars: { [key: string]: string } = {};
  for (const key of requiredEnvVars) {
    defaultEnvVars[key] = localEnvVars[key] ?? '';
  }
  return defaultEnvVars;
}

export default function PipelineEnv({ projectId }: PipelineEnvProps) {
  const { getRunGraph, isMissingEnvVars } = useStore();

  const graph = getRunGraph();

  // empty string is used to indicate that the variable is not set
  const [envVars, setEnvVars] = useState<{ [key: string]: string }>(getDefaultEnvVars(graph, projectId));
  const [isAlerting, setAlerting] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (Object.values(envVars).some((value) => value.length === 0)) {
      setAlerting(true);
    } else {
      setAlerting(false);
    }
  }, [...Object.keys(envVars), ...Object.values(envVars)])

  useEffect(() => {
    // Note that isMissingEnvVars is set to true only temporarily
    // It will be set to false after short timeout, so that it can
    // be used after user clicks run again
    if (isMissingEnvVars) {
      triggerRef.current?.click();
    }
  }, [isMissingEnvVars])

  return (
    <Popover modal={false} onOpenChange={(open) => {
      if (open) {
        setEnvVars(getDefaultEnvVars(graph, projectId));
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-7"
          ref={triggerRef}
        >
          <LockKeyhole className="h-4" />
          Env
        </Button>
      </PopoverTrigger>
      <PopoverContent side='bottom' className="max-h-96 overflow-y-auto ml-48 mt-4 w-96">
        <div className="flex flex-col items-start p-1">
          <h1 className={"text-lg"}>Environment variables</h1>
          <p className={cn("text-sm text-muted-foreground mt-2 whitespace-normal", (isAlerting ? "text-red-400" : ""))}>
            Set environment variables.
          </p>
          <p className="text-sm text-muted-foreground mt-2 mb-2 whitespace-normal">
            They are only saved in your browser.
          </p>
          {
            Object.entries(envVars).map(([key, value]) => (
              <div key={key} className="mt-4 w-full">
                <h3>{key}</h3>
                <InputPassword
                  inputKey={`input-${key}`}
                  value={value}
                  className="text-md mt-2"
                  placeholder="Enter env variable"
                  onChange={(e) => {
                    setEnvVars((prev) => {
                      // if empty string, then sets empty string here, but deletes from localStorage
                      let newEnvVars = { ...prev, [key]: e.target.value };
                      if (e.target.value.length === 0) {
                        deleteLocalEnvVar(projectId, key);
                      } else {
                        setLocalEnvVar(projectId, key, e.target.value);
                      }
                      return newEnvVars;
                    });
                  }}
                />
                {
                  ENV_VAR_TO_ISSUER_URL[key] && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      <span>Visit </span>
                      <a target='_blank' href={ENV_VAR_TO_ISSUER_URL[key]} className="text-blue-500">here</a>
                      <span> to get the key</span>
                    </div>
                  )
                }
              </div>
            ))
          }
        </div>
      </PopoverContent>
    </Popover>
  )
}
