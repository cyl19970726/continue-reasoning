import * as fs from 'fs';
import * as path from 'path';

/**
 * 检测workspace目录的工具函数
 */

/**
 * 寻找workspace根目录
 * 从当前目录向上查找，直到找到包含特定文件的目录
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  const indicators = [
    'package.json',
    '.git',
    'pnpm-workspace.yaml',
    'lerna.json',
    'nx.json',
    'workspace.json'
  ];

  let currentDir = startDir;
  
  while (currentDir !== path.dirname(currentDir)) {
    // 检查是否包含workspace指示文件
    for (const indicator of indicators) {
      const fullPath = path.join(currentDir, indicator);
      if (fs.existsSync(fullPath)) {
        // 对于package.json，检查是否有workspaces字段或者是monorepo
        if (indicator === 'package.json') {
          try {
            const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            if (packageJson.workspaces || packageJson.name?.includes('workspace')) {
              return currentDir;
            }
          } catch (error) {
            // 忽略JSON解析错误，继续查找
          }
        } else {
          return currentDir;
        }
      }
    }
    
    currentDir = path.dirname(currentDir);
  }

  // 如果没找到，返回当前目录
  return startDir;
}

/**
 * 获取workspace目录
 * 优先使用环境变量，然后尝试自动检测
 */
export function getWorkspaceDirectory(): string {
  // 1. 检查环境变量
  if (process.env.WORKSPACE_DIR) {
    return path.resolve(process.env.WORKSPACE_DIR);
  }

  // 2. 检查特定的workspace目录名称
  const currentDir = process.cwd();
  const possibleWorkspaces = [
    'cli-coding-workspace',
    'workspace',
    'workspaces'
  ];

  // 检查当前目录或父目录中是否有这些workspace目录
  for (const workspaceName of possibleWorkspaces) {
    const workspacePath = path.join(currentDir, workspaceName);
    if (fs.existsSync(workspacePath) && fs.statSync(workspacePath).isDirectory()) {
      return workspacePath;
    }

    // 检查父目录
    const parentWorkspacePath = path.join(path.dirname(currentDir), workspaceName);
    if (fs.existsSync(parentWorkspacePath) && fs.statSync(parentWorkspacePath).isDirectory()) {
      return parentWorkspacePath;
    }
  }

  // 3. 自动检测workspace根目录
  const workspaceRoot = findWorkspaceRoot();
  
  // 检查是否有专门的workspace子目录
  const workspaceSubdir = path.join(workspaceRoot, 'cli-coding-workspace');
  if (fs.existsSync(workspaceSubdir) && fs.statSync(workspaceSubdir).isDirectory()) {
    return workspaceSubdir;
  }

  // 4. 返回检测到的workspace根目录
  return workspaceRoot;
}

/**
 * 检查目录是否是有效的workspace
 */
export function isValidWorkspace(dirPath: string): boolean {
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return false;
    }

    // 检查是否可读
    fs.accessSync(dirPath, fs.constants.R_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 获取相对于workspace的路径
 */
export function getRelativeToWorkspace(filePath: string, workspaceDir?: string): string {
  const workspace = workspaceDir || getWorkspaceDirectory();
  return path.relative(workspace, path.resolve(filePath));
}

/**
 * 解析相对于workspace的路径为绝对路径
 */
export function resolveFromWorkspace(relativePath: string, workspaceDir?: string): string {
  const workspace = workspaceDir || getWorkspaceDirectory();
  return path.resolve(workspace, relativePath);
} 