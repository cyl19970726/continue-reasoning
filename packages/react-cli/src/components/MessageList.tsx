import React from 'react';
import { Box, Text } from 'ink';
import { ClientMessage } from '@continue-reasoning/core';
import chalk from 'chalk';

interface MessageListProps {
  messages: ClientMessage[];
  scrollOffset: number;
  compactMode?: boolean;
  showTimestamps?: boolean;
  showStepNumbers?: boolean;
  selectedMessageId?: string;
  theme?: string;
}

/**
 * 消息列表组件
 */
const MessageList: React.FC<MessageListProps> = ({
  messages,
  scrollOffset,
  compactMode = false,
  showTimestamps = true,
  showStepNumbers = true,
  selectedMessageId,
  theme = 'dark'
}) => {
  // 计算可见消息范围
  const visibleMessages = messages.slice(
    Math.max(0, scrollOffset),
    scrollOffset + 20 // 显示20条消息
  );

  const getMessageColor = (type: ClientMessage['type']): string => {
    switch (type) {
      case 'user': return theme === 'dark' ? 'cyan' : 'blue';
      case 'agent': return theme === 'dark' ? 'green' : 'darkgreen';
      case 'system': return theme === 'dark' ? 'yellow' : 'orange';
      case 'tool': return theme === 'dark' ? 'magenta' : 'purple';
      case 'error': return 'red';
      default: return 'white';
    }
  };

  const getMessageIcon = (type: ClientMessage['type']): string => {
    switch (type) {
      case 'user': return '👤';
      case 'agent': return '🤖';
      case 'system': return '⚙️';
      case 'tool': return '🔧';
      case 'error': return '❌';
      default: return '📝';
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (messages.length === 0) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text dimColor>No messages yet. Start typing to begin...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visibleMessages.map((message, index) => {
        const isSelected = message.id === selectedMessageId;
        const messageColor = getMessageColor(message.type);
        
        return (
          <Box
            key={message.id}
            flexDirection="column"
            marginBottom={compactMode ? 0 : 1}
            paddingLeft={isSelected ? 1 : 0}
          >
            {/* 消息头部 */}
            <Box>
              {isSelected && <Text color="yellow">▶ </Text>}
              
              <Text color={messageColor} bold>
                {getMessageIcon(message.type)} {message.type.toUpperCase()}
              </Text>
              
              {showTimestamps && (
                <Text dimColor> [{formatTimestamp(message.timestamp)}]</Text>
              )}
              
              {showStepNumbers && message.stepIndex !== undefined && (
                <Text dimColor> (Step {message.stepIndex})</Text>
              )}
            </Box>
            
            {/* 消息内容 */}
            <Box paddingLeft={isSelected ? 3 : 2} paddingRight={1}>
              {message.content.split('\n').map((line, lineIndex) => (
                <Text key={lineIndex} wrap="wrap">
                  {line}
                </Text>
              ))}
            </Box>
            
            {/* 元数据（调试模式） */}
            {message.metadata && theme === 'dark' && (
              <Box paddingLeft={2}>
                <Text dimColor>
                  {JSON.stringify(message.metadata).slice(0, 50)}...
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
      
      {/* 滚动指示器 */}
      {messages.length > visibleMessages.length && (
        <Box justifyContent="center" marginTop={1}>
          <Text dimColor>
            Showing {scrollOffset + 1}-{scrollOffset + visibleMessages.length} of {messages.length} messages
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default MessageList;