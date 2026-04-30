import { useCallback, useEffect, useRef, useState } from 'react'

type NoteVariant = 'single' | 'double'

type TrailNote = {
  id: number
  x: number
  y: number
  rotation: number
  size: number
  variant: NoteVariant
}

const MAX_NOTES = 56
const THROTTLE_MS = 52

/** 온음표 (머리 + 기둥 + 깃발) */
const NoteSingle = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className="text-secondary"
    aria-hidden
  >
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
)

/** 쌍음표 (빔 + 기둥 2 + 머리 2) */
const NoteDouble = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className="text-secondary"
    aria-hidden
  >
    <rect x="8.45" y="5.2" width="1.2" height="11.2" rx="0.15" />
    <rect x="15.35" y="5.2" width="1.2" height="11.2" rx="0.15" />
    <ellipse cx="7.35" cy="16.9" rx="2.65" ry="1.8" transform="rotate(-26 7.35 16.9)" />
    <ellipse cx="14.65" cy="16.9" rx="2.65" ry="1.8" transform="rotate(-26 14.65 16.9)" />
    <rect x="5.8" y="4" width="13.4" height="2.15" rx="0.35" />
  </svg>
)

const NoteGlyph = ({ size, variant }: { size: number; variant: NoteVariant }) =>
  variant === 'double' ? <NoteDouble size={size} /> : <NoteSingle size={size} />

const MouseStarTrail = () => {
  const [notes, setNotes] = useState<TrailNote[]>([])
  const idRef = useRef(0)
  const lastSpawnRef = useRef(0)

  const removeNote = useCallback((id: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const now = performance.now()
      if (now - lastSpawnRef.current < THROTTLE_MS) return
      lastSpawnRef.current = now

      const id = ++idRef.current
      const jitterX = (Math.random() - 0.5) * 6
      const jitterY = (Math.random() - 0.5) * 6
      const variant: NoteVariant = Math.random() < 0.5 ? 'single' : 'double'

      setNotes((prev) => {
        const next = [
          ...prev,
          {
            id,
            x: e.clientX + jitterX,
            y: e.clientY + jitterY,
            rotation: (Math.random() - 0.5) * 40,
            size: 11 + Math.random() * 7,
            variant,
          },
        ]
        return next.length > MAX_NOTES ? next.slice(-MAX_NOTES) : next
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[40] overflow-hidden"
      aria-hidden
    >
      {notes.map((n) => (
        <div
          key={n.id}
          className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
          style={{ left: n.x, top: n.y }}
        >
          <div style={{ transform: `rotate(${n.rotation}deg)` }}>
            <div className="animate-cursor-star" onAnimationEnd={() => removeNote(n.id)}>
              <NoteGlyph size={n.size} variant={n.variant} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default MouseStarTrail
