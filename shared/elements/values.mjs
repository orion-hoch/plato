// Values on an element, shared by the registry, the task layer and every kind (shared/elements/registry.mjs): what a
// learner says read as values, and equality that knows 0x24 is 36. Pure.
const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const NUMBER = /(?<![\w.])-?\s?(?:0x[0-9a-f]+|0b[01]+|\d+(?:\.\d+)?(?:e-?\d+)?)(?![\w.])/gi;
/** A value as one canonical string: integers in any base as decimal ("0x24" → "36"), other numbers as JS writes them, words lower-cased. */
export function canon(value) {
  const t = String(value ?? '').trim().toLowerCase().replace(/[−–]/g, '-').replace(/\s+/g, ' ');
  if (/^-?0x[0-9a-f]+$/.test(t)) return String((t.startsWith('-') ? -1n : 1n) * BigInt(t.replace('-', '')));
  if (/^-?0b[01]+$/.test(t)) return String((t.startsWith('-') ? -1n : 1n) * BigInt(t.replace('-', '')));
  if (/^-?\d+$/.test(t)) return String(BigInt(t));
  if (/^-?\d*\.?\d+(e-?\d+)?$/.test(t) && Number.isFinite(+t)) return String(+t);
  return { true: '1', high: '1', on: '1', false: '0', low: '0', off: '0' }[t] ?? t;
}
/** Two values the same, by meaning: numbers within `tolerance` (absolute), else canonical text. */
export function same(a, b, tolerance = 0) {
  const x = canon(a), y = canon(b);
  if (x === y) return true;
  // A full 64-bit register word is how the machine writes a negative number: 0xffffffffffffff9c is -100. Only that width:
  // a shorter word is ambiguous (0x9c is 156 from lbu), and telling those apart is often the point.
  const signed = (hex, n) => { const m = /^0x([0-9a-f]{16})$/i.exec(String(hex ?? '').trim()); return m && /^-\d+$/.test(n) && BigInt.asIntN(64, BigInt(`0x${m[1]}`)) === BigInt(n); };
  if (signed(a, y) || signed(b, x)) return true;
  return tolerance > 0 && Number.isFinite(+x) && Number.isFinite(+y) && x !== '' && y !== '' && Math.abs(+x - +y) <= tolerance;
}
/** The values a sentence states, in order, as said: numbers in any base ("minus five" is -5, "0x1F" stays), and 0/1 said as words. */
// `logic`: read on/off, high/low, true/false as 1/0. Only where they can be a value (a short reply, or right after a name):
// in a sentence they are words ("can we work on pointers?" holds no 1).
export function readValues(text, { logic = true } = {}) {
  let t = ` ${String(text ?? '').toLowerCase().replace(/[−–]/g, '-')} `.replace(/\b(minus|negative)\s+/g, '-')
    .replace(new RegExp(`\\b(${Object.keys(WORDS).join('|')})\\b`, 'g'), w => WORDS[w]);
  if (logic) t = t.replace(/\b(true|high|on)\b/g, '1').replace(/\b(false|low|off)\b/g, '0');
  return (t.match(NUMBER) || []).map(v => v.replace(/\s/g, ''));
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SAID_VALUE = `\\s*(?:is|=|:|will be|would be|becomes|should be|holds|has|gets|equals|stays|goes to|to)?\\s*(?:still\\s+)?((?:minus |negative )?(?:-?\\s?(?:0x[0-9a-f]+|0b[01]+|\\d+(?:\\.\\d+)?)|${Object.keys(WORDS).join('|')})|true|false|high|low|on|off)(?![\\w.])`;
/** A prediction for `names` from what the learner said: "ra is 0x24", "Q will be 1", else bare values in order. */
export function predictionFrom(text, names, parse = null) {
  if (parse) return parse(text, names);
  let rest = String(text ?? '');
  const values = {};
  for (const name of names) {
    const m = new RegExp(`(?<!\\w)${escape(name)}(?!\\w)${SAID_VALUE}`, 'i').exec(rest), v = m && readValues(m[1])[0];
    if (v !== undefined && v !== null) { values[name] = v; rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`; }
  }
  const loose = readValues(rest, { logic: (String(text ?? '').match(/\S+/g) || []).length <= 3 });
  names.filter(name => !(name in values)).forEach((name, i) => { if (loose[i] !== undefined) values[name] = loose[i]; });
  return { values, parsed: Object.keys(values).length > 0 };
}
/** Prediction against truth, name by name: [{ name, predicted, actual, match }]. */
export const diffValues = (predicted, actual, names, tolerance = 0) => names.map(name => ({ name, predicted: predicted?.[name] ?? null, actual: actual?.[name] ?? null,
  match: predicted?.[name] != null && actual?.[name] != null && same(predicted[name], actual[name], tolerance) }));
/** The default check: every named target value is what the element now holds; the first that isn't is the failure. */
export function checkValues(state, target, values) {
  const now = values(state), miss = Object.entries(target?.values || target || {}).find(([name, v]) => !same(now[name], v));
  return { pass: !miss, firstFailure: miss ? `${miss[0]} is ${now[miss[0]] ?? 'not set'}, not ${miss[1]}` : null };
}

