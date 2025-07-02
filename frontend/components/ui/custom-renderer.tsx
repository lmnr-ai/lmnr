import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { DialogTrigger } from "@radix-ui/react-dialog";
import CodeMirror from "@uiw/react-codemirror";
import { PencilIcon, Plus, TrashIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { theme } from "@/components/ui/code-highlighter/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { swrFetcher } from "@/lib/utils";

import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Input } from "./input";
import { Label } from "./label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

interface Template {
  id: string;
  name: string;
  code: string;
}

interface TemplateInfo {
  id: string;
  name: string;
}

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (template: Template) => void;
  defaultTemplate: Template | null;
  defaultJsonData: string;
  projectId: string;
}

const TemplateDialog = ({
  open,
  onOpenChange,
  children,
  onSave,
  defaultTemplate,
  defaultJsonData,
  projectId,
}: PropsWithChildren<TemplateDialogProps>) => {
  const iFrameRef = useRef<HTMLIFrameElement>(null);
  const [isIframeReady, setIsIframeReady] = useState(false);

  const [templateName, setTemplateName] = useState(defaultTemplate?.name ?? "");
  const [htmlContent, setHtmlContent] = useState(defaultTemplate?.code ?? DEFAULT_HTML_TEMPLATE);
  const [jsonData, setJsonData] = useState(defaultJsonData);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (defaultTemplate) {
      setTemplateName(defaultTemplate.name);
      setHtmlContent(defaultTemplate.code);
    }
  }, [defaultTemplate]);

  useEffect(() => {
    if (iFrameRef.current) {
      // Add a 100ms delay before sending the postMessage
      const timer = setTimeout(() => {
        iFrameRef.current?.contentWindow?.postMessage(jsonData, "*");
      }, 100); // Delay in milliseconds

      return () => clearTimeout(timer);
    }
  }, [jsonData, iFrameRef, htmlContent, isIframeReady]);

  // Add a check for when the dialog opens
  useEffect(() => {
    if (open) {
      // Give the dialog a moment to mount
      const timer = setTimeout(() => {
        if (iFrameRef.current) {
          setIsIframeReady(true);
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        setIsIframeReady(false);
      };
    }
  }, [open]);

  useEffect(() => {
    if (!isIframeReady || !iFrameRef.current) return;
    const iframe = iFrameRef.current;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    iframe.src = blobUrl;

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [htmlContent, isIframeReady]);

  const handleSaveTemplate = async () => {
    if (!templateName) return;

    try {
      setIsSaving(true);
      const url = defaultTemplate
        ? `/api/projects/${projectId}/render-templates/${defaultTemplate?.id}`
        : `/api/projects/${projectId}/render-templates`;

      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ name: templateName, code: htmlContent }),
      });

      const data = await response.json();

      onSave(data);
      setTemplateName("");
      setHtmlContent("");
      setIsSaving(false);
    } catch (error) {
      // TODO: Show error message
      console.error("Failed to save template:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger>{children}</DialogTrigger>
      <DialogContent
        aria-description="New render template"
        aria-describedby="New render template"
        className="max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] flex flex-col p-0 gap-0"
      >
        <DialogHeader className="border-b p-4">
          <DialogTitle>New render template</DialogTitle>
          <DialogDescription>Create a new render template to customize data visualization.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 p-4 flex-1 overflow-hidden">
          <div className="min-h-0">
            <iframe
              key={`iframe-${open}`}
              ref={iFrameRef}
              className="w-full h-full border rounded-md"
              sandbox="allow-scripts"
              title="Custom Visualization"
            />
          </div>
          <div className="min-h-0 flex flex-col">
            <div className="mb-4">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                className="w-full mt-1"
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <Tabs className="flex flex-col flex-1 min-h-0" defaultValue="data">
              <TabsList>
                <TabsTrigger value="data">Data</TabsTrigger>
                <TabsTrigger value="editor">Code</TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="flex-1 min-h-0 pt-2">
                <div className="border rounded-md bg-muted/50 h-full overflow-hidden">
                  <CodeMirror
                    value={htmlContent}
                    onChange={setHtmlContent}
                    extensions={[html()]}
                    theme={theme}
                    height="100%"
                    className="h-full"
                  />
                </div>
              </TabsContent>
              <TabsContent value="data" className="flex-1 min-h-0 pt-2">
                <div className="border rounded-md bg-muted/50 h-full overflow-hidden">
                  <CodeMirror
                    value={jsonData}
                    onChange={setJsonData}
                    extensions={[json()]}
                    theme={theme}
                    height="100%"
                    className="h-full"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <DialogFooter className="border-t p-4">
          <Button onClick={handleSaveTemplate} disabled={!templateName || isSaving}>
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface CustomRendererProps {
  data: string;
  presetKey?: string | null;
}

export default function CustomRenderer({ data, presetKey = null }: CustomRendererProps) {
  const iFrameRef = useRef<HTMLIFrameElement>(null);
  const [htmlContent, setHtmlContent] = useState(DEFAULT_HTML_TEMPLATE);
  const { projectId } = useParams();
  const { data: templates, mutate: mutateTemplates } = useSWR(
    `/api/projects/${projectId}/render-templates`,
    swrFetcher
  );
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [templateDialogMode, setTemplateDialogMode] = useState<"create" | "edit">("create");

  useEffect(() => {
    if (presetKey && templates) {
      // Try to get the stored template ID for this preset
      const storedTemplateId = localStorage.getItem(`template-${presetKey}`);
      if (storedTemplateId) {
        // Find the template in our templates list
        const template = templates.find((t: TemplateInfo) => t.id === storedTemplateId);
        if (template) {
          // Fetch and set the template
          fetch(`/api/projects/${projectId}/render-templates/${storedTemplateId}`)
            .then((response) => response.json())
            .then((data) => setSelectedTemplate(data))
            .catch((error) => console.error("Error fetching template:", error));
        }
      }
    }
  }, [presetKey, templates, projectId]);

  useEffect(() => {
    if (!iFrameRef.current) return;

    const iframe = iFrameRef.current;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    iframe.src = blobUrl;

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [htmlContent]);

  useEffect(() => {
    iFrameRef.current?.contentWindow?.postMessage(data, "*");
  }, [data, iFrameRef, htmlContent]);

  const handleTemplateSelect = (value: string) => {
    const template = templates?.find((t: TemplateInfo) => t.id === value);
    if (template) {
      // Store the template ID if we have a preset key
      if (presetKey) {
        localStorage.setItem(`template-${presetKey}`, value);
      }

      fetch(`/api/projects/${projectId}/render-templates/${value}`)
        .then((response) => response.json())
        .then((data) => setSelectedTemplate(data))
        .catch((error) => console.error("Error fetching template:", error));
    }
  };

  useEffect(() => {
    if (selectedTemplate) {
      setHtmlContent(selectedTemplate.code);
    }
  }, [selectedTemplate]);

  const handleEditTemplate = () => {
    if (selectedTemplate) {
      setTemplateDialogMode("edit");
      setHtmlContent(selectedTemplate.code);
      setIsDialogOpen(true);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      await fetch(`/api/projects/${projectId}/render-templates/${selectedTemplate.id}`, {
        method: "DELETE",
      });

      await mutateTemplates(templates.filter((t: TemplateInfo) => t.id !== selectedTemplate.id));
      setSelectedTemplate(null);
      setHtmlContent(DEFAULT_HTML_TEMPLATE);
    } catch (error) {
      console.error("Failed to delete template:", error);
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  const handleSaveTemplate = async (template: Template) => {
    setTemplateDialogMode("create");
    setSelectedTemplate(template);
    setIsDialogOpen(false);
    await mutateTemplates();
  };

  return (
    <div className="flex flex-col bg-background w-full">
      <div className="flex items-center gap-2 p-2">
        <Select key={selectedTemplate?.id} value={selectedTemplate?.id} onValueChange={handleTemplateSelect}>
          <SelectTrigger className="w-fit">
            <SelectValue placeholder="Select template" />
          </SelectTrigger>
          <SelectContent>
            {templates?.map((template: TemplateInfo) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
            <div className="relative flex w-full cursor-pointer hover:bg-secondary items-center rounded-sm py-1.5 pl-2 pr-8 text-sm">
              <Plus className="w-3 h-3 mr-2" />
              <span onClick={() => setIsDialogOpen(true)} className="text-xs">
                Create new template
              </span>
            </div>
          </SelectContent>
        </Select>
        {selectedTemplate && (
          <>
            <Button variant="outline" onClick={handleEditTemplate} title="Edit template">
              <PencilIcon className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(true)} title="Delete template">
              <TrashIcon className="w-4 h-4" />
            </Button>

            <ConfirmDialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
              title="Delete Template"
              description={`Are you sure you want to delete "${selectedTemplate.name}"? This action cannot be undone.`}
              confirmText="Delete"
              cancelText="Cancel"
              onConfirm={handleDeleteTemplate}
            />
          </>
        )}
      </div>
      <div className="flex-grow flex overflow-hidden rounded-b">
        <iframe
          ref={iFrameRef}
          className="w-full min-h-[400px] h-full border-0"
          sandbox="allow-scripts"
          title="Custom Visualization"
        />
        {/* </Resizable> */}
      </div>

      <TemplateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleSaveTemplate}
        defaultTemplate={templateDialogMode === "edit" ? selectedTemplate : null}
        defaultJsonData={data}
        projectId={projectId as string}
      />
    </div>
  );
}

const DEFAULT_HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { 
        margin: 0;
        padding: 16px;
        box-sizing: border-box;
        font-family: system-ui;
      }
    </style>
  </head>
  <body>
    <div id="user-content">
    </div>
    
    <script>
      // Handle data message
      window.addEventListener('message', (event) => {
        const data = event.data;
        document.getElementById('user-content').innerHTML = JSON.stringify(data);
      });

    </script>
  </body>
</html>
`;
