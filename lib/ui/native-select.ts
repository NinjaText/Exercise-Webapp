/**
 * Class string for a native `<select>` styled to match `Input` / `Select`
 * (36px tall, same border, focus ring, disabled and reduced-motion contract).
 * A plain module (no "use client") so server and client components can share it.
 */
export const NATIVE_SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-surface px-3 text-base shadow-xs outline-none transition-[color,border-color,box-shadow] hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none md:text-sm";
