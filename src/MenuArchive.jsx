import { useEffect, useRef, useState } from 'react'
import CustomGamePicker from './CustomGamePicker'

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function CalendarPicker({ dayNumberForDate, todayDayNumber, onSelectDay }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7 // Mon=0..Sun=6
  const daysInThisMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInThisMonth; d++) cells.push(d)

  const rawMonthLabel = viewDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1)

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button
          type="button"
          className="calendar-nav"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <span className="calendar-month-label">{monthLabel}</span>
        <button
          type="button"
          className="calendar-nav"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>
      <div className="calendar-weekdays">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={i} className="calendar-cell empty" />
          const cellDayNumber = dayNumberForDate(new Date(year, month, d))
          const available = cellDayNumber <= todayDayNumber
          const isToday = cellDayNumber === todayDayNumber
          return (
            <button
              type="button"
              key={i}
              className={`calendar-cell${isToday ? ' today' : ''}${available ? '' : ' disabled'}`}
              disabled={!available}
              onClick={() => onSelectDay(cellDayNumber)}
            >
              {d}
              {available && <span className="calendar-dot" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function MenuArchive({
  dayNumberForDate,
  todayDayNumber,
  onDaily,
  onPractice,
  onSelectDay,
  provincias,
  provinciaCounts,
  onStartCustom,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="menu-wrap" ref={menuRef}>
      <button type="button" className="menu-btn" onClick={() => setMenuOpen((o) => !o)}>
        Modos de juego ▾
      </button>
      {menuOpen && (
        <div className="menu-dropdown">
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setMenuOpen(false)
              onDaily()
            }}
          >
            Mapa del día
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setMenuOpen(false)
              onPractice()
            }}
          >
            Modo práctica
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setMenuOpen(false)
              setArchiveOpen(true)
            }}
          >
            Archivo
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setMenuOpen(false)
              setCustomOpen(true)
            }}
          >
            Partida personalizada
          </button>
        </div>
      )}

      {customOpen && (
        <div className="modal-backdrop" onClick={() => setCustomOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <CustomGamePicker
              provincias={provincias}
              provinciaCounts={provinciaCounts}
              onClose={() => setCustomOpen(false)}
              onStart={(selectedProvinciaIds) => {
                setCustomOpen(false)
                onStartCustom(selectedProvinciaIds)
              }}
            />
          </div>
        </div>
      )}

      {archiveOpen && (
        <div className="modal-backdrop" onClick={() => setArchiveOpen(false)}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-modal-header">
              <span>Elegí una fecha</span>
              <button type="button" className="calendar-close" onClick={() => setArchiveOpen(false)}>
                ✕
              </button>
            </div>
            <CalendarPicker
              dayNumberForDate={dayNumberForDate}
              todayDayNumber={todayDayNumber}
              onSelectDay={(dayNumber) => {
                setArchiveOpen(false)
                onSelectDay(dayNumber)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
