'use client'

import { PipelineVersion } from '@/lib/pipeline/types';
import React, { createContext, use } from 'react';

type FlowContextType = {
  editable: boolean;
};

export const ProjectContext = createContext<FlowContextType>({
  editable: false,
});

interface FlowContextProviderProps {
  editable: boolean;
  children: React.ReactNode;
}

export const FlowContextProvider = ({ editable, children }: FlowContextProviderProps) => {
  return (
    <ProjectContext.Provider value={{ editable }}>
      {children}
    </ProjectContext.Provider>
  );
};

export function useFlowContext() {
  return use(ProjectContext);
}