export const SUBJECTS = [
  { slug: 'algebra',    value: '대수',      label: '대수'        },
  { slug: 'calculus1',  value: '미적분1',   label: '미적분Ⅰ'     },
  { slug: 'statistics', value: '확률과통계', label: '확률과 통계' },
] as const;

export type SubjectSlug = typeof SUBJECTS[number]['slug'];
export type SubjectValue = typeof SUBJECTS[number]['value'];
