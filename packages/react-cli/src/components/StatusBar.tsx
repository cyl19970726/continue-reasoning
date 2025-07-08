import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  sessionId?: string;
  messageCount: number;
  isProcessing: boolean;
  currentStep?: number;
  totalSteps?: number;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  theme?: string;
  compactMode?: boolean;
}

/**
 * 状态栏组件
 */
const StatusBar: React.FC<StatusBarProps> = ({
  sessionId,
  messageCount,
  isProcessing,
  currentStep,
  totalSteps,
  connectionStatus,
  theme = 'dark',
  compactMode = false
}) => {
  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return '🟢';
      case 'disconnected': return '🔴';
      case 'connecting': return '🟡';
    }
  };

  const getConnectionColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'green';
      case 'disconnected': return 'red';
      case 'connecting': return 'yellow';
    }
  };

  const bgColor = theme === 'dark' ? 'gray' : 'lightgray';
  const textColor = theme === 'dark' ? 'white' : 'black';

  return (
    <Box
      borderStyle="single"
      borderColor={bgColor}
      paddingX={1}
      justifyContent="space-between"
    >
      {/* 左侧：会话信息 */}
      <Box>
        <Text color={textColor}>
          {sessionId ? `📋 Session: ${sessionId.slice(0, 8)}...` : '📋 No session'}
        </Text>
        <Text dimColor> | </Text>
        <Text color={textColor}>
          💬 {messageCount} messages
        </Text>
      </Box>

      {/* 中间：处理状态 */}
      {isProcessing && (
        <Box>
          <Text color="yellow">
            ⚡ Processing
            {currentStep && totalSteps && ` (${currentStep}/${totalSteps})`}
          </Text>
        </Box>
      )}

      {/* 右侧：连接状态和快捷键 */}
      <Box>
        <Text dimColor>
          Ctrl+H: Help | Ctrl+C: Exit
        </Text>
        <Text dimColor> | </Text>
        <Text color={getConnectionColor()}>
          {getConnectionIcon()} {connectionStatus}
        </Text>
      </Box>
    </Box>
  );
};

export default StatusBar;