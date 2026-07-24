import { useCallback, useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXTwitter, faInstagram } from '@fortawesome/free-brands-svg-icons'
import ResultsMap from './ResultsMap'
import MenuArchive from './MenuArchive'
import { fetchAllRows } from './supabaseClient'
import donateImg from './assets/la-bestia-de-calchin.jpg'
import './App.css'

const TOTAL_ROUNDS = 5
// Rondas 1-2: estadios fáciles (dificultad facil/muy_facil). Rondas 3-5:
// estadios difíciles (dificil/muy_dificil), que valen el doble de puntos.
const ROUNDS_EASY = 2
const ROUNDS_HARD = 3
const HARD_SCORE_MULTIPLIER = 2
const MAX_SCORE = ROUNDS_EASY * 100 + ROUNDS_HARD * 100 * HARD_SCORE_MULTIPLIER
const DIFICULTAD_LABELS = {
  muy_facil: 'Muy fácil',
  facil: 'Fácil',
  dificil: 'Difícil',
  muy_dificil: 'Muy difícil',
}
const SHARE_DOMAIN = 'https://estad10s.com' // TODO: actualizar cuando esté deployado
const DAY_MS = 24 * 60 * 60 * 1000
const EPOCH_UTC = Date.UTC(2024, 0, 1)

// Igual que en UbiCABA: el ciclo diario/archivo se fija sobre un tamaño de
// pool estable en vez del tamaño real de la tabla, para que agregar estadios
// nuevos (vía el admin) nunca reordene qué estadio le toca a qué día pasado.
// A diferencia de UbiCABA (que arrancó con ~4000 esquinas ya cargadas), acá el
// dataset real todavía no existe, así que el tamaño de ciclo se calcula en
// base al pool actual (capado en DAILY_CYCLE_TARGET_SIZE) en vez de asumir
// un número fijo — evita que indicesForDay() apunte a filas que no existen
// todavía. Una vez que el dataset final esté cargado, conviene fijarlo a un
// número concreto (como hace UbiCABA) para que el ciclo deje de moverse.
const DAILY_CYCLE_TARGET_SIZE = 4000

function toRad(deg) {
  return (deg * Math.PI) / 180
}

function haversineMeters(a, b) {
  const R = 6371000
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// <=50m: 100 pts. Beyond 50m: -1 pt every 66m.
function scoreForDistance(distanceMeters) {
  if (distanceMeters <= 50) return 100
  return Math.max(0, 100 - Math.floor((distanceMeters - 50) / 66))
}

function dayNumberForDate(date) {
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((utcMidnight - EPOCH_UTC) / DAY_MS)
}

function isHardDificultad(dificultad) {
  return dificultad === 'dificil' || dificultad === 'muy_dificil'
}

// Separa los índices candidatos en "fáciles" (rondas 1-2) y "difíciles"
// (rondas 3-5), preservando el subconjunto que se le pase (pool entero o uno
// ya filtrado por provincia).
function splitByDifficulty(pool, candidateIndices) {
  const easy = []
  const hard = []
  for (const i of candidateIndices) {
    if (isHardDificultad(pool[i]?.dificultad)) hard.push(i)
    else easy.push(i)
  }
  return { easy, hard }
}

function shuffleSample(arr, n) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

// Picks n rounds from the given candidate indices. If there are fewer than n
// candidates (e.g. a provincia with only 1-4 estadios so far), it fills the
// remaining rounds by repeating random picks from that same small pool rather
// than refusing to start.
function sampleRoundIndices(candidates, n) {
  if (candidates.length === 0) return []
  if (candidates.length >= n) return shuffleSample(candidates, n)
  const result = shuffleSample(candidates, candidates.length)
  while (result.length < n) {
    result.push(candidates[Math.floor(Math.random() * candidates.length)])
  }
  return result
}

// El pool completo puede seguir creciendo; el ciclo diario usa solo los
// primeros N de cada bolsa de dificultad (N capado en DAILY_CYCLE_TARGET_SIZE),
// así que agregar estadios nuevos nunca reordena el ciclo ya existente.
// Devuelve siempre ROUNDS_EASY índices fáciles seguidos de ROUNDS_HARD
// difíciles (con wraparound si una bolsa es más chica que la ventana).
function windowForDay(indices, count, dayNumber) {
  if (indices.length === 0) return []
  const cappedSize = Math.min(DAILY_CYCLE_TARGET_SIZE, indices.length)
  const cycleLength = Math.max(1, Math.floor(cappedSize / count))
  const cyclePos = ((dayNumber % cycleLength) + cycleLength) % cycleLength
  const start = cyclePos * count
  return Array.from({ length: count }, (_, i) => indices[(start + i) % indices.length])
}

function indicesForDay(dayNumber, pool) {
  const { easy, hard } = splitByDifficulty(
    pool,
    pool.map((_, i) => i),
  )
  return [...windowForDay(easy, ROUNDS_EASY, dayNumber), ...windowForDay(hard, ROUNDS_HARD, dayNumber)]
}

// Para práctica/personalizada: ROUNDS_EASY al azar de la bolsa fácil +
// ROUNDS_HARD de la difícil. Si alguna bolsa no tiene suficientes candidatos
// dentro de candidateIndices (p. ej. una provincia sin estadios difíciles
// todavía), completa con picks al azar de todo candidateIndices para no
// romper el juego.
function pickRoundIndices(pool, candidateIndices) {
  const { easy, hard } = splitByDifficulty(pool, candidateIndices)
  const picks = [...sampleRoundIndices(easy, ROUNDS_EASY), ...sampleRoundIndices(hard, ROUNDS_HARD)]
  while (picks.length < ROUNDS_EASY + ROUNDS_HARD && candidateIndices.length > 0) {
    picks.push(candidateIndices[Math.floor(Math.random() * candidateIndices.length)])
  }
  return picks
}

function parseShareIndices(poolLength) {
  const raw = new URLSearchParams(window.location.search).get('share')
  if (!raw) return null
  const parts = raw.split('-')
  if (parts.length !== TOTAL_ROUNDS) return null
  const indices = parts.map((p) => Number(p) - 1)
  const valid = indices.every((i) => Number.isInteger(i) && i >= 0 && i < poolLength)
  return valid ? indices : null
}

// A share link is only treated as a custom (provincia-filtered) game if: the
// share indices are valid, the provincias= ids all exist, AND every one of
// the 5 rounds' actual provincia_id is among those requested. Otherwise it
// degrades to a normal shared/practice link (share indices still used,
// provincias= ignored).
function parseCustomShareProvincias(indices, pool, provincias) {
  const raw = new URLSearchParams(window.location.search).get('provincias')
  if (!raw || !indices) return null
  const provinciaIds = raw.split('-').map(Number)
  const validIds = provinciaIds.length > 0 && provinciaIds.every((id) => provincias.some((p) => p.provincia_id === id))
  if (!validIds) return null
  const provinciaIdSet = new Set(provinciaIds)
  const allRoundsMatch = indices.every((i) => provinciaIdSet.has(pool[i]?.provincia_id))
  return allRoundsMatch ? provinciaIds : null
}

function formatEstadio(nombre, club) {
  return club ? `${nombre} (${club})` : nombre
}

function scoreEmoji(points) {
  if (points === 100) return '🎯'
  if (points >= 90) return '🔥'
  if (points >= 80) return '🏆'
  if (points >= 60) return '👍'
  if (points >= 40) return '🤙'
  if (points >= 20) return '😛'
  return '😂'
}

function buildShareText(shareLink, results, totalScore, modeLine, dateLine) {
  const emojiLine = results.map((r) => `${r.points}${scoreEmoji(r.points)}`).join(' ')
  const datePart = dateLine ? `\n${dateLine}` : ''
  return `${shareLink}\n${modeLine}${datePart}\n${emojiLine}\nFinal score: ${totalScore}`
}

function shareIndicesToUrl(indices, provinciaIds) {
  const base = `/?share=${indices.map((i) => i + 1).join('-')}`
  return provinciaIds && provinciaIds.length ? `${base}&provincias=${provinciaIds.join('-')}` : base
}

const SESSION_STORAGE_KEY = 'estad10s-game-session'
const DONATE_POPUP_SESSION_KEY = 'estad10s-donate-popup-shown'

function loadStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function sameIndices(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
}

function App() {
  const [pool, setPool] = useState(null)
  const [provincias, setProvincias] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [initialized, setInitialized] = useState(false)

  const [roundIndices, setRoundIndices] = useState([])
  const [gameMode, setGameMode] = useState('daily')
  const [customProvinciaIds, setCustomProvinciaIds] = useState([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [phase, setPhase] = useState('guessing') // 'guessing' | 'revealed' | 'gameOver'
  const [results, setResults] = useState([]) // {nombre, club, guess, actual, distance, points}
  const [shareCopied, setShareCopied] = useState(false)
  const [menuCopied, setMenuCopied] = useState(false)
  const [socialsOpen, setSocialsOpen] = useState(false)
  const [donatePopupOpen, setDonatePopupOpen] = useState(false)
  const [scoreOverlayOpen, setScoreOverlayOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [poolRows, provinciaRows] = await Promise.all([
          fetchAllRows('estadios', 'nombre, club, lat, lng, provincia_id, image_url, dificultad', 'pool_index'),
          fetchAllRows('provincias', '*', 'provincia_id'),
        ])
        if (cancelled) return
        setPool(poolRows)
        setProvincias(provinciaRows)
      } catch (e) {
        if (!cancelled) setLoadError(e.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!pool || !provincias || initialized) return

    const fromShare = parseShareIndices(pool.length)
    let fresh
    if (fromShare) {
      const provinciaIds = parseCustomShareProvincias(fromShare, pool, provincias)
      fresh = provinciaIds
        ? { roundIndices: fromShare, gameMode: 'custom', customProvinciaIds: provinciaIds }
        : { roundIndices: fromShare, gameMode: 'linked', customProvinciaIds: [] }
    } else {
      fresh = {
        roundIndices: indicesForDay(dayNumberForDate(new Date()), pool),
        gameMode: 'daily',
        customProvinciaIds: [],
      }
    }

    const stored = loadStoredSession()
    const isResume = stored && stored.gameMode === fresh.gameMode && sameIndices(stored.roundIndices, fresh.roundIndices)
    const initial = isResume
      ? {
          roundIndices: stored.roundIndices,
          gameMode: stored.gameMode,
          customProvinciaIds: stored.customProvinciaIds || [],
          roundIndex: stored.roundIndex ?? 0,
          phase: stored.phase ?? 'guessing',
          results: stored.results ?? [],
        }
      : { ...fresh, roundIndex: 0, phase: 'guessing', results: [] }

    setRoundIndices(initial.roundIndices)
    setGameMode(initial.gameMode)
    setCustomProvinciaIds(initial.customProvinciaIds)
    setRoundIndex(initial.roundIndex)
    setPhase(initial.phase)
    setResults(initial.results)
    setInitialized(true)
  }, [pool, provincias, initialized])

  const isReady = !!pool && !!provincias && initialized

  useEffect(() => {
    if (!isReady) return
    try {
      if (!sessionStorage.getItem(DONATE_POPUP_SESSION_KEY)) {
        sessionStorage.setItem(DONATE_POPUP_SESSION_KEY, '1')
        setDonatePopupOpen(true)
      }
    } catch {
      // sessionStorage unavailable (private browsing, etc.); just skip the popup
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady])

  const customProvinciaNames = useMemo(
    () => (provincias ? provincias.filter((p) => customProvinciaIds.includes(p.provincia_id)).map((p) => p.nombre) : []),
    [provincias, customProvinciaIds],
  )

  useEffect(() => {
    if (!isReady) return
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roundIndices, gameMode, customProvinciaIds, roundIndex, phase, results }),
      )
    } catch {
      // sessionStorage unavailable (private browsing, etc.); ignore
    }
  }, [isReady, roundIndices, gameMode, customProvinciaIds, roundIndex, phase, results])

  const rounds = useMemo(() => (pool ? roundIndices.map((i) => pool[i]) : []), [pool, roundIndices])
  const allPoolIndices = useMemo(() => (pool ? pool.map((_, i) => i) : []), [pool])
  const shareLink = useMemo(
    () => `${SHARE_DOMAIN}${shareIndicesToUrl(roundIndices, gameMode === 'custom' ? customProvinciaIds : undefined)}`,
    [roundIndices, gameMode, customProvinciaIds],
  )
  const resultShareLink = gameMode === 'daily' ? SHARE_DOMAIN : shareLink

  const provinciaCounts = useMemo(() => {
    const counts = new Map()
    if (!pool) return counts
    for (const it of pool) {
      counts.set(it.provincia_id, (counts.get(it.provincia_id) || 0) + 1)
    }
    return counts
  }, [pool])

  const current = rounds[roundIndex]
  const totalScore = useMemo(() => results.reduce((s, r) => s + r.points, 0), [results])

  const [imagePopupOpen, setImagePopupOpen] = useState(false)

  useEffect(() => {
    if (current?.image_url) {
      setImagePopupOpen(true)
      const timer = setTimeout(() => setImagePopupOpen(false), 4000)
      return () => clearTimeout(timer)
    }
    setImagePopupOpen(false)
  }, [current])

  const handlePick = useCallback(
    (pos) => {
      if (phase !== 'guessing') return
      const actual = [current.lat, current.lng]
      const distance = haversineMeters(pos, actual)
      const hard = isHardDificultad(current.dificultad)
      const points = scoreForDistance(distance) * (hard ? HARD_SCORE_MULTIPLIER : 1)
      setResults((prev) => [
        ...prev,
        { nombre: current.nombre, club: current.club, guess: pos, actual, distance, points, hard },
      ])
      setPhase('revealed')
    },
    [phase, current],
  )

  useEffect(() => {
    if (phase !== 'revealed') return
    const timer = setTimeout(() => {
      setRoundIndex((i) => {
        if (i + 1 >= TOTAL_ROUNDS) {
          setPhase('gameOver')
          return i
        }
        setPhase('guessing')
        return i + 1
      })
    }, 5000)
    return () => clearTimeout(timer)
  }, [phase])

  const startGame = (indices, mode, { copyInvite, provinciaIds = [] } = {}) => {
    setRoundIndices(indices)
    setGameMode(mode)
    setCustomProvinciaIds(provinciaIds)
    setRoundIndex(0)
    setResults([])
    setShareCopied(false)
    setScoreOverlayOpen(true)
    setPhase('guessing')
    const urlProvinciaIds = mode === 'custom' ? provinciaIds : undefined
    window.history.replaceState(null, '', mode === 'daily' ? '/' : shareIndicesToUrl(indices, urlProvinciaIds))

    if (copyInvite) {
      const text = `Unite a mi partida en el link ${SHARE_DOMAIN}${shareIndicesToUrl(indices, urlProvinciaIds)}`
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setMenuCopied(true)
          setTimeout(() => setMenuCopied(false), 2000)
        })
        .catch(() => {})
    }
  }

  const handleRestart = () => {
    startGame(pickRoundIndices(pool, allPoolIndices), 'linked')
  }

  const handleShare = async () => {
    let modeLine
    let dateLine = null
    if (gameMode === 'daily') {
      modeLine = 'Partida del día'
      dateLine = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
    } else if (gameMode === 'custom') {
      modeLine = `Partida personalizada - solo provincias de ${customProvinciaNames.join(', ')}`
    } else {
      modeLine = 'Modo práctica'
    }
    const text = buildShareText(resultShareLink, results, totalScore, modeLine, dateLine)
    try {
      await navigator.clipboard.writeText(text)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // clipboard not available; ignore
    }
  }

  const handlePractice = () => {
    startGame(pickRoundIndices(pool, allPoolIndices), 'linked')
  }

  const handleSelectArchiveDay = (dayNumber) => {
    startGame(indicesForDay(dayNumber, pool), 'linked', { copyInvite: true })
  }

  const handleDaily = () => {
    startGame(indicesForDay(dayNumberForDate(new Date()), pool), 'daily')
  }

  const handleStartCustom = (selectedProvinciaIds) => {
    const selectedSet = new Set(selectedProvinciaIds)
    const candidateIndices = []
    pool.forEach((it, i) => {
      if (selectedSet.has(it.provincia_id)) candidateIndices.push(i)
    })
    startGame(pickRoundIndices(pool, candidateIndices), 'custom', { provinciaIds: selectedProvinciaIds })
  }

  if (loadError) {
    return (
      <div className="app">
        <div className="loading-screen">No se pudo cargar el juego: {loadError}</div>
      </div>
    )
  }

  if (isReady && pool.length === 0) {
    return (
      <div className="app">
        <div className="loading-screen">Todavía no hay estadios cargados. Volvé más tarde.</div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="app">
        <div className="loading-screen">Cargando...</div>
      </div>
    )
  }

  const menu = (
    <>
      <MenuArchive
        dayNumberForDate={dayNumberForDate}
        todayDayNumber={dayNumberForDate(new Date())}
        onDaily={handleDaily}
        onPractice={handlePractice}
        onSelectDay={handleSelectArchiveDay}
        provincias={provincias}
        provinciaCounts={provinciaCounts}
        onStartCustom={handleStartCustom}
      />
      {menuCopied && <span className="menu-copied">¡Link copiado!</span>}
    </>
  )

  const donatePopup = donatePopupOpen && (
    <div className="modal-backdrop" onClick={() => setDonatePopupOpen(false)}>
      <div className="socials-modal donate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="calendar-modal-header">
          <span>Aguante Messi</span>
          <button type="button" className="calendar-close" onClick={() => setDonatePopupOpen(false)}>
            ✕
          </button>
        </div>
        <img src={donateImg} alt="" className="donate-image" />
        <p className="special-suggest-text">
          Necesito tu ayuda para costear el servidor
          <br />
          <a
            href="https://cafecito.app/poniemangon"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setDonatePopupOpen(false)}
          >
            en este link
          </a>
        </p>
      </div>
    </div>
  )

  const credits = (
    <div className="credits-bar">
      Hecho por{' '}
      <button type="button" className="credits-link" onClick={() => setSocialsOpen(true)}>
        @poniemangon
      </button>{' '}
      - mandame un mensaje si querés que te haga una página o tenés sugerencias
      {' - '}
      ayudame a sostener el proyecto{' '}
      <a
        className="credits-link"
        href="https://cafecito.app/poniemangon"
        target="_blank"
        rel="noopener noreferrer"
      >
        en este link
      </a>
      {socialsOpen && (
        <div className="modal-backdrop" onClick={() => setSocialsOpen(false)}>
          <div className="socials-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-modal-header">
              <span>Mis redes</span>
              <button type="button" className="calendar-close" onClick={() => setSocialsOpen(false)}>
                ✕
              </button>
            </div>
            <a
              className="social-option"
              href="https://x.com/poniemangon"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setSocialsOpen(false)}
            >
              <FontAwesomeIcon icon={faXTwitter} /> Twitter
            </a>
            <a
              className="social-option"
              href="https://www.instagram.com/poniemangon"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setSocialsOpen(false)}
            >
              <FontAwesomeIcon icon={faInstagram} /> Instagram
            </a>
            <a
              className="social-option"
              href="https://cafecito.app/poniemangon"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setSocialsOpen(false)}
            >
              ☕ Cafecito
            </a>
          </div>
        </div>
      )}
    </div>
  )

  if (phase === 'gameOver') {
    return (
      <div className="app">
        <header className="hud">
          <div className="hud-row">
            <span className="round-label">¡Juego terminado!</span>
            {menu}
          </div>
        </header>

        <div className={`map-wrap${scoreOverlayOpen ? ' map-wrap-dimmed' : ''}`}>
          <ResultsMap results={results} clickEnabled={false} onPick={() => {}} />
          {scoreOverlayOpen ? (
            <div className="final-score-overlay">
              <button
                type="button"
                className="final-score-close"
                onClick={() => setScoreOverlayOpen(false)}
              >
                ✕
              </button>
              <span className="final-score-label">Puntaje final</span>
              <span className="final-score-value">{totalScore}</span>
              <span className="final-score-max">/ {MAX_SCORE}</span>
            </div>
          ) : (
            <button
              type="button"
              className="final-score-reopen"
              onClick={() => setScoreOverlayOpen(true)}
            >
              🏆 {totalScore} / {MAX_SCORE}
            </button>
          )}
        </div>

        <footer className="controls controls-gameover">
          <ul className="breakdown">
            {results.map((r, i) => (
              <li key={i}>
                <span className="breakdown-streets">
                  R{i + 1}: {formatEstadio(r.nombre, r.club)}
                </span>
                <span className="breakdown-detail">
                  {Math.round(r.distance)} m — {r.points} pts{r.hard ? ' (x2)' : ''}
                </span>
              </li>
            ))}
          </ul>
          <div className="gameover-actions">
            <button className="primary-btn secondary-btn" onClick={handleShare}>
              {shareCopied ? '¡Copiado!' : 'Compartir resultado'}
            </button>
            <button className="primary-btn" onClick={handleRestart}>
              Jugar de nuevo
            </button>
          </div>
        </footer>
        {donatePopup}
        {credits}
      </div>
    )
  }

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-row">
          <span className="round-label">Ronda {roundIndex + 1} / {TOTAL_ROUNDS}</span>
          {menu}
          <span className="score-label">Puntaje: {totalScore}</span>
        </div>
        <div className="dificultad-banner">
          {DIFICULTAD_LABELS[current.dificultad] ?? current.dificultad}
          {isHardDificultad(current.dificultad) && <span className="hard-badge">×2</span>}
        </div>
        <div className="prompt">
          Encontrá: <strong>{current.nombre}</strong>
          {current.club && (
            <>
              {' '}
              (<strong>{current.club}</strong>)
            </>
          )}
          {current.image_url && !imagePopupOpen && (
            <button type="button" className="special-image-reopen" onClick={() => setImagePopupOpen(true)}>
              👁 Ver imagen
            </button>
          )}
        </div>
      </header>

      {current.image_url && imagePopupOpen && (
        <div className="modal-backdrop" onClick={() => setImagePopupOpen(false)}>
          <div className="special-image-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="calendar-close" onClick={() => setImagePopupOpen(false)}>
              ✕
            </button>
            <img src={current.image_url} alt={current.nombre} />
          </div>
        </div>
      )}

      {donatePopup}

      <div className="map-wrap">
        <ResultsMap results={results} clickEnabled={phase === 'guessing'} onPick={handlePick} />
      </div>

      <footer className="controls">
        {phase === 'guessing' && (
          <span className="hint">Tocá el mapa para marcar dónde creés que está el estadio</span>
        )}
        {phase === 'revealed' && (
          <span className="result">
            Te equivocaste por {Math.round(results[roundIndex].distance)} m — {results[roundIndex].points} pts
            {results[roundIndex].hard ? ' (x2)' : ''}
          </span>
        )}
      </footer>
      {credits}
    </div>
  )
}

export default App
