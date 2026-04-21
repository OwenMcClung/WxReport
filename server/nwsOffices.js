// Maps NWS County Warning Area (CWA) codes to X (Twitter) handles.
// ⚠️ These handles are best-effort and not all verified — NWS does not
// publish a machine-readable list. Please double-check any handle for your
// region before relying on it in production. Unmapped codes fall back to @NWS.
const NWS_HANDLES = {
  // Alaska
  AFC: '@NWSAnchorage', AFG: '@NWSFairbanks', AJK: '@NWSJuneau',
  // Pacific
  HFO: '@NWSHonolulu', GUM: '@NWSGuam',
  // West
  BYZ: '@NWSBillings', GGW: '@NWSGlasgow', TFX: '@NWSGreatFalls', MSO: '@NWSMissoula',
  BOI: '@NWSBoise', PIH: '@NWSPocatello', PDT: '@NWSPendleton', PQR: '@NWSPortland',
  SEW: '@NWSSeattle', OTX: '@NWSSpokane', MFR: '@NWSMedford',
  EKA: '@NWSEureka', HNX: '@NWSHanford', LOX: '@NWSLosAngeles',
  SGX: '@NWSSanDiego', MTR: '@NWSBayArea', REV: '@NWSReno',
  LKN: '@NWSElko', VEF: '@NWSVegas', PSR: '@NWSPhoenix',
  FGZ: '@NWSFlagstaff', TWC: '@NWSTucson', SLC: '@NWSSaltLakeCity',
  GJT: '@NWSGJT', PUB: '@NWSPueblo', BOU: '@NWSBoulder',
  CYS: '@NWSCheyenne', RIW: '@NWSRiverton', ABQ: '@NWSAlbuquerque',
  EPZ: '@NWSElPaso',
  // Central
  DDC: '@NWSDodgeCity', TOP: '@NWSTopeka', ICT: '@NWSWichita',
  OUN: '@NWSNorman', TSA: '@NWStulsa', SHV: '@NWSShreveport',
  LZK: '@NWSLittleRock', JAN: '@NWSJacksonMS', MOB: '@NWSMobile',
  BMX: '@NWSBirmingham', HUN: '@NWSHuntsville', FFC: '@NWSAtlanta',
  TAE: '@NWSTallahassee', MFL: '@NWSMiami', MLB: '@NWSMelbourne',
  TBW: '@NWSTampaBay', JAX: '@NWSJacksonville',
  // Southeast / East
  CHS: '@NWSCharlestonSC', CAE: '@NWSColumbia', ILM: '@NWSWilmingtonNC',
  RAH: '@NWSRaleigh', AKQ: '@NWSWakefieldVA', LWX: '@NWSBaltWash',
  PHI: '@NWS_MountHolly', OKX: '@NWSNewYorkNY', BOX: '@NWSBoston',
  GYX: '@NWSGray', CAR: '@NWSCaribou', BTV: '@NWSBurlington',
  ALY: '@NWSAlbany', BGM: '@NWSBinghamton', BUF: '@NWSBUFFALO',
  CLE: '@NWSCLE', PBZ: '@NWSPittsburgh', RLX: '@NWSCharlestonWV',
  ILN: '@NWSILN', IND: '@NWSIndianapolis', IWX: '@NWSIWX',
  LOT: '@NWSChicago', MKX: '@NWSMilwaukee', MQT: '@NWSMarquette',
  APX: '@NWSGaylord', DTX: '@NWSDetroit', GRR: '@NWSGrandRapids',
  GRB: '@NWSGreenBay', DLH: '@NWSduluth', MPX: '@NWSTwinCities',
  FGF: '@NWSGrandForks', ABR: '@NWSAberdeen', UNR: '@NWSRapidCity',
  FSD: '@NWSSiouxFalls', OAX: '@NWSOmaha', GID: '@NWSHastings',
  LBF: '@NWSNorthPlatte', DVN: '@NWSQuadCities', DMX: '@NWSDesMoines',
  ARX: '@NWSLaCrosse', EAX: '@NWSKansasCity', SGF: '@NWSSpringfield',
  LSX: '@NWSStLouis', PAH: '@NWSPaducah', OHX: '@NWSNashville',
  MRX: '@NWSMorristown', MEG: '@NWSMemphis', LMK: '@NWSLouisville',
}

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const boundaries = JSON.parse(
  readFileSync(join(__dirname, 'cwaBoundaries.json'), 'utf-8')
)

// Precompute bounding boxes so point-in-polygon only runs against features
// whose bbox contains the point.
const cwaIndex = boundaries.features.map(f => {
  const polygons = f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates]
    : f.geometry.coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const rings of polygons) {
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { cwa: f.properties.CWA, polygons, bbox: [minX, minY, maxX, maxY] }
})

function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

function pointInPolygon(x, y, rings) {
  if (!pointInRing(x, y, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(x, y, rings[i])) return false
  }
  return true
}

function findCWA(lat, lon) {
  for (const { cwa, polygons, bbox } of cwaIndex) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue
    for (const rings of polygons) {
      if (pointInPolygon(lon, lat, rings)) return cwa
    }
  }
  return null
}

export function getNWSOfficeHandle(lat, lon) {
  const cwa = findCWA(lat, lon)
  if (!cwa) return '@NWS'
  // Fall back to the main @NWS account rather than fabricating a handle like @NWSMRX
  return NWS_HANDLES[cwa] ?? '@NWS'
}
