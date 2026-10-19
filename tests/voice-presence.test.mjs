import test from 'node:test';
import assert from 'node:assert/strict';
import { afterVoiceClose } from '../src/voice-presence.mjs';

test('always on: errors back off, a spoken session reconnects, a silent one rests', () => {
  assert.deepEqual(afterVoiceClose({ reason: 'user' }), { action: 'none', failures: 0 });
  // Connection trouble retries with a doubling delay, then stops asking.
  let failures = 0;
  const delays = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = afterVoiceClose({ reason: 'error', failures });
    assert.equal(next.action, 'reconnect');
    delays.push(next.delayMs); failures = next.failures;
  }
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.deepEqual(afterVoiceClose({ reason: 'error', failures }), { action: 'wait', failures: 0, gaveUp: true });
  // A blocked microphone or an empty account is never retried automatically.
  assert.deepEqual(afterVoiceClose({ reason: 'error', retry: false, failures: 2 }), { action: 'wait', failures: 0 });
  // A drop after a real conversation starts the count again.
  assert.deepEqual(afterVoiceClose({ reason: 'error', livedMs: 600_000, failures: 4 }), { action: 'reconnect', delayMs: 1000, failures: 1 });
  // An agent that hangs up immediately is a failure, not a conversation.
  assert.equal(afterVoiceClose({ reason: 'agent', livedMs: 900, heardUser: true, failures: 0 }).failures, 1);
  assert.deepEqual(afterVoiceClose({ reason: 'agent', livedMs: 1_800_000, heardUser: true, failures: 3 }), { action: 'reconnect', delayMs: 600, failures: 0 });
  assert.deepEqual(afterVoiceClose({ reason: 'agent', livedMs: 1_800_000, heardUser: false }), { action: 'rest', failures: 0 });
});
