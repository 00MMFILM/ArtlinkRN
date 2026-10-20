export function reviewRange(start, end, duration) {
  if (String(start).trim() === "" || String(end).trim() === "") return null;
  const a = Number(start), b = Number(end), d = Number(duration);
  if (![a, b, d].every(Number.isFinite) || a < 0 || b <= a || b > d || d <= 0) return null;
  return { start: Math.round(a * 1000), end: Math.round(b * 1000) };
}

export function reviewNotes(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).filter(n => n && typeof n.id === "string" && typeof n.body === "string" && n.body.trim())
    .map(n => ({
      id: n.id.slice(0, 100), body: n.body.trim().slice(0, 1000),
      label: typeof n.label === "string" ? n.label.slice(0, 400) : "",
      resolved: n.resolved === true,
    }));
}

export function paragraphDiff(before, after) {
  if (String(before || "").length > 20000 || String(after || "").length > 20000) return null;
  const a = String(before || "").split("\n");
  const b = String(after || "").slice(0, 20000).split("\n");
  if (a.length > 400 || b.length > 400 || a.length * b.length > 160000) return null;
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const rows = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) rows.push({ kind: "same", text: a[i++], line: ++j });
    else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) rows.push({ kind: "add", text: b[j], line: ++j });
    else rows.push({ kind: "remove", text: a[i], line: ++i });
  }
  return rows;
}

export function audioAttachments(note) {
  return [...(note?.voiceRecordings || []), ...(note?.audioFiles || [])]
    .filter(item => item && typeof item.uri === "string" && item.uri);
}
