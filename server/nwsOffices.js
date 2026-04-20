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

export async function getNWSOfficeHandle(lat, lon) {
  const res = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { 'User-Agent': 'QuickReport/1.0 (badbrick602@gmail.com)' },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`NWS API error: ${res.status}`)
  const data = await res.json()
  const cwa = data.properties?.cwa
  if (!cwa) throw new Error('No CWA code returned from NWS')
  // Fall back to the main @NWS account rather than fabricating a handle like @NWSMRX
  return NWS_HANDLES[cwa] ?? '@NWS'
}
