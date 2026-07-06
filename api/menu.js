import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Ensures the table exists (cheap no-op after first call).
let ready = false;
async function ensure() {
  if (ready) return;
  await sql`create table if not exists menu (
    house text primary key,
    plan jsonb,
    locked boolean default false,
    updated_at timestamptz default now()
  )`;
  ready = true;
}

export default async function handler(req, res) {
  // CORS so the app works whether opened on the Vercel domain or added to home screen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-owner-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensure();
    const house = (req.query.house || (req.body && req.body.house) || '').toString().trim().toLowerCase();
    if (!house) return res.status(400).json({ error: 'house required' });

    if (req.method === 'GET') {
      const rows = await sql`select plan, locked, updated_at from menu where house = ${house}`;
      if (!rows.length) return res.status(200).json({ plan: null, locked: false, updated_at: null });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'POST') {
      // Only the owner (who holds the secret) may publish a menu.
      const key = req.headers['x-owner-key'] || '';
      if (!process.env.OWNER_KEY || key !== process.env.OWNER_KEY) {
        return res.status(403).json({ error: 'not owner' });
      }
      const { plan, locked } = req.body || {};
      await sql`
        insert into menu (house, plan, locked, updated_at)
        values (${house}, ${JSON.stringify(plan)}, ${!!locked}, now())
        on conflict (house) do update
          set plan = excluded.plan, locked = excluded.locked, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
