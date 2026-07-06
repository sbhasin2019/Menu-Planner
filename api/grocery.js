import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

let ready = false;
async function ensure() {
  if (ready) return;
  await sql`create table if not exists grocery (
    house text primary key,
    items jsonb,
    updated_at timestamptz default now()
  )`;
  ready = true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensure();
    const house = (req.query.house || (req.body && req.body.house) || '').toString().trim().toLowerCase();
    if (!house) return res.status(400).json({ error: 'house required' });

    if (req.method === 'GET') {
      const rows = await sql`select items, updated_at from grocery where house = ${house}`;
      if (!rows.length) return res.status(200).json({ items: null, updated_at: null });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'POST') {
      // Grocery is shared: both owner and cook may write. No secret required.
      const { items } = req.body || {};
      await sql`
        insert into grocery (house, items, updated_at)
        values (${house}, ${JSON.stringify(items)}, now())
        on conflict (house) do update
          set items = excluded.items, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
