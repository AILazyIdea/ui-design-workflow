#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const text = readFileSync(path.join(root, 'SKILL.md'), 'utf8')
const match = text.match(/^---\n([\s\S]*?)\n---/)
if (!match) throw new Error('SKILL.md 缺少 YAML frontmatter')
const frontmatter = match[1]
if (!/^name: ui-design-workflow$/m.test(frontmatter)) throw new Error('Skill name 必须匹配目录 ui-design-workflow')
if (!/^description: .+/m.test(frontmatter)) throw new Error('Skill description 不能为空')
if (/whenToUse:/m.test(frontmatter)) throw new Error('whenToUse 不是标准 frontmatter 字段')
if (!/^license: MIT$/m.test(frontmatter)) throw new Error('Skill 必须声明 MIT 许可证')
console.log(JSON.stringify({ valid: true, skill: 'ui-design-workflow' }))
