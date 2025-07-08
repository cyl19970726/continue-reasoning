import React from 'react';
import { Box, Text } from 'ink';

interface HelpPanelProps {
  theme?: string;
}

/**
 * 帮助面板组件
 */
const HelpPanel: React.FC<HelpPanelProps> = ({ theme = 'dark' }) => {
  const titleColor = theme === 'dark' ? 'cyan' : 'blue';
  const keyColor = theme === 'dark' ? 'yellow' : 'orange';
  const descColor = theme === 'dark' ? 'white' : 'black';

  const shortcuts = [
    { key: 'Enter', desc: 'Send message' },
    { key: 'Ctrl+C', desc: 'Exit application' },
    { key: 'Ctrl+H', desc: 'Toggle this help' },
    { key: 'Ctrl+L', desc: 'Clear messages' },
    { key: 'Ctrl+K', desc: 'Toggle compact mode' },
    { key: 'Ctrl+T', desc: 'Change theme' },
    { key: 'Ctrl+F', desc: 'Search messages' },
    { key: 'Ctrl+E', desc: 'Export messages' },
    { key: '↑/↓', desc: 'Scroll messages' },
    { key: 'PgUp/PgDn', desc: 'Scroll faster' },
  ];

  const features = [
    '🔧 Tool result formatting with syntax highlighting',
    '📄 File import support for multiple formats',
    '🌊 Real-time streaming responses',
    '💾 Session management and persistence',
    '🎨 Customizable themes and display modes',
    '🔍 Message search and filtering',
    '📤 Export conversation history',
  ];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text color={titleColor} bold underline>
          🚀 Continue Reasoning - React CLI Help
        </Text>
      </Box>

      {/* 快捷键部分 */}
      <Box flexDirection="column" marginBottom={2}>
        <Text color={titleColor} bold>
          ⌨️  Keyboard Shortcuts
        </Text>
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          {shortcuts.map((shortcut, index) => (
            <Box key={index}>
              <Text color={keyColor} bold>
                {shortcut.key.padEnd(12)}
              </Text>
              <Text color={descColor}>{shortcut.desc}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {/* 功能特性部分 */}
      <Box flexDirection="column" marginBottom={2}>
        <Text color={titleColor} bold>
          ✨ Features
        </Text>
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          {features.map((feature, index) => (
            <Text key={index} color={descColor}>
              {feature}
            </Text>
          ))}
        </Box>
      </Box>

      {/* 提示部分 */}
      <Box flexDirection="column">
        <Text color={titleColor} bold>
          💡 Tips
        </Text>
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          <Text color={descColor}>
            • Type your message and press Enter to send
          </Text>
          <Text color={descColor}>
            • Use arrow keys to scroll through message history
          </Text>
          <Text color={descColor}>
            • Import files by typing: /import &lt;file-path&gt;
          </Text>
          <Text color={descColor}>
            • Create new session: /new-session
          </Text>
          <Text color={descColor}>
            • Switch session: /switch-session &lt;session-id&gt;
          </Text>
        </Box>
      </Box>

      {/* 底部提示 */}
      <Box marginTop={2} justifyContent="center">
        <Text dimColor italic>
          Press Ctrl+H again to close this help
        </Text>
      </Box>
    </Box>
  );
};

export default HelpPanel;