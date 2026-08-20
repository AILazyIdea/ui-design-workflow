/** Runtime validators for the public 1.0.0 contracts. No npm dependency. */
export const SCHEMA_VERSION = '1.0.0'
export const MAX_JSON_BYTES = 1024 * 1024
export const MAX_TEXT_LENGTH = 8192

export class ValidationError extends Error {
  constructor(path, message) { super(`${path}: ${message}`); this.name = 'ValidationError' }
}

const ID = /^[a-z][a-z0-9-]{0,63}$/
const HEX = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/
const FONT = /^[\p{L}\p{N} .+-]{1,100}$/u
const LETTER_SPACING = /^-?(?:\d+|\d*\.\d+)(?:px|em)$/
const LENGTH = '(?:0|-?(?:\\d+|\\d*\\.\\d+)px)'
const RGB = 'rgba?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}(?:\\s*,\\s*(?:0|1|0?\\.\\d+))?\\s*\\)'
const COLOR = `(?:#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|${RGB})`
const SHADOW = new RegExp(`^${LENGTH}(?:\\s+${LENGTH}){1,3}\\s+${COLOR}$`)
const BORDER = new RegExp(`^${LENGTH}\\s+(?:solid|dashed|dotted)\\s+${COLOR}$`)
const ARTIFACT = /^(?!.*(?:^|\/)\.\.(?:\/|$))(?:\.ui-design-workflow\/artifacts\/|[a-zA-Z0-9])[a-zA-Z0-9._/-]{0,240}\.png$/

function fail(path, message) { throw new ValidationError(path, message) }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象')
  return value
}
function noUnknown(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, '不允许的字段')
}
function string(value, path, { optional = false, max = MAX_TEXT_LENGTH, pattern } = {}) {
  if (value == null && optional) return
  if (typeof value !== 'string' || !value.trim()) fail(path, '必须是非空字符串')
  if (value.length > max) fail(path, `长度不能超过 ${max}`)
  if (pattern && !pattern.test(value)) fail(path, '格式不合法')
}
function number(value, path, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, '必须是有限数字')
  if (integer && !Number.isInteger(value)) fail(path, '必须是整数')
  if (value < min || value > max) fail(path, `必须介于 ${min} 和 ${max} 之间`)
}
function list(value, path, { min = 0, max = 100 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `必须是 ${min} 到 ${max} 项的数组`)
  return value
}
function enumValue(value, path, values) {
  if (!values.includes(value)) fail(path, `必须是 ${values.join('、')} 之一`)
}
function unique(values, path) { if (new Set(values).size !== values.length) fail(path, '不能包含重复项') }
function validateViewport(value, path) {
  object(value, path); noUnknown(value, ['width', 'height', 'dpr'], path)
  number(value.width, `${path}.width`, { min: 320, max: 7680, integer: true })
  number(value.height, `${path}.height`, { min: 320, max: 16384, integer: true })
  if (value.dpr != null) number(value.dpr, `${path}.dpr`, { min: 1, max: 2 })
}
function validateBounded(value, path = '$', depth = 0) {
  if (depth > 12) fail(path, '嵌套不能超过 12 层')
  if (typeof value === 'string') return string(value, path)
  if (value == null || typeof value === 'boolean') return
  if (typeof value === 'number') return number(value, path)
  if (Array.isArray(value)) {
    list(value, path, { max: 200 }); value.forEach((item, i) => validateBounded(item, `${path}[${i}]`, depth + 1)); return
  }
  object(value, path)
  if (Object.keys(value).length > 100) fail(path, '对象字段不能超过 100 个')
  for (const [key, item] of Object.entries(value)) { string(key, `${path}.<key>`, { max: 128 }); validateBounded(item, `${path}.${key}`, depth + 1) }
}

function validateTokens(tokens, path) {
  object(tokens, path)
  noUnknown(tokens, ['background', 'colors', 'typography', 'spacing', 'sizes', 'radius', 'shadows', 'borders'], path)
  if (tokens.background != null) {
    object(tokens.background, `${path}.background`); noUnknown(tokens.background, ['value'], `${path}.background`)
    string(tokens.background.value, `${path}.background.value`, { max: 9, pattern: HEX })
  }
  const colors = list(tokens.colors || [], `${path}.colors`, { max: 64 }); const colorNames = []
  colors.forEach((item, i) => {
    const itemPath = `${path}.colors[${i}]`; object(item, itemPath); noUnknown(item, ['name', 'hex', 'usage'], itemPath)
    string(item.name, `${itemPath}.name`, { max: 64, pattern: ID }); string(item.hex, `${itemPath}.hex`, { max: 9, pattern: HEX })
    if (item.usage != null) string(item.usage, `${itemPath}.usage`, { optional: true }); colorNames.push(item.name)
  }); unique(colorNames, `${path}.colors`)

  if (tokens.typography != null) {
    const typography = tokens.typography; object(typography, `${path}.typography`); noUnknown(typography, ['fontFamilies', 'scale'], `${path}.typography`)
    const fonts = list(typography.fontFamilies || [], `${path}.typography.fontFamilies`, { max: 8 }); const roles = []
    fonts.forEach((item, i) => {
      const itemPath = `${path}.typography.fontFamilies[${i}]`; object(item, itemPath); noUnknown(item, ['role', 'family', 'fallback'], itemPath)
      string(item.role, `${itemPath}.role`, { max: 64, pattern: ID }); string(item.family, `${itemPath}.family`, { max: 100, pattern: FONT })
      list(item.fallback || [], `${itemPath}.fallback`, { max: 12 }).forEach((font, j) => string(font, `${itemPath}.fallback[${j}]`, { max: 100, pattern: FONT }))
      roles.push(item.role)
    }); unique(roles, `${path}.typography.fontFamilies`)
    const scale = list(typography.scale || [], `${path}.typography.scale`, { max: 32 }); const levels = []
    scale.forEach((item, i) => {
      const itemPath = `${path}.typography.scale[${i}]`; object(item, itemPath); noUnknown(item, ['level', 'size', 'weight', 'lineHeight', 'letterSpacing'], itemPath)
      string(item.level, `${itemPath}.level`, { max: 64, pattern: ID }); number(item.size, `${itemPath}.size`, { min: 8, max: 200 })
      number(item.weight, `${itemPath}.weight`, { min: 100, max: 900, integer: true }); number(item.lineHeight, `${itemPath}.lineHeight`, { min: 0.5, max: 4 })
      if (item.letterSpacing != null) string(item.letterSpacing, `${itemPath}.letterSpacing`, { optional: true, max: 16, pattern: LETTER_SPACING }); levels.push(item.level)
    }); unique(levels, `${path}.typography.scale`)
  }
  if (tokens.spacing != null) {
    object(tokens.spacing, `${path}.spacing`); noUnknown(tokens.spacing, ['unit', 'observedValues'], `${path}.spacing`); number(tokens.spacing.unit, `${path}.spacing.unit`, { min: 1, max: 64 })
    const values = list(tokens.spacing.observedValues || [], `${path}.spacing.observedValues`, { max: 64 }); values.forEach((item, i) => number(item, `${path}.spacing.observedValues[${i}]`, { min: 0, max: 512 })); unique(values, `${path}.spacing.observedValues`)
  }
  if (tokens.radius != null) {
    object(tokens.radius, `${path}.radius`); noUnknown(tokens.radius, ['values'], `${path}.radius`)
    const values = list(tokens.radius.values || [], `${path}.radius.values`, { max: 32 }); values.forEach((item, i) => number(item, `${path}.radius.values[${i}]`, { min: 0, max: 128 })); unique(values, `${path}.radius.values`)
  }
  if (tokens.sizes != null) {
    object(tokens.sizes, `${path}.sizes`)
    const names = []
    for (const [name, size] of Object.entries(tokens.sizes)) {
      string(name, `${path}.sizes.<key>`, { max: 64, pattern: ID })
      number(size, `${path}.sizes.${name}`, { min: 8, max: 256, integer: true })
      names.push(name)
    }
    unique(names, `${path}.sizes`)
  }
  for (const [key, pattern] of [['shadows', SHADOW], ['borders', BORDER]]) {
    const values = list(tokens[key] || [], `${path}.${key}`, { max: 32 }); const names = []
    values.forEach((item, i) => {
      const itemPath = `${path}.${key}[${i}]`; object(item, itemPath); noUnknown(item, ['name', 'value'], itemPath)
      string(item.name, `${itemPath}.name`, { max: 64, pattern: ID }); string(item.value, `${itemPath}.value`, { max: 160, pattern }); names.push(item.name)
    }); unique(names, `${path}.${key}`)
  }
}

export function validateSpec(value, { requireDesignTokens = false } = {}) {
  object(value, '$'); noUnknown(value, ['schemaVersion', 'mode', 'meta', 'designTokens', 'layout', 'content', 'interactions'], '$')
  if (value.schemaVersion !== SCHEMA_VERSION) fail('$.schemaVersion', `必须是 ${SCHEMA_VERSION}`)
  enumValue(value.mode, '$.mode', ['reproduce', 'redesign'])
  object(value.meta, '$.meta'); noUnknown(value.meta, ['pageType', 'summary', 'viewport', 'sourceDescription'], '$.meta')
  string(value.meta.pageType, '$.meta.pageType', { max: 120 }); string(value.meta.summary, '$.meta.summary')
  if (value.meta.sourceDescription != null) string(value.meta.sourceDescription, '$.meta.sourceDescription', { optional: true })
  if (value.meta.viewport != null) validateViewport(value.meta.viewport, '$.meta.viewport')
  if (requireDesignTokens && value.designTokens == null) fail('$.designTokens', '此操作需要 designTokens')
  if (value.designTokens != null) validateTokens(value.designTokens, '$.designTokens')
  for (const key of ['layout', 'content', 'interactions']) if (value[key] != null) validateBounded(value[key], `$.${key}`)
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) fail('$', `JSON 不能超过 ${MAX_JSON_BYTES} bytes`)
  return value
}

export function validateReview(value) {
  object(value, '$'); noUnknown(value, ['schemaVersion', 'mode', 'artifacts', 'evaluator', 'issues', 'summary'], '$')
  if (value.schemaVersion !== SCHEMA_VERSION) fail('$.schemaVersion', `必须是 ${SCHEMA_VERSION}`)
  if (value.mode !== 'review') fail('$.mode', '必须是 review')
  object(value.artifacts, '$.artifacts'); noUnknown(value.artifacts, ['candidate', 'reference', 'viewport'], '$.artifacts')
  string(value.artifacts.candidate, '$.artifacts.candidate', { max: 241, pattern: ARTIFACT })
  if (value.artifacts.reference != null) string(value.artifacts.reference, '$.artifacts.reference', { optional: true, max: 241, pattern: ARTIFACT })
  validateViewport(value.artifacts.viewport, '$.artifacts.viewport')
  object(value.evaluator, '$.evaluator'); noUnknown(value.evaluator, ['kind', 'name', 'model'], '$.evaluator')
  enumValue(value.evaluator.kind, '$.evaluator.kind', ['human', 'model', 'automated']); string(value.evaluator.name, '$.evaluator.name', { max: 120 })
  if (value.evaluator.model != null) string(value.evaluator.model, '$.evaluator.model', { optional: true, max: 120 })
  const issues = list(value.issues, '$.issues', { max: 100 }); const ids = []
  issues.forEach((item, i) => {
    const itemPath = `$.issues[${i}]`; object(item, itemPath); noUnknown(item, ['id', 'severity', 'category', 'location', 'evidence', 'expected', 'actual', 'fix'], itemPath)
    string(item.id, `${itemPath}.id`, { max: 64, pattern: ID }); enumValue(item.severity, `${itemPath}.severity`, ['P0', 'P1', 'P2'])
    enumValue(item.category, `${itemPath}.category`, ['fidelity', 'functional', 'accessibility', 'responsive', 'content', 'visual'])
    for (const field of ['location', 'evidence', 'expected', 'actual', 'fix']) string(item[field], `${itemPath}.${field}`)
    ids.push(item.id)
  }); unique(ids, '$.issues')
  if (value.summary != null) string(value.summary, '$.summary', { optional: true })
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) fail('$', `JSON 不能超过 ${MAX_JSON_BYTES} bytes`)
  return value
}

/**
 * Optimize plan: the vision model's one-shot output for the automated
 * see -> fix -> re-see loop. It bundles a `review` (what is wrong, with
 * evidence) and a `spec` in redesign mode (how to fix it, with tokens).
 */
export function validateOptimizePlan(value) {
  object(value, '$')
  noUnknown(value, ['schemaVersion', 'mode', 'input', 'review', 'spec'], '$')
  if (value.schemaVersion !== SCHEMA_VERSION) fail('$.schemaVersion', `必须是 ${SCHEMA_VERSION}`)
  if (value.mode !== 'optimize') fail('$.mode', '必须是 optimize')
  object(value.input, '$.input')
  noUnknown(value.input, ['kind', 'summary', 'reference'], '$.input')
  enumValue(value.input.kind, '$.input.kind', ['screenshot', 'html', 'description'])
  string(value.input.summary, '$.input.summary')
  if (value.input.reference != null) string(value.input.reference, '$.input.reference', { optional: true, max: 241 })
  const review = validateReview(value.review)
  const spec = validateSpec(value.spec, { requireDesignTokens: true })
  if (spec.mode !== 'redesign') fail('$.spec.mode', '优化方案中的 spec.mode 必须是 redesign')
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) fail('$', `JSON 不能超过 ${MAX_JSON_BYTES} bytes`)
  return { input: value.input, review, spec }
}

export function safeFontStack(font) {
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])
  return [font.family, ...(font.fallback || [])].map((item) => generic.has(item) ? item : `"${item}"`).join(', ')
}
