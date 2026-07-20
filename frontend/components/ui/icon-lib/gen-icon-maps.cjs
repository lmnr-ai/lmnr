#!/usr/bin/env node
/*
 * Regenerates the four per-library icon maps (./maps/*.ts) from:
 *   1. a same-name rule per library (Lucide "Foo" -> IconFoo / Foo / RiFooLine / FooIcon)
 *   2. explicit overrides below for names the libraries spell differently
 *
 * Every chosen export is verified against the package's REAL export list
 * (read from node_modules); an unknown name aborts the run. So a map can
 * never reference an export that doesn't exist. Run: node gen-icon-maps.cjs
 * TEMPORARY tooling for the icon-library comparison — delete with the folder.
 */
const fs = require("fs");
const path = require("path");
const FE = path.resolve(__dirname, "../../..");
const NM = path.join(FE, "node_modules");
const BASE = require("./base-map.cjs");

// --- the wrapped Lucide names -------------------------------------------------
const idx = fs.readFileSync(path.join(__dirname, "index.tsx"), "utf8");
const LUCIDE = [...idx.matchAll(/makeIcon\("([^"]+)"\)/g)].map((m) => m[1]);

// --- real exports per library -------------------------------------------------
const listFiles = (dir, re, strip) =>
  new Set(
    fs
      .readdirSync(dir)
      .filter((f) => re.test(f))
      .map((f) => f.replace(strip, ""))
  );
const REAL = {
  tabler: listFiles(path.join(NM, "@tabler/icons-react/dist/esm/icons"), /^Icon.*\.mjs$/, /\.mjs$/),
  phosphor: listFiles(path.join(NM, "@phosphor-icons/react/dist/csr"), /\.es\.js$/, /\.es\.js$/),
  // hugeicons re-exports aliases via its barrel that don't match filenames,
  // so read the actual `export { default as X }` names from the ESM index.
  hugeicons: new Set(
    (fs
      .readFileSync(path.join(NM, "@hugeicons/core-free-icons/dist/esm/index.js"), "utf8")
      .match(/as ([A-Za-z0-9]+)/g) || []
    ).map((m) => m.slice(3))
  ),
  remix: new Set(
    (fs.readFileSync(path.join(NM, "@remixicon/react/index.js"), "utf8").match(/Ri[A-Za-z0-9]+/g) || [])
  ),
};

// --- same-name rule -----------------------------------------------------------
// Lucide aliases sometimes carry a trailing "Icon" or a size digit; strip them
// for matching (Trash2 -> Trash, ArrowDownIcon -> ArrowDown, Clock3 -> Clock).
const bases = (name) => {
  const noIcon = name.replace(/Icon$/, "");
  const noDigit = noIcon.replace(/([A-Za-z])\d+$/, "$1");
  return [...new Set([noIcon, noDigit])];
};
const sameName = {
  tabler: (b) => "Icon" + b,
  phosphor: (b) => b,
  hugeicons: (b) => b + "Icon",
  remix: (b) => "Ri" + b + "Line",
};

// --- explicit overrides (Lucide name -> real export) --------------------------
const OVERRIDES = {
  tabler: {
    AlignJustify: "IconMenu2",
    Bolt: "IconNut", // Lucide Bolt is a hex fastener, not lightning (that's Zap -> IconBolt)
    Bot: "IconRobot",
    Boxes: "IconBoxMultiple",
    ChartNoAxesGantt: "IconTimeline",
    GanttChart: "IconTimeline",
    CheckCircle: "IconCircleCheck",
    CheckCircle2: "IconCircleCheck",
    ChevronsUpDown: "IconSelector",
    CircleDollarSign: "IconCurrencyDollar",
    DollarSign: "IconCurrencyDollar",
    CirclePlay: "IconCircleCaretRight",
    Code2: "IconCode",
    DatabaseZap: "IconDatabase",
    Ellipsis: "IconDots",
    EllipsisVertical: "IconDotsVertical",
    FileBarChart: "IconFileText",
    FileJson2: "IconJson",
    FilePlus2: "IconFilePlus",
    FlagTriangleRight: "IconFlag",
    FlaskConical: "IconFlask",
    FolderClosed: "IconFolder",
    Frown: "IconMoodSad",
    Image: "IconPhoto",
    ImagePlus: "IconPhoto",
    Info: "IconInfoCircle",
    Layers: "IconStack2",
    Layers2: "IconStack2",
    LayoutTemplate: "IconLayout",
    ListChecks: "IconListCheck",
    ListFilter: "IconFilter",
    ListRestart: "IconListDetails",
    MonitorPlay: "IconDeviceTvOld",
    PanelLeftIcon: "IconLayoutSidebar",
    PersonStanding: "IconWalk",
    Play: "IconPlayerPlay",
    PlayCircle: "IconPlayerPlay",
    PlayIcon: "IconPlayerPlay",
    Radio: "IconBroadcast",
    RotateCcw: "IconRotate",
    Rows2: "IconLayoutRows",
    Rows4: "IconLayoutRows",
    Save: "IconDeviceFloppy",
    Slack: "IconBrandSlack",
    SlidersHorizontal: "IconAdjustmentsHorizontal",
    SquareArrowOutUpRight: "IconSquareArrowRight",
    SquareFunction: "IconMathFunction",
    SquareTerminal: "IconTerminal2",
    Table2: "IconTable",
    TableProperties: "IconTable",
    TextSearch: "IconFileSearch",
    TriangleAlert: "IconAlertTriangle",
    Undo2: "IconArrowBackUp",
    Unplug: "IconPlugConnectedX",
    Workflow: "IconSitemap",
    Zap: "IconBolt",
  },
  phosphor: {
    Activity: "Pulse",
    AlignJustify: "TextAlignJustify",
    ArrowLeftRight: "ArrowsLeftRight",
    Bolt: "Nut", // hex fastener, not lightning (Zap -> Lightning)
    Bot: "Robot",
    Box: "Package",
    Boxes: "Stack",
    Braces: "BracketsCurly",
    BracesIcon: "BracketsCurly",
    ChartArea: "ChartLine",
    ChartColumn: "ChartBar",
    ChartNoAxesGantt: "ChartBar",
    GanttChart: "ChartBar",
    CheckCircle2: "CheckCircle",
    ChevronLeftIcon: "CaretLeft",
    ChevronRightIcon: "CaretRight",
    CircleDollarSign: "CurrencyDollar",
    DollarSign: "CurrencyDollar",
    CircleDot: "RadioButton",
    CircleMinus: "MinusCircle",
    CirclePlay: "PlayCircle",
    CirclePlus: "PlusCircle",
    Clock3: "Clock",
    CloudOff: "CloudSlash",
    Code2: "Code",
    DatabaseZap: "Database",
    Ellipsis: "DotsThree",
    EllipsisVertical: "DotsThreeVertical",
    Equal: "Equals",
    FileBarChart: "FileText",
    FileJson2: "FileCode",
    FilePlus2: "FilePlus",
    FlagTriangleRight: "Flag",
    FlaskConical: "Flask",
    FolderClosed: "Folder",
    Frown: "SmileySad",
    GripHorizontal: "DotsSix",
    GripVertical: "DotsSixVertical",
    GripVerticalIcon: "DotsSixVertical",
    HelpCircle: "Question",
    History: "ClockCounterClockwise",
    ImagePlus: "Image",
    Inbox: "Tray",
    Layers: "Stack",
    Layers2: "Stack",
    LayoutDashboard: "SquaresFour",
    LayoutTemplate: "Layout",
    ListFilter: "Funnel",
    ListRestart: "List",
    ListTree: "TreeStructure",
    Mail: "Envelope",
    Maximize: "ArrowsOut",
    MessageCircle: "ChatCircle",
    MessageCirclePlus: "ChatCircleDots",
    Minimize: "ArrowsIn",
    PanelLeftIcon: "Sidebar",
    PersonStanding: "Person",
    Radio: "Broadcast",
    RotateCcw: "ArrowCounterClockwise",
    Server: "HardDrives",
    Slack: "SlackLogo",
    SquareArrowOutUpRight: "ArrowSquareOut",
    SquareFunction: "Function",
    SquareTerminal: "TerminalWindow",
    Table2: "Table",
    TableProperties: "Table",
    Tags: "Tag",
    TextSearch: "MagnifyingGlass",
    TriangleAlert: "Warning",
    Undo2: "ArrowUUpLeft",
    Unplug: "Plugs",
    VariableIcon: "Function",
    Workflow: "FlowArrow",
    ZoomOut: "MagnifyingGlassMinus",
  },
  remix: {
    Activity: "RiPulseLine",
    AlignJustify: "RiMenuLine",
    ArrowUpLeft: "RiArrowLeftUpLine",
    ArrowUpRight: "RiArrowRightUpLine",
    Bolt: "RiToolsLine", // Remix has no nut/bolt glyph; tools is the closest hardware fastener
    Zap: "RiFlashlightLine",
    Bot: "RiRobot2Line",
    Box: "RiBox3Line",
    Boxes: "RiStackLine",
    Layers: "RiStackLine",
    Layers2: "RiStackLine",
    ChartArea: "RiAreaChartLine",
    ChartBar: "RiBarChartLine",
    ChartColumn: "RiBarChartGroupedLine",
    ChartLine: "RiLineChartLine",
    ChartNoAxesGantt: "RiBarChartHorizontalLine",
    GanttChart: "RiBarChartHorizontalLine",
    CheckCircle: "RiCheckboxCircleLine",
    CheckCircle2: "RiCheckboxCircleLine",
    ChevronLeftIcon: "RiArrowLeftSLine",
    ChevronRightIcon: "RiArrowRightSLine",
    ChevronsUpDown: "RiExpandUpDownLine",
    CircleDashed: "RiCheckboxBlankCircleLine",
    CircleDollarSign: "RiMoneyDollarCircleLine",
    DollarSign: "RiMoneyDollarCircleLine",
    CircleDot: "RiRecordCircleLine",
    CircleMinus: "RiIndeterminateCircleLine",
    CirclePlay: "RiPlayCircleLine",
    CirclePlus: "RiAddCircleLine",
    Clock: "RiTimeLine",
    Clock3: "RiTimeLine",
    Code2: "RiCodeLine",
    Columns2: "RiLayoutColumnLine",
    CopyIcon: "RiFileCopyLine",
    CreditCard: "RiBankCardLine",
    DatabaseZap: "RiDatabase2Line",
    Ellipsis: "RiMoreLine",
    EllipsisVertical: "RiMore2Line",
    FileBarChart: "RiFileChartLine",
    FileJson2: "RiFileCodeLine",
    FilePlus2: "RiFileAddLine",
    FlagTriangleRight: "RiFlagLine",
    FlaskConical: "RiFlaskLine",
    FolderClosed: "RiFolderLine",
    Frown: "RiEmotionUnhappyLine",
    Gauge: "RiSpeedLine",
    GripHorizontal: "RiDraggable",
    GripVertical: "RiDraggable",
    GripVerticalIcon: "RiDraggable",
    Hash: "RiHashtag",
    HelpCircle: "RiQuestionLine",
    ImagePlus: "RiImageAddLine",
    LayoutDashboard: "RiDashboardLine",
    LayoutTemplate: "RiLayoutLine",
    Link: "RiLinkM",
    List: "RiListUnordered",
    ListChecks: "RiListCheck",
    ListFilter: "RiFilterLine",
    ListRestart: "RiListUnordered",
    ListTree: "RiListIndefinite",
    Maximize: "RiFullscreenLine",
    MessageCircle: "RiMessage2Line",
    MessageCirclePlus: "RiChatNewLine",
    Minimize: "RiFullscreenExitLine",
    MonitorPlay: "RiComputerLine",
    PanelLeft: "RiLayoutLeftLine",
    PanelLeftIcon: "RiLayoutLeftLine",
    Paperclip: "RiAttachmentLine",
    PersonStanding: "RiWalkLine",
    Radio: "RiBroadcastLine",
    RotateCcw: "RiArrowGoBackLine",
    Rows2: "RiLayoutRowLine",
    Rows4: "RiLayoutRowLine",
    SlidersHorizontal: "RiEqualizerLine",
    SquareArrowOutUpRight: "RiShareBoxLine",
    SquareFunction: "RiFunctionLine",
    VariableIcon: "RiFunctionLine",
    SquareTerminal: "RiTerminalBoxLine",
    Table2: "RiTableLine",
    TableProperties: "RiTableLine",
    Tag: "RiPriceTagLine",
    Tags: "RiPriceTag3Line",
    TextSearch: "RiSearchLine",
    TriangleAlert: "RiAlertLine",
    Undo2: "RiArrowGoBackLine",
    Unplug: "RiPlugLine",
    Workflow: "RiFlowChart",
  },
  hugeicons: {
    AlertTriangle: "Alert02Icon",
    TriangleAlert: "Alert02Icon",
    AlignJustify: "TextAlignJustifyCenterIcon",
    Bolt: "NutIcon", // hex fastener, not lightning (that's Zap)
    ChartBar: "BarChartIcon",
    CheckCircle: "CheckmarkCircle01Icon",
    CheckCircle2: "CheckmarkCircle02Icon",
    ChevronsUpDown: "UnfoldMoreIcon",
    CircleAlert: "AlertCircleIcon",
    CirclePlay: "PlayCircle02Icon",
    Code2: "SourceCodeIcon",
    Columns2: "LayoutTable01Icon",
    Equal: "EqualSignIcon",
    FileBarChart: "FileChartColumnIcon",
    FileJson2: "SourceCodeIcon",
    FilePlus2: "FileAddIcon",
    FileText: "File02Icon",
    FolderClosed: "Folder01Icon",
    GanttChart: "ChartGanttIcon",
    ChartNoAxesGantt: "ChartGanttIcon",
    ImagePlus: "Image01Icon",
    Info: "InformationCircleIcon",
    Layers2: "Layers02Icon",
    LogOut: "Logout01Icon",
    LayoutDashboard: "DashboardSquare01Icon",
    LayoutTemplate: "Layout01Icon",
    List: "ListViewIcon",
    ListChecks: "TaskDone01Icon",
    ListFilter: "FilterIcon",
    Loader: "Loading03Icon",
    MessageCircle: "Message01Icon",
    MessageCirclePlus: "MessageAdd01Icon",
    MonitorPlay: "ComputerIcon",
    Palette: "PaintBoardIcon",
    Paperclip: "AttachmentIcon",
    Radio: "RssIcon",
    PersonStanding: "UserIcon",
    RefreshCw: "ArrowReloadHorizontalIcon",
    RotateCcw: "RotateLeft01Icon",
    Rows2: "LayoutTable02Icon",
    Rows4: "LayoutTable02Icon",
    Send: "Navigation03Icon",
    Server: "ServerStack01Icon",
    ShieldCheck: "SecurityCheckIcon",
    SquareArrowOutUpRight: "SquareArrowUpRight02Icon",
    SquareFunction: "FunctionSquareIcon",
    SquareTerminal: "ComputerTerminal01Icon",
    Table2: "Table01Icon",
    TableProperties: "Table01Icon",
    TextSearch: "Search01Icon",
    Trash: "Delete02Icon",
    Undo2: "ArrowTurnBackwardIcon",
    Unplug: "Unlink01Icon",
    Workflow: "WorkflowSquare01Icon",
    ZoomOut: "SearchMinusIcon",
  },
};

// --- resolve one library ------------------------------------------------------
// Resolution order per icon: explicit override > recovered base > same-name rule.
function resolve(lib) {
  const real = REAL[lib];
  const over = OVERRIDES[lib];
  const base = BASE[lib] || {};
  const pairs = []; // [lucideName, exportName]
  const errors = [];
  for (const name of LUCIDE) {
    let target = over[name] || base[name];
    if (target) {
      if (!real.has(target)) {
        errors.push(`${lib}: ${name} -> ${target} NOT in package`);
        continue;
      }
      pairs.push([name, target]);
      continue;
    }
    // same-name rule with alias/digit fallbacks
    let hit = null;
    for (const b of bases(name)) {
      const cand = sameName[lib](b);
      if (real.has(cand)) {
        hit = cand;
        break;
      }
    }
    if (hit) pairs.push([name, hit]);
    // no hit -> intentionally unmapped (placeholder)
  }
  return { pairs, errors };
}

// --- emit ---------------------------------------------------------------------
function emit(lib) {
  const { pairs, errors } = resolve(lib);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  const used = [...new Set(pairs.map(([, e]) => e))].sort();
  const varName = { tabler: "tablerMap", phosphor: "phosphorMap", remix: "remixMap", hugeicons: "hugeiconsMap" }[lib];
  const recordType =
    lib === "hugeicons" ? "Record<string, unknown>" : "Record<string, React.ComponentType<Record<string, unknown>>>";

  let importBlock;
  if (lib === "phosphor") {
    // per-subpath imports (barrel is not nodenext-resolvable)
    importBlock = used.map((e) => `import { ${e} } from "@phosphor-icons/react/${e}";`).join("\n");
  } else if (lib === "tabler") {
    importBlock = `import {\n${used.map((e) => "  " + e).join(",\n")},\n} from "@tabler/icons-react";`;
  } else if (lib === "remix") {
    importBlock = `import {\n${used.map((e) => "  " + e).join(",\n")},\n} from "@remixicon/react";`;
  } else {
    importBlock = `import {\n${used.map((e) => "  " + e).join(",\n")},\n} from "@hugeicons/core-free-icons";`;
  }
  const typeImport = lib === "hugeicons" ? "" : 'import type React from "react";\n';
  const body = pairs
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([n, e]) => `  "${n}": ${e},`)
    .join("\n");
  const out = `/* eslint-disable simple-import-sort/imports */
// GENERATED by ./gen-icon-maps.cjs — do not edit by hand.
// Lucide icon name -> ${lib} export (verified against the installed package; misses render a placeholder).
${typeImport}${importBlock}

export const ${varName}: ${recordType} = {
${body}
};
`;
  fs.writeFileSync(path.join(__dirname, "maps", `${lib}.ts`), out);
  const mapped = new Set(pairs.map(([n]) => n));
  const placeholders = LUCIDE.filter((n) => !mapped.has(n));
  console.log(`${lib}: ${pairs.length}/${LUCIDE.length} mapped` + (placeholders.length ? ` — placeholders: ${placeholders.join(", ")}` : ""));
}

["tabler", "phosphor", "remix", "hugeicons"].forEach((l) => emit(l));
