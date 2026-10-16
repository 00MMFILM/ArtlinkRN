// Extract only explicitly labelled passages. Never invent praise or evidence
// from a score, a keyword, or the first sentence of an older response.
export function feedbackHighlights(text) {
  const result = {};
  if (typeof text !== 'string') return result;
  const labels = {
    strength: /^(?:좋았던 점|잘된 점|강점|What worked|Strengths?)\s*[:：]?\s*(.*)$/i,
    evidence: /^(?:관찰 근거|근거|Evidence|Observed evidence)\s*[:：]?\s*(.*)$/i,
    exercise: /^(?:다음 연습|연습 방법|Next exercise|Practice exercise)\s*[:：]?\s*(.*)$/i,
  };
  let section = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^📌\s*/, '').replace(/^[#\s*\-•]+/, '').replace(/\*\*/g, '').trim();
    if (!line) { section = null; continue; }
    let found = false;
    for (const [key, pattern] of Object.entries(labels)) {
      const match = line.match(pattern);
      if (match) { result[key] = match[1].trim(); section = result[key] ? null : key; found = true; break; }
    }
    if (!found && section) {
      // A heading or marker ends the labelled block.
      if (/^#{1,6}\s|^\[\[|^\*\*[^*]+\*\*\s*[:：]?\s*$/.test(raw.trim())) section = null;
      else { result[section] = [result[section], line].filter(Boolean).join(' '); section = null; }
    }
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value).map(([key, value]) => [key, value.slice(0, 600)]));
}

export function nextFeedbackFocus(options, selected) {
  const valid = [...new Set((Array.isArray(options) ? options : []).filter(v => typeof v === 'string' && v.trim()))].slice(0, 3);
  return typeof selected === 'string' && selected.trim() ? selected : valid[0] || null;
}
