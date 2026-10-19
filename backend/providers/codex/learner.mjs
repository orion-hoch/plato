import { LOCAL_OUTPUT, ASSESS_OUTPUT } from '../../learner/assessment.mjs';
import { REVISER_OUTPUT } from '../../learner/personal.mjs';
import { LOCAL_ASSESS, LEARNER_ASSESS, PERSONAL_REVISE } from '../prompts/learner.mjs';

// Live learner providers over the Codex app-server (Astra). Inputs are trimmed to what each
// contract needs; outputs are validated against the same schemas the mocks satisfy.

const brief = text => typeof text === 'string' ? text.slice(0, 4000) : text;

export function createLearnerCodexProviders({ gateway }) {
  return {
    localAssessor: {
      assessAnswer: req => gateway.structured({
        role: 'astra', instructions: LOCAL_ASSESS.text, promptTemplateVersion: LOCAL_ASSESS.version, schema: LOCAL_OUTPUT,
        input: {
          question: { prompt: req.question.prompt, objectiveTargets: req.question.objectiveTargets, hints: req.question.hints },
          rubric: { expectedAnswer: req.rubric.expectedAnswer, acceptableAlternatives: req.rubric.acceptableAlternatives, criteria: req.rubric.criteria, misconceptionChecks: req.rubric.misconceptionChecks, assistanceInterpretation: req.rubric.assistanceInterpretation },
          objectives: req.objectives.map(o => ({ id: o.id, topicId: o.topicId, statement: o.statement, capabilities: o.capabilities })),
          delivered: { prompt: req.interaction.promptSnapshot, assistance: req.interaction.assistance, evidenceStatus: req.interaction.evidenceStatus, asr: req.interaction.asr },
          answer: req.interaction.finalizedAnswer, interactionId: req.interaction.id,
          sourceEvidence: req.sourceEvidence.map(e => ({ anchorId: e.anchor.id, excerpt: brief(e.excerpt) })),
          relevantProfileFacts: req.selectedProfileFacts.map(f => ({ kind: f.kind, key: f.key, value: f.value })),
        },
      }),
    },
    learnerAssessor: {
      assess: req => gateway.structured({
        role: 'astra', instructions: LEARNER_ASSESS.text, promptTemplateVersion: LEARNER_ASSESS.version, schema: ASSESS_OUTPUT,
        input: {
          topicId: req.topicId, objectives: req.objectives.map(o => ({ id: o.id, statement: o.statement, capabilities: o.capabilities })),
          findings: req.localAssessments.flatMap(l => l.findings), interactions: req.relevantInteractions.map(i => ({ id: i.id, prompt: i.promptSnapshot, answer: i.finalizedAnswer, assistance: i.assistance })),
          priorEvidence: req.relevantPriorEvidence.map(i => ({ id: i.id, prompt: i.promptSnapshot, answer: i.finalizedAnswer, at: i.responseAt })),
          priorProjection: { estimate: req.priorProjection.estimate, capabilities: req.priorProjection.capabilities }, diagnoses: req.diagnoses,
          profileFacts: req.selectedProfileFacts.map(f => ({ factId: f.factId, kind: f.kind, key: f.key, value: f.value, origin: f.origin })),
          policy: { version: req.policy.version, rules: [...req.policy.updateRules, ...req.policy.assistanceRules] },
        },
      }),
    },
    personalReviser: {
      reconsider: req => gateway.structured({
        role: 'astra', instructions: PERSONAL_REVISE.text, promptTemplateVersion: PERSONAL_REVISE.version, schema: REVISER_OUTPUT,
        input: {
          changes: req.changes.map(c => ({ id: c.id, kind: c.kind, topicIds: c.topicIds, evidence: c.evidence, reason: c.reason })),
          triggeringEvidence: req.triggeringEvidence.map(e => ({ id: e.id, answer: e.finalizedAnswer, prompt: e.promptSnapshot, text: e.text, type: e.type })),
          inspectedTopics: req.nearbyTopics.map(t => ({ topicId: t.topicId, title: t.title, description: t.description })),
          edges: req.nearbyEdges.map(e => ({ from: e.fromTopicId, to: e.toTopicId, type: e.type, explanation: e.explanation })),
          baseInterpretations: req.affectedBaseInterpretations.map(i => ({ id: i.id, topicIds: i.topicIds, claims: i.claims.slice(0, 20).map(c => ({ text: brief(c.text), evidence: c.evidence })) })),
          priorExplanations: req.priorExplanations.map(e => ({ id: e.id, topicIds: e.topicIds, text: brief(e.text), reasons: e.reasons })),
          priorEdges: req.priorPersonalEdges.map(e => ({ id: e.id, from: e.fromTopicId, to: e.toTopicId, type: e.type, explanation: e.explanation })),
          originalEvidence: req.originalEvidence.map(e => ({ anchorId: e.anchor.id, excerpt: brief(e.excerpt) })),
          profileFacts: req.selectedProfileFacts.map(f => ({ kind: f.kind, key: f.key, value: f.value, origin: f.origin })),
          topicStates: req.selectedTopicStates.map(s => ({ topicId: s.topicId, diagnoses: s.diagnoses })),
        },
      }),
    },
  };
}
