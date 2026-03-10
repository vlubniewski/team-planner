const supabase = createClient(
  "https://xhtzvzquzqguqrxaetyz.supabase.co",
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('assignments').select('*');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { assignments } = req.body;
    if (!assignments) return res.status(400).json({ error: 'No assignments provided' });

    // Upsert all current assignments
    const rows = assignments.map(a => ({
      id: a.id,
      title: a.title,
      member_id: a.memberId,
      start_key: a.startKey ?? null,
      duration_days: a.durationDays ?? null,
      from_jira: a.fromJira ?? false,
      jira_key: a.jiraKey ?? null,
      status: a.status ?? null,
      due_date_key: a.dueDateKey ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from('assignments')
      .upsert(rows, { onConflict: 'id' });
    if (upsertErr) return res.status(500).json({ error: upsertErr.message });

    // Delete any rows not in the current list
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      await supabase.from('assignments').delete().not('id', 'in', `(${ids.map(i => `"${i}"`).join(',')})`);
    } else {
      await supabase.from('assignments').delete().neq('id', '');
    }

    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}