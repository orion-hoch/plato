// The history fixture's belief library for simulated students (evals/understanding/sim). An interpretive domain: a
// misconception is a way of reasoning about sources and causes, not a wrong value. Each item is an open question on
// the chapter or its documents, with a reference answer; each belief has, per item, the answer it produces (a template
// the LLM only phrases) and a DETECTOR (docs/research/domain-generality.md §7.4): rubric (description, positive and
// negative exemplars, judged by a calibrated judge), marker (cheap cue words, then the rubric) or constraint (a
// required part the answer lacks). Written independently of any Study. Provenance: domain-generality.md §2.2
// catalogue (source naivety, presentism, single cause, claim without warrant, myside bias), C = catalogued there.

const item = (id, concept, describe, answer, bugs, difficulty = 0) => ({ id, concept, describe, params: {}, valid: () => true, solve: () => answer, difficulty: () => difficulty, bugs: Object.fromEntries(Object.entries(bugs).map(([b, text]) => [b, () => text])) });

export const kind = 'beliefs';
export const concepts = [
  { id: 'sources', topicId: 'top_5veHqgsFtdm8HJ8w', title: 'Reading primary sources', idea: "a document is evidence of its author's view, shaped by who wrote it, when, for whom and why, so you ask what it shows about its author and corroborate it with other sources", interactivity: 'low' },
  { id: 'causes', topicId: 'top_KOSWnq98zT-2fLx0', title: 'Why Reconstruction ended', idea: 'Reconstruction ended through several interacting causes, including violence, northern retreat, economic depression and the 1877 settlement, and the outcome was not inevitable', interactivity: 'low' },
  { id: 'freedom', topicId: 'top_TAif2vOqmQt4YuL5', title: 'The meaning of Black freedom', idea: 'freedpeople defined freedom in their own terms, through land, family, education, wages and political rights, and those demands met organized resistance', interactivity: 'low' },
];

export const bugs = [
  { id: 'source_naivety', concept: 'sources', errorKind: 'F11', belief: 'a document tells you plainly what happened; you just read off the facts', provenance: 'C (Wineburg; §2.2 source naivety)',
    detector: { type: 'marker', cues: ['proves', 'shows exactly', 'tells us what happened', 'is a fact', 'factual record'], then: 'rubric', description: 'treats a source as a neutral record of events, with no attention to author, purpose or audience' } },
  { id: 'presentism', concept: 'freedom', errorKind: 'F11', belief: "people in the past should be judged directly by today's values", provenance: 'C (§2.2 presentism)',
    detector: { type: 'rubric', description: "judges past actors by present-day values without placing them in their own time's context, options and beliefs", positives: ["They were just bad people; anyone today would see that.", "It's obvious they should have known better."], negatives: ["By the standards of 1865 white Southerners, the code looked like restoring order; to freedpeople it was a return to bondage, and the record shows both views."] } },
  { id: 'single_cause', concept: 'causes', errorKind: 'F9', belief: 'a big change like the end of Reconstruction has one main cause', provenance: 'C (§2.2 single cause)',
    detector: { type: 'marker', cues: ['only because', 'the reason was', 'the single', 'just because', 'simply because'], then: 'rubric', description: 'explains a complex outcome by one cause and ignores interacting factors' } },
  { id: 'inevitability', concept: 'causes', errorKind: 'F9', belief: 'how things turned out was bound to happen', provenance: 'I (contingency)',
    detector: { type: 'rubric', description: 'treats the outcome as inevitable, ignoring choices and contingencies', positives: ['Reconstruction was doomed from the start.', 'There was never any chance it could have worked.'], negatives: ['Reconstruction could have gone differently: federal enforcement in the early 1870s worked where it was sustained.'] } },
  { id: 'no_counterevidence', concept: 'sources', errorKind: 'F11', belief: 'a claim is proven once you find one source that supports it', provenance: 'C (§2.2 myside bias)',
    detector: { type: 'constraint', violates: ['addresses_counterevidence'], description: 'an answer that cites only supporting evidence and never considers what cuts against it' } },
];

export const skills = [
  item('anderson_letter', 'sources', "what Jourdon Anderson's 1865 letter to his former enslaver shows about freedom, and how its author and purpose shape what we can learn from it",
    'it shows a freedman setting his own terms for work, wages owed, safety and his children\'s education; its biting irony and its purpose (answering an offer to return) mean it is evidence of how Anderson understood freedom, best read alongside other sources',
    { source_naivety: 'it proves that former enslavers all wanted their workers back and that freedmen refused, since that is what the letter says happened', presentism: 'it shows the old enslaver was simply a terrible person, as anyone today would see' }, 0.2),
  item('black_code', 'sources', "what the 1865 Mississippi Black Code tells a historian, and what it does not",
    'it shows what white lawmakers intended (to control Black labor and movement through vagrancy and contract rules); it does not show how the laws worked in practice or how freedpeople resisted, which needs other sources',
    { source_naivety: 'it tells us exactly how Black life in Mississippi was in 1865: the laws describe what happened', no_counterevidence: 'the code proves Black people had no freedom at all after the war' }, 0.3),
  item('reynolds_report', 'sources', "how far General Reynolds's 1868 report on lawlessness in Texas can be trusted, and why",
    'it is valuable as an official\'s first-hand report, but it was written by a Union commander to Washington with reasons to stress disorder, so it should be corroborated with other accounts',
    { source_naivety: 'it is a government report, so it is a factual record of what happened in Texas' }, 0.3),
  item('end_reconstruction', 'causes', 'why Reconstruction ended in the 1870s',
    'several interacting causes: white supremacist violence, northern fatigue and shifting Republican priorities, the depression of 1873, court decisions, and the disputed 1876 election settled in 1877',
    { single_cause: 'only because of the Compromise of 1877, when the troops were withdrawn', inevitability: 'it was doomed from the start; the South was never going to accept it' }, 0.2),
  item('sherman_meeting', 'freedom', 'what the 1865 meeting between Black ministers and General Sherman shows about how freedpeople defined freedom',
    'they defined freedom as land of their own and the chance to support themselves and live apart from former enslavers, which shaped Field Order No. 15',
    { presentism: 'that they were naive to trust Sherman and the government, as we can see now' }, 0.1),
  item('douglass_1877', 'freedom', 'what Frederick Douglass argued in 1877 about remembering the Civil War, and why it mattered then',
    'that the nation must not forget the war was fought over slavery and freedom, at a moment when reconciliation between white North and South was erasing that meaning',
    { single_cause: 'that the war was simply about saving the Union', presentism: 'that he was being bitter and should have moved on' }, 0.3),
];

export const tests = skills.map(s => ({ skill: s.id, params: {} }));
export const practice = [];
