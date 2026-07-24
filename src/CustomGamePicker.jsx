import { useMemo, useState } from 'react'

const REGION_BY_PROVINCIA_ID = {
  1: 'Centro', // Buenos Aires (interior)
  2: 'Noroeste', // Catamarca
  3: 'Noreste', // Chaco
  4: 'Sur', // Chubut
  5: 'Centro', // CABA
  6: 'Centro', // Conurbano Bonaerense
  7: 'Centro', // Córdoba
  8: 'Noreste', // Corrientes
  9: 'Centro', // Entre Ríos
  10: 'Noreste', // Formosa
  11: 'Noroeste', // Jujuy
  12: 'Centro', // La Pampa
  13: 'Noroeste', // La Rioja
  14: 'Cuyo', // Mendoza
  15: 'Noreste', // Misiones
  16: 'Sur', // Neuquén
  17: 'Sur', // Río Negro
  18: 'Noroeste', // Salta
  19: 'Cuyo', // San Juan
  20: 'Cuyo', // San Luis
  21: 'Sur', // Santa Cruz
  22: 'Centro', // Santa Fe
  23: 'Noroeste', // Santiago del Estero
  24: 'Sur', // Tierra del Fuego
  25: 'Noroeste', // Tucumán
}
const REGION_ORDER = ['Centro', 'Sur', 'Cuyo', 'Noroeste', 'Noreste']

export default function CustomGamePicker({ provincias, provinciaCounts, onStart, onClose }) {
  const grouped = useMemo(() => {
    const byRegion = new Map(REGION_ORDER.map((r) => [r, []]))
    for (const p of provincias) {
      const region = REGION_BY_PROVINCIA_ID[p.provincia_id]
      byRegion.get(region)?.push(p)
    }
    for (const list of byRegion.values()) {
      list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    }
    return [...byRegion.entries()].filter(([, list]) => list.length > 0)
  }, [provincias])

  const [selected, setSelected] = useState(() => new Set())

  const toggleProvincia = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = selected.size === provincias.length
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(provincias.map((p) => p.provincia_id)))
  }

  const availableCount = provincias.reduce(
    (sum, p) => (selected.has(p.provincia_id) ? sum + (provinciaCounts.get(p.provincia_id) || 0) : sum),
    0,
  )
  const canStart = availableCount >= 5

  return (
    <div className="custom-modal">
      <div className="custom-modal-header">
        <span>Partida personalizada</span>
        <button type="button" className="calendar-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <button type="button" className="deselect-all-btn" onClick={toggleAll}>
        {allSelected ? 'Destildar todas las provincias' : 'Seleccionar todas las provincias'}
      </button>

      <div className="provincias-scroll">
        {grouped.map(([region, list]) => (
          <div key={region} className="region-group">
            <div className="region-label">{region}</div>
            <div className="provincia-chips">
              {list.map((p) => (
                <button
                  type="button"
                  key={p.provincia_id}
                  className={`provincia-chip${selected.has(p.provincia_id) ? ' selected' : ''}`}
                  onClick={() => toggleProvincia(p.provincia_id)}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="primary-btn start-custom-btn" disabled={!canStart} onClick={() => onStart([...selected])}>
        {canStart ? 'Comenzar' : 'Elegí al menos una provincia para comenzar'}
      </button>
    </div>
  )
}
