import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

export class WorkspaceError extends Error { constructor(message) { super(message); this.name = 'WorkspaceError' } }
const inside = (root, candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`)

export function resolveWorkspaceRoot(rootArg = process.cwd()) {
  const root = path.resolve(rootArg)
  if (!existsSync(root) || !lstatSync(root).isDirectory()) throw new WorkspaceError(`工作区不是现有目录：${root}`)
  return realpathSync(root)
}
export function assertRelativePath(value, label = '路径') {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value)) throw new WorkspaceError(`${label}必须是非空相对路径`)
  const normalized = path.normalize(value)
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new WorkspaceError(`${label}不能离开工作区`)
  return normalized
}
export function resolveExistingInside(root, relativePath, label = '输入文件') {
  const candidate = path.resolve(root, assertRelativePath(relativePath, label))
  if (!existsSync(candidate)) throw new WorkspaceError(`${label}不存在：${relativePath}`)
  const actual = realpathSync(candidate)
  if (!inside(root, actual)) throw new WorkspaceError(`${label}不能通过符号链接离开工作区`)
  return actual
}
function ensureDirectory(parent, name) {
  const dir = path.join(parent, name)
  if (existsSync(dir)) {
    const stat = lstatSync(dir)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new WorkspaceError(`${name} 必须是非符号链接目录`)
  } else mkdirSync(dir)
  return realpathSync(dir)
}
export function artifactPath(root, outputName, extension = '.png') {
  if (typeof outputName !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(outputName)) throw new WorkspaceError('输出名称只能含字母、数字、点、下划线和连字符')
  const workflowDir = ensureDirectory(root, '.ui-design-workflow')
  const artifacts = ensureDirectory(workflowDir, 'artifacts')
  if (!inside(root, workflowDir) || !inside(root, artifacts)) throw new WorkspaceError('artifact 目录不能离开工作区')
  return path.join(artifacts, outputName.endsWith(extension) ? outputName : `${outputName}${extension}`)
}
