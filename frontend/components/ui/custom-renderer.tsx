import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Resizable } from "re-resizable";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import CodeEditor from "@/components/ui/code-editor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectContext } from "@/contexts/project-context";
import { swrFetcher } from "@/lib/utils";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Input } from "./input";
import { Label } from "./label";
import { ScrollArea } from "./scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

interface RendererProps {
  data: string,
  permissions?: string,
}

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
  sandbox: string;
  projectId: string;
}

function TemplateDialog({
  open,
  onOpenChange,
  onSave,
  defaultTemplate,
  defaultJsonData,
  sandbox,
  projectId,
}: TemplateDialogProps) {
  const iFrameRef = useRef<HTMLIFrameElement>(null);
  const [isIframeReady, setIsIframeReady] = useState(false);

  const [tab, setTab] = useState<'data' | 'editor'>('editor');
  const [templateName, setTemplateName] = useState(defaultTemplate?.name ?? '');
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
        iFrameRef.current?.contentWindow?.postMessage(jsonData, '*');
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
    const blob = new Blob([htmlContent], { type: 'text/html' });
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
        method: 'POST',
        body: JSON.stringify({ name: templateName, code: htmlContent })
      });


      const data = await response.json();

      onSave(data);
      setTemplateName('');
      setHtmlContent('');
      setIsSaving(false);
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-description="New render template"
        aria-describedby="New render template"
        className="max-w-[90vw] w-[90vw] h-[90vh] flex flex-col p-0 gap-0"
      >
        <DialogHeader className="flex-none border-b p-4">
          <DialogTitle>New render template</DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 h-full p-4">
          <div className="w-1/2 h-full flex-none">
            <iframe
              key={`iframe-${open}`}
              ref={iFrameRef}
              className="w-full h-full border-0"
              sandbox={sandbox}
              title="Custom Visualization"
            />
          </div>
          <div className="w-1/2 h-full flex flex-col">
            <div className="flex gap-4 flex-none w-full">
              <div className="flex gap-2 flex-col w-full">
                <Label>Name</Label>
                <Input
                  className="w-full"
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>
            </div>
            <Tabs
              defaultValue="data"
              className="w-full h-full flex flex-col"
              value={tab}
              onValueChange={value => {
                setTab(value as 'data' | 'editor');
              }}
            >
              <TabsList>
                <TabsTrigger value="data">Data</TabsTrigger>
                <TabsTrigger value="editor">Code</TabsTrigger>
              </TabsList>
              <div className="flex-grow">
                <TabsContent
                  value="editor"
                  forceMount={true}
                  hidden={tab !== 'editor'}
                  className="w-full h-full"
                >
                  <ScrollArea className="h-full">
                    <div className="max-h-0">
                      <div className="flex flex-col">
                        <CodeEditor
                          value={htmlContent}
                          onChange={setHtmlContent}
                          language="html"
                          className="h-full"
                        />
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent
                  value="data"
                  forceMount={true}
                  hidden={tab !== 'data'}
                  className="w-full h-full"
                >
                  <ScrollArea className="h-full">
                    <div className='max-h-0'>
                      <div className="flex flex-col">
                        <CodeEditor
                          value={jsonData}
                          onChange={setJsonData}
                          language="html"
                          lineWrapping={false}
                        />
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
        <DialogFooter className="flex-none border-t p-4">
          <Button
            onClick={handleSaveTemplate}
            disabled={!templateName || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomRenderer({ data, permissions }: RendererProps) {
  const iFrameRef = useRef<HTMLIFrameElement>(null);
  const [htmlContent, setHtmlContent] = useState(DEFAULT_HTML_TEMPLATE);
  const sandbox = permissions ?? 'allow-scripts';
  const { projectId } = useProjectContext();
  const { data: templates, mutate: mutateTemplates } = useSWR(`/api/projects/${projectId}/render-templates`, swrFetcher);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [templateDialogMode, setTemplateDialogMode] = useState<'create' | 'edit'>('create');

  // Then, handle the content updates
  useEffect(() => {
    if (!iFrameRef.current) return;

    const iframe = iFrameRef.current;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    iframe.src = blobUrl;

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [htmlContent]);

  useEffect(() => {
    iFrameRef.current?.contentWindow?.postMessage(data, '*');
  }, [data, iFrameRef, htmlContent]);

  const handleTemplateSelect = (value: string) => {
    if (value === 'create-new') {
      setIsDialogOpen(true);
      return;
    }

    const template = templates?.find((t: TemplateInfo) => t.id === value);
    if (template) {
      fetch(`/api/projects/${projectId}/render-templates/${value}`)
        .then(response => response.json())
        .then(data => setSelectedTemplate(data))
        .catch(error => console.error('Error fetching template:', error));
    }
  };

  useEffect(() => {
    if (selectedTemplate) {
      setHtmlContent(selectedTemplate.code);
    }
  }, [selectedTemplate]);

  const handleEditTemplate = () => {
    if (selectedTemplate) {
      setTemplateDialogMode('edit');
      setHtmlContent(selectedTemplate.code);
      setIsDialogOpen(true);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      await fetch(`/api/projects/${projectId}/render-templates/${selectedTemplate.id}`, {
        method: 'DELETE'
      });

      mutateTemplates(templates.filter((t: TemplateInfo) => t.id !== selectedTemplate.id));
      setSelectedTemplate(null);
      setHtmlContent(DEFAULT_HTML_TEMPLATE);
    } catch (error) {
      console.error('Failed to delete template:', error);
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  const handleSaveTemplate = (template: Template) => {
    setTemplateDialogMode('create');
    setSelectedTemplate(template);
    setIsDialogOpen(false);
    mutateTemplates();
  };

  return (
    <div className="w-full bg-background">
      <div className="flex flex-col">
        <div className="flex items-center gap-2 p-2">
          <Select
            key={selectedTemplate?.id} value={selectedTemplate?.id || undefined} onValueChange={handleTemplateSelect}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="create-new">
                <div className="flex items-center gap-2">
                  <PlusIcon className="w-4 h-4" />
                  <div>Create new template</div>
                </div>
              </SelectItem>
              {templates?.map((template: TemplateInfo) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedTemplate && (
            <>
              <Button
                variant="outline"
                onClick={handleEditTemplate}
                title="Edit template"
              >
                <PencilIcon className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(true)}
                title="Delete template"
              >
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
        <div className="flex flex-col gap-2">
          <Resizable
            defaultSize={{ width: '100%', height: '400px' }}
            enable={{
              top: false,
              right: false,
              bottom: true,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
            }}
          >
            <iframe
              ref={iFrameRef}
              className="w-full h-full border-0"
              sandbox={sandbox}
              title="Custom Visualization"
            />
          </Resizable>
        </div>

        <TemplateDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSave={handleSaveTemplate}
          defaultTemplate={templateDialogMode === 'edit' ? selectedTemplate : null}
          defaultJsonData={data}
          sandbox={sandbox}
          projectId={projectId}
        />
      </div>
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
      // Handle incoming messages
      window.addEventListener('message', (event) => {
        const data = event.data;
        document.getElementById('user-content').innerHTML = JSON.stringify(data);
      });

    </script>
  </body>
</html>
`;
