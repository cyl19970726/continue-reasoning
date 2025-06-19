import { CommandHandler } from '../types';
import { formatSystemInfo, formatError } from '../utils/display-formatter';
import { getWorkspaceDirectory } from '../utils/workspace';

/**
 * 显示文件导入配置信息
 */
export const fileImportInfoCommand: CommandHandler = {
  name: 'fileinfo',
  description: 'Show file import configuration and usage',
  handler: async (args, client) => {
    const config = client.getFileImporter().getConfig();
    
    console.log('\n📁 File Import Configuration:');
    console.log('┌─────────────────────────────────────────────────────┐');
    console.log(`│ Working Directory: ${config.workingDirectory}`);
    console.log(`│ Max File Size: ${formatFileSize(config.maxFileSize)}`);
    console.log(`│ Max Depth: ${config.maxDepth}`);
    console.log(`│ Show File Path: ${config.showFilePath ? 'Yes' : 'No'}`);
    
    if (config.allowedExtensions.length > 0) {
      console.log(`│ Allowed Extensions: ${config.allowedExtensions.join(', ')}`);
    } else {
      console.log('│ Allowed Extensions: All');
    }
    
    console.log('└─────────────────────────────────────────────────────┘');
    
    console.log('\n📖 Usage Examples:');
    console.log('  @README.md                    - Import a single file');
    console.log('  @src/                         - Import all files in directory');
    console.log('  @"path with spaces.txt"       - Import file with spaces in name');
    console.log('  Please analyze @package.json and @src/index.ts');
    console.log('  Multiple files: @file1.ts @file2.ts');
    
    console.log('\n⚠️  Notes:');
    console.log('  • Hidden files and common ignore patterns are skipped');
    console.log('  • Large files will be rejected based on size limits');
    console.log('  • Binary files may not display correctly');
    
    console.log('\n💡 Auto-completion Tips:');
    console.log('  • Type @f and press Tab to see file completions');
    console.log('  • Use Tab after typing @src/ to complete directory contents');
    console.log('  • File completion is case-insensitive');
  }
};

/**
 * 显示文件补全配置信息
 */
export const fileCompletionInfoCommand: CommandHandler = {
  name: 'completion',
  description: 'Show file completion configuration and usage',
  handler: async (args, client) => {
    console.log('\n🔍 File Completion Features:');
    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│ • Type @f and press Tab to see file suggestions      │');
    console.log('│ • Type @src/ and press Tab for directory contents    │');
    console.log('│ • Use quotes for paths with spaces: @"my file.txt"   │');
    console.log('│ • Completion shows up to 10 results by default       │');
    console.log('│ • Directories are shown with trailing /              │');
    console.log('└─────────────────────────────────────────────────────┘');
    
    console.log('\n📚 Completion Examples:');
    console.log('  Input: @p<Tab>     → @package.json, @public/');
    console.log('  Input: @src/<Tab>  → @src/index.ts, @src/types.ts, @src/utils/');
    console.log('  Input: @sr<Tab>    → @src/');
    console.log('  Input: @README<Tab> → @README.md');
    
    console.log('\n⚙️  Completion Settings:');
    console.log('  • Hidden files: Not shown (configurable)');
    console.log('  • Max results: 10 items');
    console.log('  • Cache duration: 5 seconds');
    console.log('  • Case sensitivity: Case-insensitive matching');
    
    console.log('\n🚀 Pro Tips:');
    console.log('  • Press Tab twice to cycle through options');
    console.log('  • Use partial matching: @ind<Tab> → @index.ts');
    console.log('  • Navigate directories: @src/<Tab> → select subdirectories');
  }
};

/**
 * 配置文件导入设置
 */
export const fileImportConfigCommand: CommandHandler = {
  name: 'fileconfig',
  description: 'Configure file import settings',
  handler: async (args, client) => {
    if (args.length === 0) {
      console.log('\n📁 File Import Configuration Commands:');
      console.log('  /fileconfig maxsize <size>    - Set max file size (e.g., 2MB, 1024K)');
      console.log('  /fileconfig maxdepth <depth>  - Set max directory depth');
      console.log('  /fileconfig workdir <path>    - Set working directory');
      console.log('  /fileconfig showpath <on|off> - Toggle file path display');
      console.log('  /fileconfig extensions <ext1,ext2> - Set allowed extensions');
      console.log('  /fileconfig reset             - Reset to default settings');
      return;
    }

    const [setting, value] = args;
    
    try {
      switch (setting.toLowerCase()) {
        case 'maxsize':
          if (!value) {
            console.log(formatError('Please specify a size (e.g., 2MB, 1024K)'));
            return;
          }
          const size = parseFileSize(value);
          client.fileImporter.updateConfig({ maxFileSize: size });
          console.log(formatSystemInfo(`Max file size set to ${formatFileSize(size)}`));
          break;
          
        case 'maxdepth':
          if (!value) {
            console.log(formatError('Please specify a depth number'));
            return;
          }
          const depth = parseInt(value);
          if (isNaN(depth) || depth < 0) {
            console.log(formatError('Depth must be a non-negative number'));
            return;
          }
          client.fileImporter.updateConfig({ maxDepth: depth });
          console.log(formatSystemInfo(`Max directory depth set to ${depth}`));
          break;
          
        case 'workdir':
          if (!value) {
            console.log(formatError('Please specify a directory path'));
            return;
          }
          client.fileImporter.updateConfig({ workingDirectory: value });
          console.log(formatSystemInfo(`Working directory set to ${value}`));
          break;
          
        case 'showpath':
          if (!value) {
            console.log(formatError('Please specify on or off'));
            return;
          }
          const showPath = value.toLowerCase() === 'on' || value.toLowerCase() === 'true';
          client.fileImporter.updateConfig({ showFilePath: showPath });
          console.log(formatSystemInfo(`File path display ${showPath ? 'enabled' : 'disabled'}`));
          break;
          
        case 'extensions':
          if (!value) {
            console.log(formatError('Please specify extensions (e.g., .ts,.js,.json)'));
            return;
          }
          const extensions = value.split(',').map(ext => 
            ext.trim().startsWith('.') ? ext.trim() : '.' + ext.trim()
          );
          client.fileImporter.updateConfig({ allowedExtensions: extensions });
          console.log(formatSystemInfo(`Allowed extensions set to: ${extensions.join(', ')}`));
          break;
          
        case 'reset':
          client.fileImporter.updateConfig({
            maxFileSize: 1024 * 1024, // 1MB
            maxDepth: 3,
            showFilePath: true,
            allowedExtensions: [],
            workingDirectory: getWorkspaceDirectory()
          });
          console.log(formatSystemInfo('File import configuration reset to defaults'));
          break;
          
        default:
          console.log(formatError(`Unknown setting: ${setting}`));
          console.log('Type /fileconfig for available options');
      }
    } catch (error) {
      console.log(formatError(`Configuration error: ${(error as Error).message}`));
    }
  }
};

/**
 * 解析文件大小字符串
 */
function parseFileSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B?)$/i);
  if (!match) {
    throw new Error('Invalid size format. Use formats like: 1MB, 512K, 1024B');
  }
  
  const [, numStr, unit] = match;
  const num = parseFloat(numStr);
  
  switch (unit.toUpperCase()) {
    case 'B':
    case '':
      return Math.floor(num);
    case 'K':
    case 'KB':
      return Math.floor(num * 1024);
    case 'M':
    case 'MB':
      return Math.floor(num * 1024 * 1024);
    case 'G':
    case 'GB':
      return Math.floor(num * 1024 * 1024 * 1024);
    case 'T':
    case 'TB':
      return Math.floor(num * 1024 * 1024 * 1024 * 1024);
    default:
      throw new Error('Unknown unit. Use B, K, M, G, or T');
  }
}

/**
 * 格式化文件大小显示
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
} 