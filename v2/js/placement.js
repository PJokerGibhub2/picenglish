import * as store from './store.js';

const LEVELS = ['A0', 'A1.1', 'A1.2', 'A2.1', 'A2.2'];
const SKILLS = ['vocab', 'listening', 'phrase'];
let questionBank = null;
let curriculum = null;

export async function loadPlacement() {
  if (!questionBank) {
    const response = await fetch(new URL('../data/placement.json', import.meta.url));
    if (!response.ok) throw new Error('โหลดข้อสอบวัดระดับไม่สำเร็จ');
    questionBank = await response.json();
  }
  if (!curriculum) {
    try {
      const response = await fetch(new URL('../data/curriculum.json', import.meta.url));
      if (response.ok) curriculum = await response.json();
    } catch (err) { curriculum = null; }
  }
  return questionBank.items;
}

export function createSession(options = {}) {
  const bank = options.items || (questionBank && questionBank.items) || [];
  const goal = options.short ? 5 : 18;
  const counts = Object.fromEntries(LEVELS.map((level) => [level, { total: 0, correct: 0 }]));
  const skillStats = Object.fromEntries(SKILLS.map((skill) => [skill, { total: 0, correct: 0, levels: [] }]));
  const asked = new Set();
  let currentLevel = 1;
  let streak = 0;
  let previousSkill = '';
  let skillRun = 0;
  let current = null;
  let answers = 0;
  let finished = false;

  function enough() {
    return answers >= goal;
  }
  function next() {
    if (current || finished || enough()) { if (enough()) finished = true; return null; }
    const level = LEVELS[currentLevel];
    const candidates = bank.filter((item) => !asked.has(item.id) && item.level === level
      && !(item.skill === previousSkill && skillRun >= 2));
    let pool = candidates;
    if (!pool.length) pool = bank.filter((item) => !asked.has(item.id) && item.level === level);
    if (!pool.length) pool = bank.filter((item) => !asked.has(item.id)
      && !(item.skill === previousSkill && skillRun >= 2));
    if (!pool.length) pool = bank.filter((item) => !asked.has(item.id));
    if (!pool.length) { finished = true; return null; }
    const skill = SKILLS.filter((key) => pool.some((item) => item.skill === key))
      .filter((key) => !(key === previousSkill && skillRun >= 2))
      .sort((a, b) => skillStats[a].total - skillStats[b].total)[0];
    current = pool.find((item) => item.skill === skill) || pool[0];
    asked.add(current.id);
    return { ...current, number: answers + 1, total: goal };
  }
  function answer(index, correct) {
    if (!current) return false;
    const item = current;
    const passed = typeof correct === 'boolean' ? correct : index === item.answer;
    counts[item.level].total++;
    if (passed) counts[item.level].correct++;
    const ss = skillStats[item.skill];
    ss.total++;
    if (passed) ss.correct++;
    ss.levels.push({ level: LEVELS.indexOf(item.level), correct: passed });
    answers++;
    if (item.skill === previousSkill) skillRun++;
    else { previousSkill = item.skill; skillRun = 1; }
    if (passed) { streak = streak >= 0 ? streak + 1 : 1; if (streak >= 2) currentLevel = Math.min(4, currentLevel + 1), streak = 0; }
    else { streak = streak <= 0 ? streak - 1 : -1; if (streak <= -2) currentLevel = Math.max(0, currentLevel - 1), streak = 0; }
    current = null;
    if (enough()) finished = true;
    return passed;
  }
  function progress() {
    return { current: answers, total: goal, level: LEVELS[currentLevel], answersByLevel: Object.fromEntries(LEVELS.map((level) => [level, counts[level].total])) };
  }
  function result() {
    const weighted = [];
    for (const skill of SKILLS) {
      const points = skillStats[skill].levels.reduce((sum, item) => sum + (item.correct ? item.level : Math.max(0, item.level - 1)), 0);
      weighted.push({ skill, level: skillStats[skill].levels.length ? points / skillStats[skill].levels.length : 0 });
    }
    const average = weighted.reduce((sum, entry) => sum + entry.level, 0) / weighted.length;
    let levelIndex = Math.max(0, Math.min(4, Math.round(average)));
    const listening = weighted.find((entry) => entry.skill === 'listening').level;
    const vocabulary = weighted.find((entry) => entry.skill === 'vocab').level;
    if (vocabulary - listening > 1) levelIndex = Math.min(levelIndex, Math.max(0, Math.floor(listening)));
    const level = LEVELS[levelIndex];
    const lessons = curriculum?.levels?.find((entry) => entry.id === level)?.units?.flatMap((unit) => unit.lessons) || [];
    const output = {
      level,
      skills: Object.fromEntries(SKILLS.map((skill) => [skill, { correct: skillStats[skill].correct, total: skillStats[skill].total, percent: skillStats[skill].total ? Math.round(skillStats[skill].correct * 100 / skillStats[skill].total) : 0 }])),
      correct: Object.values(skillStats).reduce((sum, entry) => sum + entry.correct, 0),
      total: answers,
      recommendLessonId: lessons[0]?.id || null,
    };
    store.setPlacement(output);
    return output;
  }
  return { next, answer, progress, result };
}
