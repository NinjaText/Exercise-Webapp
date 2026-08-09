"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Command as CommandPrimitive } from "cmdk"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Users, Library, Dumbbell, Loader2, Search, SearchX, X } from "lucide-react"
import { globalSearch, type SearchResults } from "@/actions/search-actions"
import { useSearch } from "./search-provider"

const EMPTY: SearchResults = { clients: [], programs: [], exercises: [] }

const CATEGORY_HINTS = {
  TRAINER: [
    { icon: Users, label: "Clients" },
    { icon: Library, label: "Programs" },
    { icon: Dumbbell, label: "Exercises" },
  ],
  CLIENT: [
    { icon: Library, label: "Programs" },
    { icon: Dumbbell, label: "Exercises" },
  ],
} as const

function ItemIcon({ icon: Icon }: { icon: typeof Users }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-data-selected/command-item:bg-background group-data-selected/command-item:text-foreground">
      <Icon className="size-4" />
    </span>
  )
}

export function CommandPalette({ role }: { role: "TRAINER" | "CLIENT" }) {
  const { open, setOpen } = useSearch()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [isPending, startTransition] = useTransition()

  // Keyboard shortcuts: Cmd+K / Ctrl+K and "/" when not in a text field
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [setOpen])

  // Debounced search
  useEffect(() => {
    if (!query) {
      setResults(EMPTY)
      return
    }
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(query)
        setResults(res)
      })
    }, 150)
    return () => clearTimeout(timeout)
  }, [query])

  function navigate(href: string) {
    setOpen(false)
    setQuery("")
    setResults(EMPTY)
    router.push(href)
  }

  const hasResults =
    results.clients.length > 0 ||
    results.programs.length > 0 ||
    results.exercises.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setQuery("")
          setResults(EMPTY)
        }
      }}
    >
      <DialogContent
        className="top-[16%] w-full translate-y-0 gap-0 overflow-hidden rounded-2xl border border-border/60 p-0 shadow-2xl ring-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} className="rounded-2xl!">
          <div className="flex items-center gap-3 border-b border-border/60 px-4">
            {isPending ? (
              <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-5 shrink-0 text-muted-foreground" />
            )}
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search clients, programs, exercises…"
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
                <span className="sr-only">Clear search</span>
              </button>
            )}
            <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          <CommandList className="max-h-104 p-2">
            {!query && (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Search className="size-4.5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Search everything in one place</p>
                  <p className="text-xs text-muted-foreground">
                    Find {CATEGORY_HINTS[role].map((c) => c.label.toLowerCase()).join(", ")} by name
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {CATEGORY_HINTS[role].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {query && !hasResults && !isPending && (
              <CommandEmpty className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <SearchX className="size-4.5" />
                </span>
                <p className="text-sm font-medium text-foreground">No results for &ldquo;{query}&rdquo;</p>
                <p className="text-xs text-muted-foreground">Try a different name or keyword</p>
              </CommandEmpty>
            )}

            {role === "TRAINER" && results.clients.length > 0 && (
              <CommandGroup heading="Clients">
                {results.clients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`client-${c.id}`}
                    onSelect={() => navigate(`/clients/${c.id}`)}
                    className="group items-center gap-3 py-2"
                  >
                    <ItemIcon icon={Users} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{c.firstName} {c.lastName}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.programs.length > 0 && (
              <>
                {role === "TRAINER" && results.clients.length > 0 && <CommandSeparator className="my-2" />}
                <CommandGroup heading="Programs">
                  {results.programs.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`program-${p.id}`}
                      onSelect={() => navigate(`/programs/${p.id}`)}
                      className="group items-center gap-3 py-2"
                    >
                      <ItemIcon icon={Library} />
                      <span className="truncate text-sm font-medium">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results.exercises.length > 0 && (
              <>
                {results.programs.length > 0 && <CommandSeparator className="my-2" />}
                <CommandGroup heading="Exercises">
                  {results.exercises.map((e) => (
                    <CommandItem
                      key={e.id}
                      value={`exercise-${e.id}`}
                      onSelect={() => navigate(`/exercises/${e.id}`)}
                      className="group items-center gap-3 py-2"
                    >
                      <ItemIcon icon={Dumbbell} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{e.name}</span>
                        {e.bodyRegion && e.bodyRegion.length > 0 && (
                          <span className="truncate text-xs text-muted-foreground capitalize">
                            {e.bodyRegion.map((r: string) => r.replace(/_/g, " ").toLowerCase()).join(", ")}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>

          <div className="flex items-center justify-end gap-4 border-t border-border/60 bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-medium">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-medium">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-medium">Esc</kbd>
              Close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
