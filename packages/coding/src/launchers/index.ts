/**
 * 统一的启动器入口点
 */

import { ReactCLIConfig } from '@continue-reasoning/react-cli';

export { ReactCLILauncher, launchReactCLI } from './react-cli-launcher.js';

/**
 * 启动Coding Agent with React CLI
 */
export async function launchCodingAgent(
  workspacePath?: string,
  options: Partial<ReactCLIConfig> = {}
): Promise<any> {
  console.log('🎨 Using React CLI interface...');
  const { ReactCLILauncher } = await import('./react-cli-launcher.js');
  const launcher = new ReactCLILauncher(workspacePath, options);
  await launcher.initialize();
  await launcher.start();
  return launcher;
}