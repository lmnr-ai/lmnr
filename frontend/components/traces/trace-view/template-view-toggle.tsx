import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LayoutTemplate,
  List,
  ListTree,
  type LucideIcon,
  PencilIcon,
  Plus,
} from "lucide-react";
import { type MouseEvent, useCallback, useState } from "react";

import { type ViewTab } from "@/components/traces/trace-view/view-toggle";
import { Button } from "@/components/ui/button.tsx";
import { Command, CommandGroup, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTemplatePicker } from "@/components/ui/template-renderer/template-picker";
import { cn } from "@/lib/utils";

const viewOptions: Partial<Record<ViewTab, { icon: LucideIcon; label: string }>> = {
  tree: { icon: ListTree, label: "Tree" },
  transcript: { icon: List, label: "Transcript" },
};

// Shared CommandGroup heading styles use `**:` (grandchild) selectors, but cmdk
// renders the heading as a direct child — so defaults don't apply. Override here.
const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[0.65rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground";

interface TemplateViewToggleProps {
  tab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  showContent: boolean;
  onToggleContent: () => void;
  /** Built-in view tabs listed in the "Default" group (tree/transcript). */
  viewTabs: ViewTab[];
}

/** Trace-view variant of `ViewToggle` that folds custom render templates into
 *  the same dropdown. Requires a `TemplatePickerProvider` above. */
export default function TemplateViewToggle({
  tab,
  onTabChange,
  showContent,
  onToggleContent,
  viewTabs,
}: TemplateViewToggleProps) {
  const { templates, selectedTemplate, selectTemplate, openCreate, openEdit } = useTemplatePicker();
  const [open, setOpen] = useState(false);
  const templateCount = templates?.length ?? 0;

  const isCustom = tab === "custom";
  const isTreeView = tab === "tree";
  const current = isCustom
    ? { icon: LayoutTemplate, label: selectedTemplate?.name ?? "Custom" }
    : (viewOptions[tab] ?? { icon: List, label: tab });
  const CurrentIcon = current.icon;

  const handlePickView = useCallback(
    (next: ViewTab) => {
      onTabChange(next);
      setOpen(false);
    },
    [onTabChange]
  );

  const handlePickTemplate = useCallback(
    (id: string) => {
      onTabChange("custom");
      void selectTemplate(id);
      setOpen(false);
    },
    [onTabChange, selectTemplate]
  );

  const handleCreate = useCallback(() => {
    openCreate();
    setOpen(false);
  }, [openCreate]);

  // Editing loads the template into the shared form first (the manage dialog
  // reads it via useFormContext), so edit implies selecting it. Don't open edit
  // on a failed load — fetchTemplate already toasted.
  const handleEditTemplate = useCallback(
    async (e: MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      if (selectedTemplate?.id !== id && !(await selectTemplate(id))) return;
      openEdit();
    },
    [selectedTemplate, selectTemplate, openEdit]
  );

  return (
    <div className="flex items-center min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className={cn("flex h-[26px] items-center hover:bg-surface-up-3", isTreeView && "rounded-r-none")}
          >
            <CurrentIcon size={14} className="mr-1 flex-shrink-0" />
            <span className={cn("truncate max-w-[160px]", !isCustom && "capitalize")}>{current.label}</span>
            <ChevronDown size={14} className="ml-1 flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-0" onWheel={(e) => e.stopPropagation()}>
          <Command shouldFilter={false}>
            <CommandList className="max-h-none overflow-visible">
              <ScrollArea className="max-h-[360px] [&>div]:max-h-[360px]">
                <CommandGroup heading="Default" className={GROUP_CLASS}>
                  {viewTabs.map((option) => {
                    const view = viewOptions[option];
                    if (!view) return null;
                    const OptionIcon = view.icon;
                    return (
                      <CommandItem
                        key={option}
                        value={`view:${option}`}
                        onSelect={() => handlePickView(option)}
                        className="text-xs"
                      >
                        <OptionIcon className="size-3.5" />
                        <span className="flex-1 truncate">{view.label}</span>
                        {tab === option && <Check className="ml-2 size-3.5 shrink-0" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator alwaysRender />
                <CommandGroup heading="Custom" className={GROUP_CLASS}>
                  {templates?.map((t) => {
                    const active = isCustom && selectedTemplate?.id === t.id;
                    return (
                      <CommandItem
                        key={t.id}
                        value={`template:${t.id}`}
                        onSelect={() => handlePickTemplate(t.id)}
                        className="group text-xs"
                      >
                        <span className="flex-1 truncate">{t.name}</span>
                        <div className="ml-2 flex shrink-0 items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Edit ${t.name}`}
                            onClick={(e) => handleEditTemplate(e, t.id)}
                            className="inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-aria-selected:opacity-100 focus-visible:opacity-100"
                          >
                            <PencilIcon className="size-2.5" />
                          </button>
                          {active && <Check className="size-3.5" />}
                        </div>
                      </CommandItem>
                    );
                  })}
                  {templateCount <= 5 && (
                    <CommandItem onSelect={handleCreate} className="text-xs text-muted-foreground">
                      <Plus className="mr-1.5 size-3.5" />
                      New template
                    </CommandItem>
                  )}
                </CommandGroup>
                {templateCount > 5 && (
                  <>
                    <CommandSeparator alwaysRender />
                    <CommandGroup className={GROUP_CLASS}>
                      <CommandItem onSelect={handleCreate} className="text-xs text-muted-foreground">
                        <Plus className="mr-1.5 size-3.5" />
                        New template
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </ScrollArea>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* Content toggle (only visible in tree view) */}
      {isTreeView && (
        <Button
          variant="ghost"
          onClick={onToggleContent}
          className={cn(
            "flex h-[26px] items-center overflow-hidden rounded-l-none text-muted-foreground hover:bg-surface-up-3",
            showContent && "text-foreground"
          )}
        >
          {showContent ? <Eye size={14} className="flex-shrink-0" /> : <EyeOff size={14} className="flex-shrink-0" />}
          <span className="ml-1 truncate">Content</span>
        </Button>
      )}
    </div>
  );
}
