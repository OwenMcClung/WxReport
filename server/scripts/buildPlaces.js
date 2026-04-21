// One-off build script: turns the GNIS DomesticNames_National.txt into a
// compact JSON file the server loads at startup.
//
// Input:  path to DomesticNames_National.txt (pipe-delimited, ~190k Populated Places)
// Output: server/usPlaces.json — array of [name, stateCode, lat, lon]
//
// Usage: node server/scripts/buildPlaces.js <path-to-DomesticNames_National.txt>

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const STATES = {
  'Alabama':'AL','Alaska':'AK','American Samoa':'AS','Arizona':'AZ','Arkansas':'AR',
  'California':'CA','Colorado':'CO','Commonwealth of the Northern Mariana Islands':'MP',
  'Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL',
  'Georgia':'GA','Guam':'GU','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN',
  'Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
  'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
  'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
  'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Puerto Rico':'PR','Rhode Island':'RI',
  'South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX',
  'U.S. Minor Outlying Islands':'UM','United States Virgin Islands':'VI','Utah':'UT',
  'Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI',
  'Wyoming':'WY',
}

const input = process.argv[2]
if (!input) {
  console.error('Usage: node buildPlaces.js <DomesticNames_National.txt>')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = join(__dirname, '..', 'usPlaces.json')

const text = readFileSync(input, 'utf-8')
const lines = text.split('\n')
const places = []
let skipped = 0

for (let i = 1; i < lines.length; i++) {
  const line = lines[i]
  if (!line) continue
  const f = line.split('|')
  if (f[2] !== 'Populated Place') continue
  const name = f[1]
  const state = STATES[f[3]]
  const lat = Number(f[15])
  const lon = Number(f[16])
  if (!name || !state || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    skipped++
    continue
  }
  places.push([name, state, Math.round(lat * 10000) / 10000, Math.round(lon * 10000) / 10000])
}

writeFileSync(out, JSON.stringify(places))
console.log(`Wrote ${places.length} places (skipped ${skipped}) to ${out}`)
