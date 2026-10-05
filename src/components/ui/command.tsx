"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SearchIcon, CheckIcon } from "@/components/common/icon"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl! bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          "top-[18vh] translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 shadow-overlay sm:max-w-xl",
          className
        )}
        showCloseButton={showCloseButton}
      >
        {/* ember: the header sits *inside* DialogContent. Upstream renders it
            as a sibling, and only DialogContent is portalled — so the sr-only
            title and description were being emitted into the page body on
            every screen, outside any landmark (axe `region`) and detached from
            the dialog they are supposed to name. */}
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* ember: children are wrapped in `Command`. As generated, this
            component rendered them bare — so `CommandInput` and friends had no
            cmdk context and the dialog threw `Cannot read properties of
            undefined (reading 'subscribe')` the first time anything opened it.
            Same class of registry defect as the empty `form` entry (ADR 0020
            in CLAUDE.md's decision list). */}
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    // ember: a full-width row under a hairline, not a small well inside a
    // padded box. The field is the dialog's header; at 32px with 4px around it
    // the palette read as cramped before anything was typed.
    <div
      data-slot="command-input-wrapper"
      className="flex h-14 items-center gap-3 border-b border-line px-4"
    >
      <SearchIcon aria-hidden className="size-5 shrink-0 text-stone" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-body text-ink outline-hidden placeholder:text-stone disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-[min(26rem,56vh)] scroll-py-2 overflow-x-hidden overflow-y-auto p-2 outline-none",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-12 text-center text-caption text-stone", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-ink not-first:mt-2 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-micro **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-stone",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-2 my-2 h-px bg-line", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex min-h-11 cursor-default items-center gap-3 rounded-lg px-3 text-body outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-surface-2 data-selected:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-stone [&_svg:not([class*='size-'])]:size-[1.125rem] data-selected:*:[svg]:text-ink",
        className
      )}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-caption text-stone",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
