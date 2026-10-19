// Small checks shared by the course diagrams (src/visuals/diagram.mjs) and the tutor's elements. Each failure
// throws "Invalid <what>: <message>", worded so a model can act on it.

// Text from any JSON value; an object String() can't convert (its own "toString" is data) is no text, so the check
// that follows says what is wrong instead of "Cannot convert object to primitive value".
export const str = value => { try { return value == null ? '' : String(value); } catch { return ''; } };
// A number a model wrote as a string ("2.5") as that number; anything else as it is.
export const numeric = v => typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : v;
export const clip = (value, max) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
const MAX_BYTES = 16_384;

export function checks(what) {
  const fail = message => { throw new Error(`Invalid ${what}: ${message}`); };
  const range = (min, max) => min === -Infinity && max === Infinity ? '' : ` from ${min} to ${max}`;
  return {
    fail,
    num: (value, name, min = -Infinity, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail(`${name} must be a number${range(min, max)}`),
    int: (value, name, min = -Infinity, max = Infinity) => Number.isInteger(value) && value >= min && value <= max ? value : fail(`${name} must be a whole number${range(min, max)}`),
    arr: (value, name, min = 0, max = 64) => Array.isArray(value) && value.length >= min && value.length <= max ? value : fail(`${name} must be a list of ${min} to ${max} items`),
    /** A spec as an object, or as the JSON string a model returns; at most `max` bytes (16 KB) either way. */
    object(value, name = 'spec', max = MAX_BYTES) {
      const over = () => fail(`${name} is over ${Math.round(max / 1024)} KB; make it smaller`);
      if (typeof value === 'string') {
        if (value.length > max) over();
        try { value = JSON.parse(value); } catch { fail(`${name} is not valid JSON`); }
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be a JSON object`);
      if (JSON.stringify(value).length > max) over();
      return value;
    },
  };
}
