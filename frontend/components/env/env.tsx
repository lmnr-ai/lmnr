'use client'

import { Label } from "@/components/ui/label";
import { useContext, useEffect, useState } from "react";
import { ProjectContext, useProjectContext } from '@/contexts/project-context'
import { getLocalEnvVars } from "@/lib/utils";
import AddEnvVarDialog from "./add-env-var-dialog";
import { Trash } from "lucide-react";
import Header from "../ui/header";

export default function Env() {
  const { projectId } = useProjectContext();
  const [envVars, setEnvVars] = useState<Record<string, string>>(getLocalEnvVars(projectId));

  useEffect(() => {
    localStorage.setItem(`env-${projectId}`, JSON.stringify(envVars));
  }, [envVars])

  return (
    <>
      <Header path="env" />
      <div className="flex flex-col items-start space-y-4 p-4">
        <h1 className="text-lg">Environment variables</h1>
        <Label className="">
          Set your environment variables to use in pipelines.
          Laminar never stores your environment variables, they are only saved in your browser.
        </Label>
        <AddEnvVarDialog onAdd={(name, value) => {
          setEnvVars({ ...envVars, [name]: value })
        }} />
        <table className="w-2/3 table-fixed border-t">
          <tbody>
            {
              Object.entries(envVars).map(([k, v], index) => (
                <tr key={index} className="border-b h-14">

                  <td className="">{k}</td>
                  <td className="ml-4 ">{(v.length < 10) ? v : (`${v.substring(0, 5)} ... ${v.slice(-4)}`)}</td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        className="mr-4 text-gray-400"
                        onClick={() => {
                          const newEnvVars = Object.fromEntries(Object.entries({ ...envVars }).filter(([key, _]) => key !== k))
                          setEnvVars({ ...newEnvVars })
                        }}
                      >
                        <Trash className='w-4' />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </>
  )
}
