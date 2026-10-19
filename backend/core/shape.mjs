import { AppError } from './errors.mjs';

// A small schema language used two ways: validate(schema, value) checks provider output and
// request bodies; jsonSchema(schema) produces a strict JSON Schema for model structured output.

export const s = {
  string: ({ min = 0, max = 100_000, pattern } = {}) => ({ t: 'string', min, max, pattern }),
  number: ({ min = -Infinity, max = Infinity } = {}) => ({ t: 'number', min, max }),
  int: ({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => ({ t: 'int', min, max }),
  fraction: () => ({ t: 'number', min: 0, max: 1 }),
  displayIndex: () => ({ t: 'number', min: 0, max: 100 }),
  bool: () => ({ t: 'bool' }),
  enum: values => ({ t: 'enum', values }),
  array: (item, { min = 0, max = 10_000 } = {}) => ({ t: 'array', item, min, max }),
  object: (props, { optional = [] } = {}) => ({ t: 'object', props, optional }),
  nullable: inner => ({ t: 'nullable', inner }),
  json: () => ({ t: 'json' }),
  literal: value => ({ t: 'enum', values: [value] }),
};

function check(schema, value, path, errors) {
  switch (schema.t) {
    case 'nullable': if (value !== null) check(schema.inner, value, path, errors); return;
    case 'json': if (value === undefined) errors.push(`${path}: required`); return;
    case 'string':
      if (typeof value !== 'string') { errors.push(`${path}: expected string`); return; }
      if (value.length < schema.min || value.length > schema.max) errors.push(`${path}: length must be ${schema.min}..${schema.max}`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: invalid format`);
      return;
    case 'number': case 'int':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.t === 'int' && !Number.isInteger(value))) { errors.push(`${path}: expected ${schema.t === 'int' ? 'integer' : 'finite number'}`); return; }
      if (value < schema.min || value > schema.max) errors.push(`${path}: must be within ${schema.min}..${schema.max}`);
      return;
    case 'bool': if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`); return;
    case 'enum': if (!schema.values.includes(value)) errors.push(`${path}: must be one of ${schema.values.join(', ')}`); return;
    case 'array':
      if (!Array.isArray(value)) { errors.push(`${path}: expected array`); return; }
      if (value.length < schema.min || value.length > schema.max) errors.push(`${path}: must have ${schema.min}..${schema.max} items`);
      value.forEach((item, i) => check(schema.item, item, `${path}[${i}]`, errors));
      return;
    case 'object':
      if (value === null || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path}: expected object`); return; }
      for (const [key, inner] of Object.entries(schema.props)) {
        if (value[key] === undefined) { if (!schema.optional.includes(key)) errors.push(`${path}.${key}: required`); continue; }
        check(inner, value[key], `${path}.${key}`, errors);
      }
      for (const key of Object.keys(value)) if (!(key in schema.props)) errors.push(`${path}.${key}: unexpected field`);
      return;
    default: throw new Error(`Unknown schema type ${schema.t}`);
  }
}

/** Returns a list of problems; empty means valid. */
export function problems(schema, value, path = '$') {
  const errors = [];
  check(schema, value, path, errors);
  return errors;
}

/** Throws invalid_input (or the given code) with the first problems listed. */
export function validate(schema, value, { code = 'invalid_input', what = 'input' } = {}) {
  const errors = problems(schema, value);
  if (errors.length) throw new AppError(code, `Invalid ${what}: ${errors.slice(0, 5).join('; ')}`, { details: errors });
  return value;
}

/** Strict JSON Schema for model output: every property required, nullable as a type union. */
export function jsonSchema(schema) {
  switch (schema.t) {
    case 'nullable': {
      const inner = jsonSchema(schema.inner);
      if (inner.type && typeof inner.type === 'string' && !inner.enum) return { ...inner, type: [inner.type, 'null'] };
      return { anyOf: [inner, { type: 'null' }] };
    }
    case 'json': return { type: 'string', description: 'JSON-encoded value' };
    case 'string': return { type: 'string', ...(schema.max < 100_000 ? { maxLength: schema.max } : {}) };
    case 'number': return { type: 'number' };
    case 'int': return { type: 'integer' };
    case 'bool': return { type: 'boolean' };
    case 'enum': return { type: typeof schema.values[0] === 'number' ? 'number' : 'string', enum: schema.values };
    case 'array': return { type: 'array', items: jsonSchema(schema.item) };
    case 'object': return { type: 'object', additionalProperties: false, required: Object.keys(schema.props), properties: Object.fromEntries(Object.entries(schema.props).map(([k, v]) => [k, jsonSchema(schema.optional.includes(k) ? s.nullable(v) : v)])) };
    default: throw new Error(`Unknown schema type ${schema.t}`);
  }
}

/** Model output uses null for optional fields; drop them so validate() sees them as absent. */
export function stripNulls(schema, value) {
  if (value === null || value === undefined) return value;
  if (schema.t === 'nullable') return stripNulls(schema.inner, value);
  if (schema.t === 'array' && Array.isArray(value)) return value.map(v => stripNulls(schema.item, v));
  if (schema.t === 'object' && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null && schema.optional.includes(k)) continue;
      out[k] = schema.props[k] ? stripNulls(schema.props[k], v) : v;
    }
    return out;
  }
  return value;
}
