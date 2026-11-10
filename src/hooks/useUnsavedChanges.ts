import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

export interface UnsavedChangesGuard {
  /** True while a navigation is being held back pending the user's answer. */
  isBlocked: boolean
  /** Discard the changes and continue to the requested page. */
  discard: () => void
  /** Stay on the current page. */
  stay: () => void
  /** Let the very next navigation through unchallenged (e.g. after deleting the record). */
  allowNext: () => void
}

/**
 * Holds back in-app navigation and browser unload while `dirty` is true, so
 * unsaved kit-list edits aren't silently thrown away.
 */
export function useUnsavedChanges(dirty: boolean): UnsavedChangesGuard {
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Required by some browsers to trigger the native prompt.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const bypass = useRef(false)

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        if (bypass.current) { bypass.current = false; return false }
        return dirty && currentLocation.pathname !== nextLocation.pathname
      },
      [dirty]
    )
  )

  const discard = useCallback(() => { blocker.proceed?.() }, [blocker])
  const stay = useCallback(() => { blocker.reset?.() }, [blocker])

  const allowNext = useCallback(() => { bypass.current = true }, [])

  return { isBlocked: blocker.state === 'blocked', discard, stay, allowNext }
}
