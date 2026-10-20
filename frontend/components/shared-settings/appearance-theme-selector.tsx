"use client";

import { Moon, Sun } from "lucide-react";

import { useAppTheme } from "@/components/theme/app-theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { type AppTheme, isAppTheme } from "@/lib/app-theme";

const themeOptions = {
  dark: { label: "Dark theme", icon: Moon },
  light: { label: "Light theme", icon: Sun },
} satisfies Record<AppTheme, { label: string; icon: typeof Moon }>;

export function AppearanceThemeSelector() {
  const { theme, setTheme } = useAppTheme();
  const selectedTheme = themeOptions[theme];
  const SelectedIcon = selectedTheme.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-7" aria-label="Select theme">
          <SelectedIcon data-icon="inline-start" />
          <span className="mr-2">{selectedTheme.label}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => isAppTheme(value) && setTheme(value)}>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Dark theme
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun />
            Light theme
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
