import { useEffect, useState } from 'react'

/**
 * Current time in ms, refreshed every `intervalMs`. Use it instead of calling `Date.now()`
 * during render (React Compiler purity) for "x minutes ago" / staleness checks.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
