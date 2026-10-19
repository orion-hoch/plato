// Domain adapters (docs/system-spec.md §9; docs/research/domain-generality.md §7): the only subject-specific part of the
// course model. An adapter is chosen per ITEM, not per course: a course binds several, and each probe or problem names
// the one that checks it (a systems course has exact traces and "why" answers; a history course has dates and arguable
// essays). The core never branches on subject: the stages read these records, and verify.mjs runs their verifiers.
// Adding a domain family means adding a record here (and a verifier in verify.mjs only when its checking differs). `panel`:
// the expert stances V9 seats for the family's R5 items (else PANEL).

/** Performance families (spec §3): the engine reasons only about these; an adapter names them in its domain's words. */
export const FAMILIES = { E1: 'recall', E2: 'discriminate', E3: 'execute', E4: 'predict', E5: 'explain or justify', E6: 'evaluate or critique', E7: 'transfer or integrate', E8: 'generate or compose', E9: 'perspective', E10: 'calibration' };
/** The families a topic's probes must cover (E10, calibration, is the learner's own confidence, asked live). */
export const CORE_FAMILIES = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9'];
/** Correctness regimes (spec §1): the regime, not the subject, decides how an answer is checked. */
export const REGIMES = { R1: 'unique: one right answer', R2: 'equivalent forms: many forms, one meaning', R3: 'constraints: any answer meeting the requirements', R4: 'defensible range: judged by the discipline\'s criteria', R5: 'expert disagreement: experts legitimately differ' };
/** Error kinds (spec §8): the repair follows from the kind, never from the subject. */
export const ERROR_KINDS = {
  F1: 'slip: right model, isolated execution error', F2: 'fragile: right only in the familiar form', F3: 'control failure: no plan, no monitoring, stops early',
  F4: 'missing piece: a gap or a missing prerequisite', F5: 'false belief: one wrong proposition', F6: 'buggy procedure: a systematic, rule-like error',
  F7: 'flawed model: a coherent wrong model, consistent across probes', F8: 'category mistake: the idea filed as the wrong kind of thing',
  F9: 'oversimplification: single cause, linear, static, universal', F10: 'misreading: misrepresents the text, source, problem or data',
  F11: 'epistemic misstep: proof by example, naive trust in a source, "just opinion", a claim without a warrant', F12: 'illusion of competence: "I get it", then fails',
};
export const KC_KINDS = ['fact', 'concept', 'procedure', 'principle', 'strategy', 'epistemic'];
export const MODEL_FORMS = ['machine', 'causal', 'formal', 'script', 'frame'];

export const ADAPTERS = {
  A1: {
    id: 'A1', name: 'computational', covers: 'programming, systems, digital logic, databases, algorithms',
    verifiers: ['V1', 'V2', 'V5', 'V6', 'V8'],
    runners: ['js', 'c', 'riscv'], // V2's machines
    detectors: ['execute', 'pattern', 'constraint', 'rubric'],
    facetMap: [{ name: 'trace', families: ['E4'] }, { name: 'explain in plain English', families: ['E5'] }, { name: 'Parsons (order the lines)', families: ['E3'] }, { name: 'write', families: ['E8'] }, { name: 'debug', families: ['E6'] }, { name: 'choose the construct', families: ['E2'] }, { name: 'combine in a new program', families: ['E7'] }, { name: 'compare two designs', families: ['E9'] }, { name: 'recall a convention', families: ['E1'] }],
    problemTemplates: [{ family: 'E4', regime: 'R1', form: 'trace and predict the output or state' }, { family: 'E3', regime: 'R2', form: 'write a function that passes tests' }, { family: 'E6', regime: 'R1', form: 'find and fix the bug' }, { family: 'E2', regime: 'R1', form: 'which construct or instruction applies' }],
    moveEmphasis: { workedExampleFade: '↑↑', predictObserveExplain: '↑↑', compareCases: '↑', refute: '↑', strategyModelling: '↑', argumentDialogue: '0', spacedRetrieval: '↑', interleaving: '↑', feedbackOnDraft: '↑' },
    elementKinds: ['memory diagram', 'trace table', 'code zone with run', 'register file', 'Parsons blocks', 'truth table', 'timing diagram'],
    epistemicProfile: { warrants: ['execution', 'specification', 'proof of correctness'], authority: 'the course decides scope, notation and conventions; the language or machine specification decides behaviour', disagreement: 'methods', citation: { tutorMustGround: true, verifyExistence: false }, stanceTargets: 'evaluativist', reading: ['read code by tracing state', 'read a specification for what it guarantees and what it leaves undefined'] },
    notationParsers: ['number (decimal, hex, binary)', 'bit pattern', 'code', 'register list'],
  },
  A2: {
    id: 'A2', name: 'formal-quantitative', covers: 'mathematics, physics, chemistry, statistics, quantitative economics',
    verifiers: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V8'],
    runners: ['js'],
    detectors: ['execute', 'pattern', 'rubric'],
    facetMap: [{ name: 'meaning of terms', families: ['E1'] }, { name: 'which method or theorem applies', families: ['E2'] }, { name: 'compute or solve', families: ['E3'] }, { name: 'predict a property; is this conjecture true?', families: ['E4'] }, { name: 'justify a step or claim', families: ['E5'] }, { name: 'validate a proof or a worked solution', families: ['E6'] }, { name: 'transfer the method; a mixed set', families: ['E7'] }, { name: 'construct an example, counterexample or proof', families: ['E8'] }, { name: 'compare two methods', families: ['E9'] }],
    problemTemplates: [{ family: 'E3', regime: 'R1', form: 'compute with a parametrized instance' }, { family: 'E4', regime: 'R1', form: 'predict a property before computing' }, { family: 'E6', regime: 'R1', form: 'find the error in a worked solution' }, { family: 'E8', regime: 'R2', form: 'construct an example with given properties' }],
    moveEmphasis: { workedExampleFade: '↑↑', predictObserveExplain: '↑', compareCases: '↑↑', refute: '↑', strategyModelling: '↑↑', argumentDialogue: '↑', spacedRetrieval: '↑', interleaving: '↑↑', feedbackOnDraft: '↑' },
    elementKinds: ['editable equation', 'function graph', 'number line', 'vector diagram', 'proof-block ordering', 'units pad', 'matrix'],
    epistemicProfile: { warrants: ['proof', 'counterexample', 'computation', 'dimensional analysis'], authority: 'the course decides notation and conventions; proof and computation decide truth', disagreement: 'methods', citation: { tutorMustGround: true, verifyExistence: false }, stanceTargets: 'evaluativist', reading: ['read a definition by testing it on an example and a non-example', 'read a proof for its dependency structure'] },
    notationParsers: ['number with tolerance', 'number with units', 'vector or matrix', 'set', 'expression, plain or LaTeX (V3: computer algebra, then numeric identity tests)'],
  },
  A3: {
    id: 'A3', name: 'textual-argumentative', covers: 'history, literature, philosophy, the social and life sciences in their conceptual parts, essays anywhere',
    verifiers: ['V1', 'V6', 'V7', 'V8', 'V9'],
    runners: [],
    detectors: ['rubric', 'pattern', 'constraint', 'marker'],
    facetMap: [{ name: 'significance', families: ['E9'] }, { name: 'evidence: sourcing, contextualizing, corroborating', families: ['E6'] }, { name: 'continuity and change', families: ['E4'] }, { name: 'cause and consequence', families: ['E5'] }, { name: 'perspectives', families: ['E9'] }, { name: 'classify a new case under a concept', families: ['E2'] }, { name: 'recall a term, date or actor', families: ['E1'] }, { name: 'apply a framework to a new case', families: ['E3', 'E7'] }, { name: 'write an argument from evidence', families: ['E8'] }],
    problemTemplates: [{ family: 'E6', regime: 'R4', form: 'source critique: who, when, for whom, why, how reliable' }, { family: 'E5', regime: 'R4', form: 'causal explanation with evidence' }, { family: 'E2', regime: 'R1', form: 'classify a case' }, { family: 'E4', regime: 'R3', form: 'how would X have responded, given…' }, { family: 'E9', regime: 'R4', form: 'argue the other side; read through a second frame' }],
    moveEmphasis: { workedExampleFade: '↑', predictObserveExplain: '↑', compareCases: '↑↑', refute: '↑', strategyModelling: '↑↑', argumentDialogue: '↑↑', spacedRetrieval: '↑', interleaving: '↑', feedbackOnDraft: '↑↑' },
    elementKinds: ['source card', 'timeline', 'causal map', 'argument map', 'annotated text', 'comparison table'],
    epistemicProfile: { warrants: ['corroborated sources', 'context', 'the data and model fit (sciences)'], authority: 'the course decides scope and emphasis; primary sources and the scholarly consensus decide what happened and what is known', disagreement: 'interpretations', citation: { tutorMustGround: true, verifyExistence: true }, stanceTargets: 'evaluativist', reading: ['source a document (author, date, audience, purpose) before reading it', 'contextualize', 'corroborate across sources', 'read for the claim and its warrant'] },
    notationParsers: ['quotation', 'date', 'name'],
    panel: [
      { id: 'examiner', name: 'the course\'s examiner', view: 'judges by the course\'s materials and the standards its rubric states, and credits what the course teaches' },
      { id: 'source_critic', name: 'the source critic', view: 'weighs only what the evidence supports: who wrote each source, when, for whom and why; discounts any claim that outruns its sources' },
      { id: 'contextualist', name: 'the contextualist', view: 'reads the question in its own time and setting, and credits an answer that situates it there and weighs several causes' },
      { id: 'revisionist', name: 'the revisionist', view: 'takes the strongest established rival interpretation seriously, and credits an answer that engages it rather than ignoring it' },
      { id: 'skeptic', name: 'the skeptic', view: 'looks for the decisive objection, and credits an answer only if it survives the best counterargument' },
    ],
  },
  A4: {
    id: 'A4', name: 'case-reasoning', covers: 'law, medicine and clinical reasoning, business and policy cases, engineering design reviews, ethics cases',
    verifiers: ['V1', 'V6', 'V7', 'V8', 'V9'],
    runners: [],
    detectors: ['constraint', 'rubric', 'marker', 'pattern'],
    facetMap: [{ name: 'recall a rule, its elements or a key feature', families: ['E1'] }, { name: 'spot the issue; represent the problem', families: ['E2'] }, { name: 'apply the rule or script to the facts', families: ['E3'] }, { name: 'perturb the case: what does a new fact or finding change?', families: ['E4'] }, { name: 'justify by rule, precedent or mechanism', families: ['E5'] }, { name: 'find the missed element; reflect on a wrong call', families: ['E6'] }, { name: 'an atypical case or a new setting', families: ['E7'] }, { name: 'a full work-up or issue-spotter answer', families: ['E8'] }, { name: 'the other side; the strongest alternative', families: ['E9'] }],
    problemTemplates: [{ family: 'E2', regime: 'R1', form: 'which rule, issue or diagnosis applies, from its key features' }, { family: 'E3', regime: 'R3', form: 'apply the rule to a short fact pattern: every element addressed and tied to the facts' }, { family: 'E4', regime: 'R5', form: 'perturb the case: does this new fact make the conclusion more or less likely? (script concordance)' }, { family: 'E6', regime: 'R3', form: 'find the missed element or the premature closure in a work-up' }, { family: 'E9', regime: 'R4', form: 'argue the other side; name the strongest alternative' }, { family: 'E8', regime: 'R4', form: 'a full work-up or issue-spotter answer' }],
    moveEmphasis: { workedExampleFade: '↑', predictObserveExplain: '↑↑', compareCases: '↑↑', refute: '↑', strategyModelling: '↑↑', argumentDialogue: '↑↑', spacedRetrieval: '↑', interleaving: '↑↑', feedbackOnDraft: '↑↑' },
    elementKinds: ['rule or script card (conditions, elements, consequences)', 'differential table (findings × hypotheses, for and against)', 'issue tree or IRAC outline', 'rule-elements checklist', 'fact-pattern matrix (factors × cases)', 'case-comparison table (analogous or distinguishable)'],
    epistemicProfile: { warrants: ['rule, statute, guideline and precedent', 'mechanism (pathophysiology, a causal model)', 'base rates and evidence', 'purpose, policy and consequences'], authority: 'the course decides scope, the rules it teaches and its conventions; primary authority (statutes, holdings, guidelines) and the evidence decide what the rule is and what is known', disagreement: 'judgement', citation: { tutorMustGround: true, verifyExistence: true }, stanceTargets: 'evaluativist', reading: ['read a case for its facts, issue, rule, holding and reasoning', 'separate the facts that matter from those that do not', 'name the alternatives before deciding', 'check each element of the rule against the facts'] },
    notationParsers: ['citation', 'rule elements', 'name', 'date'],
    panel: [
      { id: 'examiner', name: 'the course\'s examiner', view: 'judges by the course\'s materials and the standards its rubric states, and credits what the course teaches' },
      { id: 'rule_applier', name: 'the rule-applier', view: 'decides by the governing rule, standard or guideline, its elements applied strictly to the stated facts, and gives no weight to facts not in the case' },
      { id: 'purposive', name: 'the purposive reasoner', view: 'decides by the purpose and policy behind the rule and the consequences of each outcome, reading the facts as a whole' },
      { id: 'practitioner', name: 'the experienced practitioner', view: 'decides as a seasoned professional would in practice: base rates, risk, and what usually happens in cases like this one' },
      { id: 'opposing', name: 'the opposing advocate', view: 'argues the other side as strongly as the facts allow, and credits an answer only where that argument fails' },
    ],
  },
  A5: {
    id: 'A5', name: 'language-use', covers: 'second and foreign languages; spoken and written production; oral presentation',
    verifiers: ['V1', 'V6', 'V8', 'V10'],
    runners: ['js'], // generated drills (a conjugation or declension family), never the learner's production
    detectors: ['execute', 'pattern', 'constraint', 'rubric', 'marker'],
    facetMap: [{ name: 'recognize and recall a form or word', families: ['E1'] }, { name: 'which form or register fits', families: ['E2'] }, { name: 'controlled production: cloze, transformation; fluency under time', families: ['E3'] }, { name: 'predict meaning from context', families: ['E4'] }, { name: 'explain a choice of form', families: ['E5'] }, { name: 'correct an erroneous sentence; repair a breakdown', families: ['E6'] }, { name: 'a new situation or genre', families: ['E7'] }, { name: 'spontaneous use in a communicative task', families: ['E8'] }, { name: 're-say it for another audience or register', families: ['E9'] }],
    problemTemplates: [{ family: 'E3', regime: 'R1', form: 'controlled production: cloze or transformation with one target form' }, { family: 'E2', regime: 'R1', form: 'which form or register fits this context' }, { family: 'E6', regime: 'R2', form: 'correct an erroneous sentence' }, { family: 'E8', regime: 'R3', form: 'a communicative task (goal, gap, outcome) whose constraints name the target forms' }, { family: 'E9', regime: 'R4', form: 're-say it for another audience or register' }, { family: 'E4', regime: 'R1', form: 'predict the meaning of a word or form from context' }],
    moveEmphasis: { workedExampleFade: '↑', predictObserveExplain: '0', compareCases: '↑', refute: '0', strategyModelling: '↑', argumentDialogue: '0', spacedRetrieval: '↑↑', interleaving: '↑', feedbackOnDraft: '↑' },
    elementKinds: ['glossed sentence', 'conjugation or declension table', 'dialogue role-play card (goal, gap, roles)', 'vocabulary card'],
    epistemicProfile: { warrants: ['usage by proficient speakers', 'the grammar of the variety the course teaches', 'register and context'], authority: 'the course decides the variety, register and conventions taught (forms of address, which accents and spellings count); proficient usage decides what is idiomatic', disagreement: 'methods', citation: { tutorMustGround: true, verifyExistence: false }, stanceTargets: 'evaluativist', reading: ['read for meaning first, then notice the form', 'guess an unknown word from context before looking it up'] },
    notationParsers: ['word form (lemma and morphology)', 'accents and diacritics', 'sentence'],
  },
};
/** The panel V9 seats for an item whose adapter names none: distinct, domain-general stances (each judges alone). */
export const PANEL = [
  { id: 'examiner', name: 'the course\'s examiner', view: 'judges by the course\'s materials and the standards its rubric states, and credits what the course teaches' },
  { id: 'evidentialist', name: 'the strict evidentialist', view: 'accepts only what the stated facts and evidence directly support, and discounts any inference beyond them' },
  { id: 'contextualist', name: 'the contextualist', view: 'weighs context, purpose and the whole picture, and accepts a reasonable inference the facts invite' },
  { id: 'practitioner', name: 'the experienced practitioner', view: 'decides as a seasoned professional in the field would in practice, by what usually happens and what is at stake' },
  { id: 'skeptic', name: 'the skeptic', view: 'looks for the decisive objection, and credits an answer only if it survives the best counterargument' },
];
export const ADAPTER_IDS = Object.keys(ADAPTERS);
export const adapterOf = id => ADAPTERS[id] || ADAPTERS.A3;
/** Adapter sizes (spec §9: track the cost of generality): the fields each family fills. */
export const adapterSize = id => JSON.stringify(ADAPTERS[id]).length;
