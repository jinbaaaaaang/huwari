import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LS_HISTORY_EVENT,
  LS_KEY,
  type LocalHistoryEntry,
  type StyleProfile,
  computeStyleProfile,
  readLocalHistory,
} from '../lib/styleHistory'

/**
 * localStorage 히스토리를 읽어 StyleProfile을 반환.
 * - 다른 탭/창에서 저장한 변경은 storage 이벤트로 동기화
 * - 같은 탭 안에서 저장한 변경은 LS_HISTORY_EVENT 커스텀 이벤트로 즉시 동기화
 * - 페이지 포커스/마운트 시에도 fresh read
 */
export function useStyleProfile(): {
  entries: LocalHistoryEntry[]
  profile: StyleProfile
  refresh: () => void
} {
  const [entries, setEntries] = useState<LocalHistoryEntry[]>(() =>
    readLocalHistory(),
  )

  const refresh = useCallback(() => {
    setEntries(readLocalHistory())
  }, [])

  useEffect(() => {
    refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY || e.key === null) {
        refresh()
      }
    }
    const onFocus = () => refresh()
    const onLocal = () => refresh()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    window.addEventListener(LS_HISTORY_EVENT, onLocal as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(LS_HISTORY_EVENT, onLocal as EventListener)
    }
  }, [refresh])

  const profile = useMemo(() => computeStyleProfile(entries), [entries])
  return { entries, profile, refresh }
}
