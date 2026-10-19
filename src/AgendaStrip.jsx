import React from 'react';
import { currentGoal } from './course-tree.mjs';
import './agenda-strip.css';

// What the session is on, in a word or two, at the top left (the user, 10 Oct: no list of goals, no checkmarks, no
// progress): the current goal's topic ("Two's complement"), "Intro" while the intro runs. Quiet type; pressing it opens
// the course tree. Screen readers hear "Now: <topic>".
const INTRO = new Set(['get_to_know', 'diagnose']);
/** A topic's name, short: before any colon or dash, at most about 28 characters, cut at a word. */
// A long unit title cut at a word, never on a dangling "and" (17 Oct: "Joint Distributions and"), and marked as cut.
const short = title => { const t = String(title || '').split(/\s*[:—–(]\s*|\s+-\s+/)[0].trim(); return t.length <= 44 ? t : `${t.slice(0, t.lastIndexOf(' ', 44)).replace(/(?:[\s,&]+|\s+(?:and|or|of|the|in|for|with|to))+$/i, '')}…`; };
export function topicLabel(agenda, topics = []) {
  const goal = currentGoal(agenda);
  if (!goal) return '';
  if (agenda.intro || INTRO.has(goal.mode)) return 'Intro';
  const topic = topics.find(t => goal.topicIds?.includes(t.id ?? t.topicId));
  return short(topic?.title || goal.title);
}
export default function AgendaStrip({ agenda, topics, onOpen }) {
  const label = topicLabel(agenda, topics || []);
  if (!label) return null;
  return <button type="button" className="agenda-strip" onClick={onOpen} aria-label={`Now: ${label}. Show the course tree.`}>{label}</button>;
}
