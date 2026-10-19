// node scripts/setup-tutor-agent.mjs   (a deploy: the lead runs it; tests and evals never do)
// Creates or updates the private ElevenLabs agent that is Luna's realtime speaking role: "Luna Tutor", the actor that
// performs the engine's cards (card v2) with ACTOR_PROMPT v2's stage directions and its client tools (point_to by
// anchor, read_aloud, …; backend/session/agent.mjs). Only this project's server, holding ELEVENLABS_API_KEY, can start
// a conversation with it (it issues short-lived tokens from POST /api/session). Writes ELEVENLABS_AGENT_ID into .env.
import { readFile, writeFile } from 'node:fs/promises';
import { ACTOR_PROMPT, ACTOR_TOOLS } from '../backend/session/agent.mjs';
import { modelSettings } from '../server/runtime.mjs';

// ElevenLabs requires a description on every tool parameter (and nested property). Fill any that lack one.
function described(schema, name = 'value') {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (out.type && out.type !== 'object' && !out.description) out.description = name.replace(/_/g, ' ');
  if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, described(v, k)]));
  if (out.items) out.items = described(out.items, `${name} item`);
  return out;
}
// The agent, and the .env key its id is kept under.
const agent = { name: 'Luna Tutor', env: 'ELEVENLABS_AGENT_ID', prompt: ACTOR_PROMPT, tools: ACTOR_TOOLS.map(tool => ({ ...tool, parameters: described(tool.parameters) })) };
// Staying silent is a move: ElevenLabs' built-in skip_turn system tool, in exactly the documented shape
// (elevenlabs.io/docs/agents-platform/customization/tools/system-tools/skip-turn). Its wait timeout defaults to -1:
// no check-in afterwards, silent until the student speaks again.
const BUILT_IN_TOOLS = {
  skip_turn: {
    type: 'system', name: 'skip_turn', params: { system_tool_type: 'skip_turn' },
    description: 'Say nothing this turn: the student\'s message is only noise or "...", a filler ("um", "uh"), an unfinished turn (it trails off on "so", "because" or "wait"), "give me a second", they are working, thinking or reading, or they asked for quiet. A short answer ("10111", "yes", "a0") is an answer: reply to it.',
  },
};

process.loadEnvFile('.env');
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw Error('Set ELEVENLABS_API_KEY in .env.');
const { model: llm, effort } = modelSettings().voice; // LUNA_VOICE and LUNA_VOICE_EFFORT (older: LUNA_AGENT_LLM, LUNA_AGENT_EFFORT)

const configOf = ({ name, prompt, tools }) => ({
  name,
  conversation_config: {
    agent: {
      first_message: '',
      language: 'en',
      // The page and the posed questions are client tools: the page runs them (src/main.jsx).
      prompt: { prompt, llm, reasoning_effort: effort, temperature: 0.4, tools, built_in_tools: BUILT_IN_TOOLS, knowledge_base: [] },
    },
    tts: { voice_id: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb', model_id: 'eleven_v4_turbo' },
    conversation: { max_duration_seconds: 1800 },
    // Silence is studying (thinking, writing, reading): never prompt the student to respond.
    turn: { turn_timeout: Number(process.env.LUNA_AGENT_TURN_TIMEOUT || -1), soft_timeout_config: { timeout_seconds: -1 } },
  },
  platform_settings: {
    auth: { enable_auth: true },
    // Without a microphone the page holds a text-only conversation, an override the agent must allow
    // (elevenlabs.io/docs/eleven-agents/customization/personalization/overrides). Audio alignment needs no setting: it rides on the default `audio` client event.
    overrides: { conversation_config_override: { conversation: { text_only: true } } },
    privacy: { record_voice: false, retention_days: 0, delete_transcript_and_pii: true, delete_audio: true },
    evaluation: { criteria: [] },
    data_collection: {},
  },
});

const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };
async function request(path, options = {}) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/${path}`, { ...options, headers, signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map(item => ({ loc: item.loc, message: item.msg })) : body.detail;
    throw Error(JSON.stringify({ status: response.status, detail }));
  }
  return body;
}

let env = await readFile('.env', 'utf8');
const config = configOf(agent);
let agentId = process.env[agent.env];
if (!agentId) agentId = (await request('agents?page_size=100')).agents?.find(a => a.name === config.name)?.agent_id;
if (agentId) await request(`agents/${encodeURIComponent(agentId)}`, { method: 'PATCH', body: JSON.stringify(config) });
else agentId = (await request('agents/create', { method: 'POST', body: JSON.stringify(config) })).agent_id;

let saved = await request(`agents/${encodeURIComponent(agentId)}`);
// An update that also carries the inline tools has been seen to leave built_in_tools unset: set it again on its own
// (the rest of the prompt sent alongside, unchanged) and say so loudly if it still does not stick.
if (!saved.conversation_config?.agent?.prompt?.built_in_tools?.skip_turn) {
  const { tools, ...rest } = config.conversation_config.agent.prompt;
  await request(`agents/${encodeURIComponent(agentId)}`, { method: 'PATCH', body: JSON.stringify({ conversation_config: { agent: { prompt: { ...rest, tool_ids: saved.conversation_config.agent.prompt.tool_ids } } } }) });
  saved = await request(`agents/${encodeURIComponent(agentId)}`);
  if (!saved.conversation_config?.agent?.prompt?.built_in_tools?.skip_turn) console.warn(`WARNING: skip_turn is still not enabled on ${agent.name}; enable "Skip turn" under System tools in the ElevenLabs dashboard.`);
}
const prompt = saved.conversation_config?.agent?.prompt || {};
console.log(`${agent.name} agent ${agentId}: llm=${prompt.llm} reasoning_effort=${prompt.reasoning_effort ?? 'default'} voice=${saved.conversation_config?.tts?.voice_id} tools=${(prompt.tools || []).map(t => t.name).join(',') || (prompt.tool_ids || []).length + ' by id'} built_in=${Object.keys(prompt.built_in_tools || {}).filter(k => prompt.built_in_tools[k]).join(',') || 'none'}`);

// Record the (non-secret) agent id in .env.
const line = `${agent.env}=${agentId}`, kept = new RegExp(`^${agent.env}=.*$`, 'm');
env = kept.test(env) ? env.replace(kept, line) : `${env.trimEnd()}\n${line}\n`;
await writeFile('.env', env, { mode: 0o600 });
