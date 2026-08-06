"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Users, Library, Dumbbell, Loader2 } from "lucide-react"
import { globalSearch, type SearchResults } from "@/actions/search-actions"
import { useSearch } from "./search-provider"

const EMPTY: SearchResults = { clients: [], programs: [], exercises: [] }

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
      <DialogContent className="overflow-hidden p-0 shadow-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            {isPending && (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            )}
            <CommandInput
              placeholder="Search clients, programs, exercises…"
              value={query}
              onValueChange={setQuery}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            {query && !hasResults && !isPending && (
              <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
            )}

            {role === "TRAINER" && results.clients.length > 0 && (
              <CommandGroup heading="Clients">
                {results.clients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`client-${c.id}`}
                    onSelect={() => navigate(`/clients/${c.id}`)}
                    className="flex items-center gap-3"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{c.firstName} {c.lastName}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.programs.length > 0 && (
              <>
                {role === "TRAINER" && results.clients.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Programs">
                  {results.programs.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`program-${p.id}`}
                      onSelect={() => navigate(`/programs/${p.id}`)}
                      className="flex items-center gap-3"
                    >
                      <Library className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results.exercises.length > 0 && (
              <>
                {results.programs.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Exercises">
                  {results.exercises.map((e) => (
                    <CommandItem
                      key={e.id}
                      value={`exercise-${e.id}`}
                      onSelect={() => navigate(`/exercises/${e.id}`)}
                      className="flex items-center gap-3"
                    >
                      <Dumbbell className="h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{e.name}</span>
                        {e.bodyRegion && e.bodyRegion.length > 0 && (
                          <span className="text-xs text-muted-foreground capitalize">
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
        </Command>
      </DialogContent>
    </Dialog>
  )
}
