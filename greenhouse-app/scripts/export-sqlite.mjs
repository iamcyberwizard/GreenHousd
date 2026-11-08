// Exports the old Express-era database (data/greenhouse.db) as SQL for D1:
//   node scripts/export-sqlite.mjs > data/import.sql
//   npx wrangler d1 execute greenhouse --remote --file data/import.sql
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(process.argv[2] ?? 'data/greenhouse.db', { readOnly: true })
const quote = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`)

const columns = {
  settings: ['key', 'value'],
  rooms: ['id', 'number', 'tenant', 'rent', 'meter_start'],
  bills: ['id', 'room_id', 'month', 'meter_prev', 'meter_curr', 'electric_rate', 'water', 'rent', 'extras', 'paid', 'updated_at'],
}

// Replace everything so the import can be re-run safely.
console.log('DELETE FROM bills;\nDELETE FROM rooms;')
for (const [table, cols] of Object.entries(columns)) {
  for (const row of db.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all()) {
    console.log(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => quote(row[c])).join(', ')});`)
  }
}
