/** models/fashion_harmony.py MATERIAL_CLASSES / PATTERN_CLASSES / STYLE_CLASSES 와 동일 */

export const MATERIAL_CLASS_OPTIONS = [
  '데님',
  '니트',
  '실크',
  '가죽',
  '울',
  '면',
  '패딩',
  '기타',
].map((label) => ({ value: label, label }))

export const PATTERN_CLASS_OPTIONS = [
  '무지',
  '스트라이프',
  '체크',
  '도트',
  '플로럴',
  '그래픽',
  '호피·뱀피',
  '카무플라쥬',
  '기타',
].map((label) => ({ value: label, label }))

export const STYLE_CLASS_OPTIONS = [
  '캐주얼',
  '고프코어',
  '미니멀',
  '긱시크',
  '로맨틱',
  '빈티지',
  '포멀',
  'Y2K',
  '스트리트',
  '스포티',
].map((label) => ({ value: label, label }))
