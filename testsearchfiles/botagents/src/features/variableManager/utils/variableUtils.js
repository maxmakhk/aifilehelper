import { parseMaybeJson } from './jsonUtils';

export const getSingleFieldValue = (variable, fieldKey) => {
  if (!fieldKey) return null;
  if (variable && variable[fieldKey] !== undefined) return variable[fieldKey];
  const desc = parseMaybeJson(variable?.description);
  if (desc && typeof desc === 'object' && !Array.isArray(desc) && desc[fieldKey] !== undefined) {
    return desc[fieldKey];
  }
  return null;
};

export const renderSignalSummary = (signal) => {
  if (!signal || typeof signal !== 'object') return '-';
  const entries = Object.entries(signal);
  if (entries.length === 0) return '-';
  return entries
    .map(([name, data]) => {
      if (!data || typeof data !== 'object') return name;
      const parts = [];
      if (data.status) parts.push(`status:${data.status}`);
      if (data.weight !== undefined) parts.push(`weight:${data.weight}`);
      if (data.source) parts.push(`source:${data.source}`);
      return parts.length ? `${name} (${parts.join(', ')})` : name;
    })
    .join(' | ');
};

export const extractKeywords = (text) => {
  const stopwords = new Set([
    'the','a','an','and','or','but','if','then','else','when','where','what','which','who','whom','this','that','these','those',
    'is','are','was','were','be','been','being','to','of','in','on','for','with','as','by','at','from','into','about','over','after','before',
    'add','update','delete','push','set','change','make','create','remove','increase','decrease'
  ]);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => word.length > 2 && !stopwords.has(word));
};

export const findRelatedVariables = (allVars, keywords, limit = 5) => {
  if (!keywords.length) return [];
  const scored = allVars
    .map((v) => {
      const haystack = [v.name, v.description, ...(v.tag || [])]
        .join(' ')
        .toLowerCase();
      const score = keywords.reduce((acc, kw) => (haystack.includes(kw) ? acc + 1 : acc), 0);
      return { v, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.v);
  return scored;
};
