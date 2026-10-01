/**
 * The icon set, in one place.
 *
 * v1 imported straight from `lucide-react` in thirty files and set
 * `strokeWidth` by hand at every site — measured, eight different values
 * between 1.6 and 2.5. That inconsistency is most of why the iconography read
 * as assembled rather than drawn: at 16px, a 1.6 stroke beside a 2.2 stroke is
 * the difference between an icon that looks faint and one that looks bold, on
 * the same row.
 *
 * Two things changed.
 *
 * **Phosphor, not Lucide.** Phosphor ships real weight variants — and
 * critically a `fill` cut of every glyph, which is what lets active navigation
 * be a *filled* icon rather than the same outline in a different colour. That
 * outline-to-fill transition is the shared vocabulary of this whole category
 * (Cash App, Chime, Phantom) and Lucide simply cannot express it.
 *
 * **One module, house names.** Everything is re-exported under the name the
 * app already used, so call sites import from here and nothing else changes.
 * The point is that swapping the icon library again, or changing the house
 * weight, is an edit to this file rather than a sweep through thirty.
 *
 * Weight is Phosphor's `regular` unless a call site says otherwise; the only
 * deliberate exception is `weight="fill"` on an active nav item.
 *
 * Imported from the `ssr` entry, not the default one: the client icons read
 * React context for their defaults, which makes them client components and
 * would drag a `"use client"` boundary into any server component that renders
 * one. The SSR cut takes props only, which is all we want anyway.
 */
export {
  // navigation and structure
  House,
  Wallet,
  Eye,
  Compass,
  SlidersHorizontal,
  Newspaper,
  Crosshair,
  UserCircle,
  SidebarSimple,

  // movement
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowUUpLeft,
  ArrowsDownUp,
  CaretDown,
  CaretRight,
  CaretUp,

  // state and feedback
  Check,
  CheckCircle,
  Info,
  Warning,
  WarningOctagon,
  CircleNotch,
  X,

  // actions
  Plus,
  PencilSimple,
  Trash,
  Eraser,
  DownloadSimple,
  UploadSimple,
  MagnifyingGlass,
  PaperPlaneTilt,
  DotsThree,
  Funnel,

  // domain
  Clock,
  BookOpen,
  BellRinging,
  BellSlash,
  Bell,
  Megaphone,
  Envelope,
  DeviceMobile,
  SignIn,
  SignOut,
  Sparkle,
  TrendUp,
  TrendDown,
  ShieldWarning,
  Cookie,

  // appearance
  Sun,
  Moon,
  Monitor,
  EyeSlash,
} from "@phosphor-icons/react/dist/ssr";

/**
 * Aliases for glyphs whose ember name doesn't match Phosphor's.
 *
 * Kept as aliases rather than renamed at every call site because the ember
 * name is usually the clearer one — `AlertTriangle` says what it looks like,
 * `Warning` says what it means, and both are useful depending on where you're
 * reading.
 */
export {
  Warning as AlertTriangle,
  Warning as TriangleAlertIcon,
  WarningOctagon as OctagonXIcon,
  House as Home,
  EyeSlash as EyeOff,
  MagnifyingGlass as Search,
  MagnifyingGlass as SearchIcon,
  CaretDown as ChevronDown,
  CaretDown as ChevronDownIcon,
  CaretUp as ChevronUpIcon,
  CaretRight as ChevronRightIcon,
  Check as CheckIcon,
  CheckCircle as CircleCheckIcon,
  CircleNotch as Loader2Icon,
  Info as InfoIcon,
  X as XIcon,
  DotsThree as MoreHorizontal,
  PencilSimple as Pencil,
  Trash as Trash2,
  DownloadSimple as Download,
  UploadSimple as Upload,
  PaperPlaneTilt as Send,
  ArrowClockwise as RotateCw,
  ArrowCounterClockwise as RotateCcw,
  ArrowUUpLeft as Undo2,
  Sparkle as Sparkles,
  BellRinging as BellRing,
  SidebarSimple as PanelLeftClose,
  SidebarSimple as PanelLeftOpen,
} from "@phosphor-icons/react/dist/ssr";

/**
 * The shape of an icon component, for props that take one.
 *
 * Replaces `LucideIcon`. Named for the role rather than the vendor, so the
 * next swap doesn't touch the consumers again.
 */
export type { Icon as IconComponent } from "@phosphor-icons/react";
