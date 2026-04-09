"use client";

import { useParams } from "next/navigation";
import React from "react";

import ChartBuilder from "@/components/home/editor/Builder";
import { HomeEditorStoreProvider } from "@/components/home/editor/home-editor-store";
import { type HomeChart } from "@/components/home/types";
import Header from "@/components/ui/header";

const HomeEditor = ({ chart }: { chart?: HomeChart }) => {
  const { id, projectId } = useParams();

  return (
    <HomeEditorStoreProvider chart={chart}>
      <Header path={[{ name: "Home", href: `/project/${projectId}/home` }, { name: String(chart?.name ?? id) }]} />
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <ChartBuilder />
      </div>
    </HomeEditorStoreProvider>
  );
};

export default HomeEditor;
