import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

// Vista por defecto: Argentina y alrededores (Chile, Uruguay, el extremo sur
// de Brasil) con bastante margen, pero sin llegar a mostrar Brasil entero —
// en vez del recorte a CABA que usaba UbiCABA.
const DEFAULT_BOUNDS = [
  [-83, -58],
  [-33, -25],
]
// Con el continente entero de fondo, el ajuste inicial ya termina mostrando
// bastante de más a los costados (la pantalla es más ancha que alta y el
// continente es angosto y alto) — el límite de paneo tiene que ser más
// ancho que eso, si no lo re-encuadra de golpe apenas termina de cargar.
const MAX_BOUNDS_LNGLAT = [
  [-180, -70],
  [70, 30],
]

// Esri World Imagery: satelital puro (sin calles/límites), sin API key y sin
// cuota — a diferencia de MapTiler no hace falta proxear nada por /api.
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
}

function createDot(bg, border) {
  const el = document.createElement('div')
  el.style.width = '16px'
  el.style.height = '16px'
  el.style.borderRadius = '50%'
  el.style.background = bg
  el.style.border = `2px solid ${border}`
  el.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.2)'
  return el
}

function createActualMarkerEl(label) {
  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.alignItems = 'center'
  wrap.style.gap = '2px'

  const tag = document.createElement('div')
  tag.textContent = label
  tag.className = 'round-tooltip'
  wrap.appendChild(tag)
  wrap.appendChild(createDot('#ef4444', '#b91c1c'))
  return wrap
}

export default function ResultsMap({ results, clickEnabled, onPick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const clickEnabledRef = useRef(clickEnabled)
  const onPickRef = useRef(onPick)
  const [loaded, setLoaded] = useState(false)

  clickEnabledRef.current = clickEnabled
  onPickRef.current = onPick

  useEffect(() => {
    let cancelled = false

    function init() {
      if (cancelled) return

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: SATELLITE_STYLE,
        bounds: DEFAULT_BOUNDS,
        fitBoundsOptions: { padding: 20, animate: false },
        minZoom: 1.5,
        maxZoom: 18,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

      map.on('load', () => {
        if (cancelled) return
        // setMaxBounds recién acá: llamarlo justo después del constructor
        // (antes de que termine de aplicar el bounds/fitBoundsOptions
        // iniciales) lo pisaba y el encuadre quedaba mal.
        map.setMaxBounds(MAX_BOUNDS_LNGLAT)
        map.addSource('guess-lines', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'guess-lines-halo',
          type: 'line',
          source: 'guess-lines',
          paint: { 'line-color': '#000000', 'line-width': 6, 'line-opacity': 0.35, 'line-blur': 1 },
        })
        map.addLayer({
          id: 'guess-lines-layer',
          type: 'line',
          source: 'guess-lines',
          paint: { 'line-color': '#ffffff', 'line-width': 3.5 },
        })
        setLoaded(true)
      })

      map.on('click', (e) => {
        if (!clickEnabledRef.current) return
        onPickRef.current([e.lngLat.lat, e.lngLat.lng])
      })

      mapRef.current = map
    }

    init()

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const features = results.map((r, i) => {
      const guessMarker = new maplibregl.Marker({ element: createDot('#000000', '#ffffff') })
        .setLngLat([r.guess[1], r.guess[0]])
        .addTo(map)
      const actualMarker = new maplibregl.Marker({ element: createActualMarkerEl(`R${i + 1}`), anchor: 'bottom' })
        .setLngLat([r.actual[1], r.actual[0]])
        .addTo(map)
      markersRef.current.push(guessMarker, actualMarker)

      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [r.guess[1], r.guess[0]],
            [r.actual[1], r.actual[0]],
          ],
        },
        properties: {},
      }
    })

    map.getSource('guess-lines')?.setData({ type: 'FeatureCollection', features })
  }, [results, loaded])

  return <div ref={containerRef} className="map" />
}
