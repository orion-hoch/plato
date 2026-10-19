// A step-through of a short program (CS 3410: C, and RISC-V assembly with its calling convention). RISC-V steps
// are computed here by a small RV64 interpreter, the same on the server (which rejects a program it cannot run)
// and in the page (src/elements/Trace.jsx): the model never writes a register value. It is a bounded data VM
// (≤ 200 instructions, ≤ 24 memory cells), not host code.
// ponytail: C steps are the model's own, checked only for shape; interpret a small C subset if they prove unreliable.
import { checks, str, clip } from './check.mjs';

const { fail, int, arr, object } = checks('trace');
const ABI = 'zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6'.split(' ');
/** A register's number from x0…x31, its ABI name or fp (s0); -1 when it is not a register. */
const register = name => { const n = str(name).trim().toLowerCase(); return n === 'fp' ? 8 : /^x([12]?\d|3[01])$/.test(n) ? Number(n.slice(1)) : ABI.indexOf(n); };
const wrap = v => BigInt.asIntN(64, v), u64 = v => BigInt.asUintN(64, v), w32 = v => BigInt.asIntN(32, v), MIN = -(2n ** 63n);
const STACK_TOP = 0x8000n, MAX_STEPS = 200, MAX_CELLS = 24;
/** A value as the student reads it: hex when it came from hex (an address, a mask), else signed decimal. */
const show = (v, hex, bits = 64) => hex ? `0x${BigInt.asUintN(bits, v).toString(16)}` : BigInt.asIntN(bits, v).toString();
/** An integer as written in JSON or assembly (decimal, 0x hex, 0b binary): { v, hex }, or null. */
function integer(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { v: BigInt(value), hex: false } : null;
  const m = /^([+-]?)(0x[\da-f]+|0b[01]+|\d+)$/i.exec(str(value).trim());
  return m && { v: (m[1] === '-' ? -1n : 1n) * BigInt(m[2]), hex: /^0x/i.test(m[2]) };
}

const ALU = {
  add: (a, b) => a + b, sub: (a, b) => a - b, and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b,
  sll: (a, b) => a << (b & 63n), srl: (a, b) => u64(a) >> (b & 63n), sra: (a, b) => a >> (b & 63n),
  slt: (a, b) => BigInt(a < b), sltu: (a, b) => BigInt(u64(a) < u64(b)),
  mul: (a, b) => a * b, div: (a, b) => !b ? -1n : a === MIN && b === -1n ? MIN : a / b, divu: (a, b) => !b ? -1n : u64(a) / u64(b),
  rem: (a, b) => !b ? a : a === MIN && b === -1n ? 0n : a % b, remu: (a, b) => !b ? a : u64(a) % u64(b),
  addw: (a, b) => w32(a + b), subw: (a, b) => w32(a - b), mulw: (a, b) => w32(a * b),
  sllw: (a, b) => w32(a << (b & 31n)), srlw: (a, b) => w32(BigInt.asUintN(32, a) >> (b & 31n)), sraw: (a, b) => w32(w32(a) >> (b & 31n)),
};
const IMMEDIATE = { addi: 'add', andi: 'and', ori: 'or', xori: 'xor', slti: 'slt', sltiu: 'sltu', addiw: 'addw', slli: 'sll', srli: 'srl', srai: 'sra', slliw: 'sllw', srliw: 'srlw', sraiw: 'sraw' };
const UNARY = { mv: a => a, not: a => ~a, neg: a => -a, negw: a => w32(-a), 'sext.w': a => w32(a), seqz: a => BigInt(a === 0n), snez: a => BigInt(a !== 0n), sltz: a => BigInt(a < 0n), sgtz: a => BigInt(a > 0n) };
const LOAD = { ld: [8, true], lw: [4, true], lwu: [4, false], lh: [2, true], lhu: [2, false], lb: [1, true], lbu: [1, false] };
const STORE = { sd: 8, sw: 4, sh: 2, sb: 1 };
const BRANCH = { beq: (a, b) => a === b, bne: (a, b) => a !== b, blt: (a, b) => a < b, bge: (a, b) => a >= b, bltu: (a, b) => u64(a) < u64(b), bgeu: (a, b) => u64(a) >= u64(b), bgt: (a, b) => a > b, ble: (a, b) => a <= b, bgtu: (a, b) => u64(a) > u64(b), bleu: (a, b) => u64(a) <= u64(b) };
const AGAINST_ZERO = { beqz: 'beq', bnez: 'bne', bltz: 'blt', bgez: 'bge', bgtz: 'bgt', blez: 'ble' };
// Each instruction: its operand shapes (d rd, s rs1, t rs2, i 12-bit immediate, h/w shift amounts, u 20-bit
// immediate, n any constant, m offset(base), l label or address) and what it does.
const OPS = {
  ...Object.fromEntries(Object.entries(ALU).map(([op, f]) => [op, { sigs: ['dst'], run: 'alu', f }])),
  ...Object.fromEntries(Object.entries(IMMEDIATE).map(([op, base]) => [op, { sigs: [/^s[lr][la]iw$/.test(op) ? 'dsw' : /^s[lr][la]i$/.test(op) ? 'dsh' : 'dsi'], run: 'alu', f: ALU[base] }])),
  ...Object.fromEntries(Object.entries(UNARY).map(([op, f]) => [op, { sigs: ['ds'], run: 'unary', f }])),
  ...Object.fromEntries(Object.entries(LOAD).map(([op, [size, signed]]) => [op, { sigs: ['dm'], run: 'load', size, signed }])),
  ...Object.fromEntries(Object.entries(STORE).map(([op, size]) => [op, { sigs: ['tm'], run: 'store', size }])),
  ...Object.fromEntries(Object.entries(BRANCH).map(([op, f]) => [op, { sigs: ['stl'], run: 'branch', f }])),
  ...Object.fromEntries(Object.entries(AGAINST_ZERO).map(([op, base]) => [op, { sigs: ['sl'], run: 'branch', f: BRANCH[base] }])),
  li: { sigs: ['dn'], run: 'li' }, lui: { sigs: ['du'], run: 'lui' }, auipc: { sigs: ['du'], run: 'auipc' },
  jal: { sigs: ['l', 'dl'], run: 'jal' }, j: { sigs: ['l'], run: 'jal', link: 0 }, call: { sigs: ['l'], run: 'jal', link: 1 }, tail: { sigs: ['l'], run: 'jal', link: 0 },
  jalr: { sigs: ['s', 'dm', 'dsi'], run: 'jalr' }, jr: { sigs: ['s'], run: 'jalr', link: 0 }, ret: { sigs: [''], run: 'ret' },
  nop: { sigs: [''], run: 'nop' }, ecall: { sigs: [''], run: 'stop' }, ebreak: { sigs: [''], run: 'stop' },
};
const RANGE = { i: [-2048n, 2047n], h: [0n, 63n], w: [0n, 31n], u: [-524288n, 1048575n], n: [MIN, 2n ** 64n - 1n] };
const IGNORED = /^\.(text|globl|global|align|p2align|balign|type|size|section|file|option|attribute|ident|local|weak|cfi_\w+)$/;

export const purpose = 'a step-through of a short RISC-V or C program: the line about to run, the registers or variables to watch, and memory (the stack and arrays), one step at a time';

export const example = {
  lang: 'riscv',
  code: 'sum:              # a0 = address of the array, a1 = its length\n  li   t0, 0\nloop:\n  beqz a1, done\n  lw   t1, 0(a0)\n  add  t0, t0, t1\n  addi a0, a0, 4\n  addi a1, a1, -1\n  j    loop\ndone:\n  mv   a0, t0\n  ret',
  watch: ['a0', 'a1', 't0', 't1'],
  init: { regs: { a0: '0x1000', a1: 3 }, memory: [{ address: '0x1000', value: 5, label: 'arr[0]' }, { address: '0x1004', value: -2, label: 'arr[1]' }, { address: '0x1008', value: 9, label: 'arr[2]' }] },
};

export const rules = `spec: {"lang", "code", "watch", "init", "steps"}:
- lang: "riscv" (64-bit RISC-V assembly) or "c".
- code: the program as the student should read it, at most 40 lines and 2000 characters.
For riscv, never write steps or register values: a simulator runs the code and computes every step. It starts at the label main (else the first instruction) with every register 0 except sp (0x8000) and ra (the address just past the code, so a final ret ends the run), and stops at the end of the code, at ecall, or on that ret; at most ${MAX_STEPS} instructions. Instruction i sits at address 4*i.
- A checkpoint "line N" waits just before line N runs: to have them predict what an instruction does, put it at that instruction's line, so its effect is not on the page yet.
- watch: the registers to show at each step, up to 8, as the code names them (a0, sp, t1, x5); default: the registers the code writes.
- init: optional starting values: {"regs": {"a0": "0x1000", "a1": 3}, "memory": [{"address": "0x1000", "value": 5, "label": "arr[0]"}]} (at most 16 cells; place an array's cells at their real spacing, 4 bytes apart for int). A value written "0x…" is shown in hex. Write a raw byte or word of memory in hex ("0x9c", "0x0000ffff"): that is how memory holds it, and the page shows it as written. Write it in decimal only when the case is about decimal values (an array of ints the program adds up).
- Supported: add sub and or xor sll srl sra slt sltu mul div divu rem remu, their immediate forms (addi andi ori xori slli srli srai slti sltiu), the w forms (addw addiw subw mulw sllw slliw srlw srliw sraw sraiw), lui auipc, ld lw lwu lh lhu lb lbu sd sw sh sb, beq bne blt bge bltu bgeu, jal jalr, and the pseudo-instructions li mv not neg seqz snez beqz bnez bltz bgez bgtz blez bgt ble bgtu bleu j jr call tail ret nop ecall. Immediates must fit (addi takes -2048 to 2047; use li for a larger constant). Labels end in ":"; comments start with #. There is no data section: put data in init.memory and its address in a register. Memory shows the cells the program touches (${MAX_CELLS} at most).
For c, write steps: the trace, at most 40: [{"line": n, "note": "...", "vars": [{"name", "value"}], "memory": [{"address", "value", "label"}], "pointers": [{"at": row, "label"}]}]. Each step is the moment just before line n runs: vars hold the variables' values then (as text: "5", "0x7ff0", "?" while unset), memory the cells to draw (top row first, at most 16), pointers arrows at memory rows by index. note: at most 120 characters, optional. Every value must be exactly what the program computes; prefer riscv when the point is the machine.
Example: ${JSON.stringify(example)}`;

export function validate(input) {
  const raw = object(input);
  if (raw.lang !== 'riscv' && raw.lang !== 'c') fail('lang must be "riscv" or "c"');
  const code = str(raw.code).replace(/\r\n?/g, '\n').replace(/\s+$/, ''), lines = code.split('\n');
  if (!code.trim()) fail('code is empty');
  if (code.length > 2000 || lines.length > 40) fail('code must be at most 40 lines and 2000 characters');
  if (raw.lang === 'c') {
    const steps = arr(raw.steps, 'steps', 1, 40).map((s, i) => {
      const at = `steps[${i}]`;
      if (!s || typeof s !== 'object') fail(`${at} must be an object like {"line": 3, "vars": [{"name": "x", "value": "5"}]}`);
      const memory = (s.memory == null ? [] : arr(s.memory, `${at}.memory`, 0, 16)).map(c => ({ address: clip(str(c?.address).trim(), 18), value: clip(str(c?.value).trim(), 20), label: clip(str(c?.label).trim(), 24) }));
      const pointers = (s.pointers == null ? [] : arr(s.pointers, `${at}.pointers`, 0, 8)).map((p, k) => memory.length ? { at: int(p?.at, `${at}.pointers[${k}].at`, 0, memory.length - 1), label: clip(str(p.label).trim(), 12) } : fail(`${at}.pointers point at memory rows, but the step has no memory`));
      const vars = (s.vars == null ? [] : arr(s.vars, `${at}.vars`, 0, 8)).map((v, k) => ({ name: clip(str(v?.name).trim(), 24) || fail(`${at}.vars[${k}] needs a name`), value: clip(str(v.value).trim(), 24) }));
      return { line: int(s.line, `${at}.line`, 1, lines.length), note: clip(str(s.note).trim(), 120), vars, memory, pointers };
    });
    return { lang: 'c', code, steps };
  }
  const init = raw.init ?? {}, given = init.regs ?? {};
  if (typeof init !== 'object' || Array.isArray(init) || typeof given !== 'object' || Array.isArray(given)) fail('init must look like {"regs": {"a0": 5}, "memory": [{"address": "0x1000", "value": 7}]}');
  const watch = (raw.watch == null ? [] : arr(raw.watch, 'watch', 0, 8)).map(name => register(name) >= 0 ? str(name).trim() : fail(`watch: ${JSON.stringify(name)} is not a register; use names like a0, sp, t1 or x5`));
  const regs = Object.fromEntries(Object.entries(given).map(([name, value]) => {
    if (register(name) <= 0) fail(`init.regs: ${JSON.stringify(name)} is not a register that can be set`);
    if (!integer(value)) fail(`init.regs.${name} must be an integer or a "0x…" string`);
    return [name.trim(), str(value).trim()];
  }));
  const seen = new Set();
  const memory = (init.memory == null ? [] : arr(init.memory, 'init.memory', 0, 16)).map((c, i) => {
    const at = `init.memory[${i}]`, address = integer(c?.address);
    if (!address || address.v < 0n) fail(`${at}.address must be a non-negative integer or "0x…" string`);
    if (seen.has(address.v)) fail(`${at}: two cells at address ${c.address}`);
    seen.add(address.v);
    if (!integer(c.value)) fail(`${at}.value must be an integer or a "0x…" string`);
    return { address: str(c.address).trim(), value: str(c.value).trim(), label: clip(str(c.label).trim(), 24) };
  });
  const spec = { lang: 'riscv', code, watch, init: { regs, memory } };
  run(spec); // it must assemble, and finish within bounds
  return spec;
}

function assemble(code) {
  const program = [], labels = new Map();
  code.split('\n').forEach((text, i) => {
    const line = i + 1, at = `line ${line}`;
    for (let statement of text.replace(/(#|\/\/).*/, '').split(';')) {
      statement = statement.trim();
      for (let m; (m = /^([A-Za-z_.$][\w.$]*)\s*:\s*/.exec(statement)); statement = statement.slice(m[0].length)) {
        if (labels.has(m[1])) fail(`${at}: the label ${m[1]} is defined twice`);
        labels.set(m[1], program.length);
      }
      if (!statement) continue;
      const [word, ...rest] = statement.split(/\s+/), op = word.toLowerCase(), def = Object.hasOwn(OPS, op) ? OPS[op] : undefined;
      if (op.startsWith('.')) { if (IGNORED.test(op)) continue; fail(`${at}: ${word} is not supported; there is no data section, so put data in init.memory and its address in a register`); }
      if (!def) fail(`${at}: ${word} is not supported; use the RV64I instructions (with mul, div, rem) and common pseudo-instructions listed`);
      const args = rest.join(' ').split(',').map(a => a.trim()).filter(Boolean), sig = def.sigs.find(s => s.length === args.length);
      if (sig === undefined) fail(`${at}: ${op} takes ${def.sigs.map(s => s.length).join(' or ')} operands, not ${args.length}`);
      const ops = {};
      [...sig].forEach((kind, k) => {
        const arg = args[k];
        if ('dst'.includes(kind)) { ops[kind] = register(arg); if (ops[kind] < 0) fail(`${at}: ${JSON.stringify(arg)} is not a register`); if (kind === 't') ops.named = arg; }
        else if (kind === 'm') {
          const m = /^(.*?)\(\s*(\w+)\s*\)$/.exec(arg);
          if (!m || register(m[2]) < 0) fail(`${at}: write the address as offset(register), like 8(sp), not ${JSON.stringify(arg)}`);
          ops.s = register(m[2]); ops.i = m[1].trim() ? immediate(m[1], at, op, 'i') : { v: 0n, hex: false };
        } else if (kind === 'l') ops.l = arg;
        else ops.i = immediate(arg, at, op, kind);
      });
      program.push({ line, at, def, ops });
    }
  });
  if (!program.length) fail('code has no instructions');
  for (const { ops, at } of program) if (ops.l !== undefined) {
    const n = integer(ops.l), end = BigInt(4 * program.length);
    ops.l = labels.has(ops.l) ? labels.get(ops.l) : n && n.v >= 0n && n.v <= end && n.v % 4n === 0n ? Number(n.v / 4n) : fail(`${at}: there is no label ${JSON.stringify(ops.l)}`);
  }
  return { program, labels };
}

function immediate(text, at, op, kind) {
  const n = integer(text), [lo, hi] = RANGE[kind];
  if (!n) fail(`${at}: ${JSON.stringify(text)} is not a number`);
  if (n.v < lo || n.v > hi) fail(`${at}: ${text} does not fit ${op} (${lo} to ${hi})${kind === 'i' ? '; use li for a larger constant' : ''}`);
  return n;
}

/** Runs a riscv trace: the steps the page shows (as steps() describes), or throws what keeps it from running.
 *  The student's own code (src/elements/CodeZone.jsx) may run longer and touch more memory than a trace Plato shows. */
export function run(spec, { maxSteps = MAX_STEPS, maxCells = MAX_CELLS } = {}) {
  const { program, labels } = assemble(spec.code), end = BigInt(4 * program.length);
  const x = Array(32).fill(0n), hex = Array(32).fill(false), written = [];
  const bytes = new Map(), cells = new Map(), labelled = new Map();
  let stack = false;
  x[2] = STACK_TOP; hex[2] = true; x[1] = end;
  const set = (r, v, isHex) => {
    if (!r) return;
    x[r] = wrap(v); hex[r] = isHex;
    if (!written.includes(r)) written.push(r);
    if (r === 2) stack = true;
  };
  const write = (address, size, v) => { for (let k = 0; k < size; k++) bytes.set(u64(address + BigInt(k)), Number((v >> BigInt(8 * k)) & 0xffn)); };
  const read = (address, size, signed) => {
    let v = 0n;
    for (let k = size - 1; k >= 0; k--) v = (v << 8n) | BigInt(bytes.get(u64(address + BigInt(k))) ?? 0);
    return signed ? BigInt.asIntN(8 * size, v) : v;
  };
  const touch = (address, size, at) => {
    if (!cells.has(address)) {
      if (cells.size >= maxCells) fail(`${at}: it touches more than ${maxCells} memory cells; keep the example small`);
      cells.set(address, { size, hex: false, label: labelled.get(address) || '' });
    }
    const cell = cells.get(address);
    cell.size = size;
    return cell;
  };
  for (const [name, value] of Object.entries(spec.init.regs)) { const n = integer(value), r = register(name); x[r] = wrap(n.v); hex[r] = n.hex; }
  // Starting memory, lowest address first, each as 8 bytes, so a narrower cell above one overwrites only the bytes
  // that extend it; a cell shows as wide as the gap to its neighbour (until the program reads it otherwise).
  const start = spec.init.memory.map(c => ({ ...c, at: u64(integer(c.address).v), n: integer(c.value) })).sort((a, b) => (a.at > b.at) - (a.at < b.at));
  start.forEach((c, k) => {
    const gap = start[k + 1] ? start[k + 1].at - c.at : k ? c.at - start[k - 1].at : 8n;
    write(c.at, 8, c.n.v);
    labelled.set(c.at, c.label);
    cells.set(c.at, { size: gap >= 8n ? 8 : gap >= 4n ? 4 : gap >= 2n ? 2 : 1, hex: c.n.hex, label: c.label });
  });
  const shot = pc => ({ pc, x: [...x], hex: [...hex], cells: [...cells].map(([address, c]) => ({ address, ...c, value: read(address, c.size, true) })) });
  const jump = (address, at) => { const a = u64(address); if (a % 4n || a > end) fail(`${at}: it jumps to address ${show(a, true)}, which is not an instruction`); return Number(a / 4n); };
  let pc = labels.get('main') ?? 0;
  const shots = [shot(pc < program.length ? pc : null)];
  for (let count = 0; pc !== null && pc < program.length; count++) {
    if (count === maxSteps) fail(`it runs more than ${maxSteps} instructions; use smaller values so it finishes sooner`);
    const { def, ops: o, at } = program[pc];
    let next = pc + 1;
    switch (def.run) {
      case 'alu': set(o.d, def.f(x[o.s], o.t === undefined ? o.i.v : x[o.t]), hex[o.s] || (o.t === undefined ? o.i.hex : hex[o.t])); break;
      case 'unary': set(o.d, def.f(x[o.s]), hex[o.s]); break;
      case 'li': set(o.d, o.i.v, o.i.hex); break;
      case 'lui': set(o.d, w32(o.i.v << 12n), o.i.hex); break;
      case 'auipc': set(o.d, BigInt(4 * pc) + w32(o.i.v << 12n), o.i.hex); break;
      case 'load': { const a = u64(x[o.s] + o.i.v), cell = touch(a, def.size, at); set(o.d, read(a, def.size, def.signed), cell.hex); if (o.s === 2) stack = true; break; }
      case 'store': {
        const a = u64(x[o.s] + o.i.v), cell = touch(a, def.size, at);
        write(a, def.size, x[o.t]); cell.hex = hex[o.t];
        if (o.s === 2) { stack = true; cell.label = labelled.get(a) || o.named; } // a stack slot is named for what was saved in it
        break;
      }
      case 'branch': if (def.f(x[o.s], o.t === undefined ? 0n : x[o.t])) next = o.l; break;
      case 'jal': set(o.d ?? def.link ?? 1, BigInt(4 * (pc + 1)), false); next = o.l; break;
      case 'jalr': case 'ret': {
        const target = def.run === 'ret' ? x[1] : x[o.s] + (o.i?.v ?? 0n);
        set(o.d ?? def.link ?? (def.run === 'ret' ? 0 : 1), BigInt(4 * (pc + 1)), false);
        next = jump(target & ~1n, at);
        break;
      }
      case 'stop': next = null; break;
    }
    pc = next;
    shots.push(shot(pc === program.length ? null : pc));
  }
  const watch = spec.watch.length ? spec.watch : written.slice(0, 8).map(r => codeName(spec.code, r) || ABI[r]);
  return shots.map(s => {
    const sp = u64(s.x[2]), rows = s.cells.map(c => ({ address: c.address, value: show(c.value, c.hex, 8 * c.size), label: c.label }));
    if (stack && !rows.some(r => r.address === sp)) rows.push({ address: sp, value: '', label: '' });
    rows.sort((a, b) => (b.address > a.address) - (b.address < a.address)); // high addresses on top, as the stack is drawn
    return {
      line: s.pc === null ? null : program[s.pc].line, note: '',
      vars: watch.map(name => { const r = register(name); return { name, value: show(s.x[r], s.hex[r]) }; }),
      memory: rows.map(r => ({ ...r, address: show(r.address, true) })),
      pointers: stack ? [{ at: rows.findIndex(r => r.address === sp), label: 'sp' }] : [],
    };
  });
}

/** Each line's instruction address (4 × its index, as the course counts), or '' where a line has none. */
export function addresses(code) {
  const first = new Map();
  assemble(code).program.forEach((ins, i) => { if (!first.has(ins.line)) first.set(ins.line, 4 * i); });
  return code.split('\n').map((_, i) => first.has(i + 1) ? String(first.get(i + 1)) : '');
}

// How the code itself names register r (x10 or a0), for the default watch list.
const codeName = (code, r) => code.replace(/(#|\/\/).*/g, '').match(/\b(?:x\d{1,2}|zero|ra|sp|gp|tp|fp|[ast]\d{1,2})\b/gi)?.find(name => register(name) === r);

/** The trace for the page: [{ line (about to run; null once finished), note, vars: [{ name, value, changed }], memory, pointers }]. */
export function steps(spec) {
  const list = spec.lang === 'riscv' ? run(spec) : spec.steps;
  return list.map((step, i) => ({ ...step, vars: step.vars.map(v => ({ ...v, changed: i > 0 && list[i - 1].vars.find(p => p.name === v.name)?.value !== v.value })) }));
}

// ---------- the stepper as a registry engine (shared/elements/registry.mjs): the task layer runs on these ----------
export const info = { bestFor: ["first_contact", "repair", "transfer"], task: "predict: checkpoints at 'line N' (the first time line N is about to run) or 'step N'; predict watched registers or variables by name, 'mem <address>', or 'line' (the line that runs next).",  adapters: ['A1'], modes: ['predict', 'change', 'compare', 'teach'], translations: ['memory', 'tracetable'], reveals: ['F1', 'F6', 'F7'],
  notice: ['the line about to run', 'the values that just changed', 'where the stack pointer is and what is saved below it'] };
/** The trace's runtime state: its steps (computed once) and the step shown. */
export const init = spec => ({ spec, steps: steps(spec), at: 0 });
/** The action that moves it on (a checkpoint waits at the step it gates). */
export const next = 'next';
export function step(state, action) {
  const m = /^to (\d+)$/.exec(action), to = action === 'next' ? state.at + 1 : action === 'back' ? state.at - 1 : action === 'reset' ? 0 : m ? +m[1] - 1 : fail(`unknown action ${JSON.stringify(action)}; use next, back, reset or "to N"`);
  return { ...state, at: Math.max(0, Math.min(state.steps.length - 1, to)) };
}
/** The gates a move forward passes: the step it takes (1-based) and the line that runs. */
export function passes(state, action) {
  if (action !== 'next' || state.at >= state.steps.length - 1) return [];
  const line = state.steps[state.at].line;
  return [`step ${state.at + 1}`, ...(line ? [`line ${line}`] : [])];
}
/** What can be predicted and checked at the step shown: the watched values, memory cells ("mem 0x7ff0") and the line next to run. */
export function values(state) {
  const s = state.steps[state.at];
  return { ...Object.fromEntries(s.vars.map(v => [v.name, v.value])), ...Object.fromEntries(s.memory.filter(c => c.address).map(c => [`mem ${c.address}`, c.value])), line: s.line ?? 'end' };
}
export function brief(state) {
  const s = state.steps[state.at], code = s.line ? state.spec.code.split('\n')[s.line - 1].replace(/(#|\/\/).*/, '').trim() : '';
  return `step ${state.at + 1} of ${state.steps.length}: ${s.line ? `line ${s.line} (${code}) runs next` : 'the program has finished'}${s.vars.length ? `; ${s.vars.map(v => `${v.name}=${v.value}`).join(', ')}` : ''}`.slice(0, 400);
}
/** Its parts for point_to: each line of code, each watched value, each memory cell, and the step counter. */
export function anchors(state) {
  const names = new Set(), cells = new Set();
  for (const s of state.steps) { for (const v of s.vars) names.add(v.name); for (const c of s.memory) if (c.address) cells.add(c.address); }
  return [...state.spec.code.split('\n').map((_, i) => `line-${i + 1}`), ...[...names].map(n => `var-${n}`), ...[...cells].map(a => `mem-${a}`), 'step'];
}
/** A checkpoint's place: "line N" (the first time line N is about to run) or "step N". */
export function gate(state, at) {
  const m = /^(line|step)\s+(\d+)$/i.exec(String(at ?? '').trim());
  if (!m) fail(`a checkpoint's "at" is "line N" or "step N", not ${JSON.stringify(at)}`);
  const key = `${m[1].toLowerCase()} ${+m[2]}`;
  if (!state.steps.slice(0, -1).some((s, i) => key === `step ${i + 1}` || key === `line ${s.line}`)) fail(`checkpoint at ${key}: the program never runs it`);
  return key;
}
