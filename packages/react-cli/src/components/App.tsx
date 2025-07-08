import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ReactCLIClient } from '../ReactCLIClient.js';
import { ReactCLIConfig, UIState } from '../interfaces/index.js';
import { ClientMessage } from '@continue-reasoning/core';
import MessageList from './MessageList.js';
import InputArea from './InputArea.js';
import StatusBar from './StatusBar.js';
import HelpPanel from './HelpPanel.js';

interface AppProps {
  client: ReactCLIClient;
  config: ReactCLIConfig;
  messages: ClientMessage[];
  uiState: UIState;
  onUIStateChange: (state: Partial<UIState>) => void;
  onSubmit: (message: string) => void;
  onExit: () => void;
}

/**
 * 主应用组件
 */
const App: React.FC<AppProps> = ({
  client,
  config,
  messages,
  uiState,
  onUIStateChange,
  onSubmit,
  onExit
}) => {
  const { exit } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);

  // 显示的消息（可能被搜索过滤）
  const displayMessages = searchQuery
    ? client.searchMessages(searchQuery)
    : messages;

  // 键盘输入处理
  useInput((input, key) => {
    // 退出
    if (key.ctrl && input === 'c') {
      onExit();
      exit();
      return;
    }

    // 帮助
    if (key.ctrl && input === 'h') {
      onUIStateChange({ showHelp: !uiState.showHelp });
      return;
    }

    // 清屏
    if (key.ctrl && input === 'l') {
      client.clearMessages();
      return;
    }

    // 切换紧凑模式
    if (key.ctrl && input === 'k') {
      client.toggleCompactMode();
      return;
    }

    // 切换主题
    if (key.ctrl && input === 't') {
      const themes: Array<'light' | 'dark'> = ['light', 'dark'];
      const currentIndex = themes.indexOf(uiState.theme as any);
      const nextIndex = (currentIndex + 1) % themes.length;
      client.setTheme(themes[nextIndex]);
      return;
    }

    // 搜索
    if (key.ctrl && input === 'f') {
      // TODO: 实现搜索模式
      return;
    }

    // 滚动
    if (key.upArrow) {
      setScrollOffset(Math.max(0, scrollOffset - 1));
      return;
    }
    if (key.downArrow) {
      setScrollOffset(Math.min(displayMessages.length - 1, scrollOffset + 1));
      return;
    }
    if (key.pageUp) {
      setScrollOffset(Math.max(0, scrollOffset - 10));
      return;
    }
    if (key.pageDown) {
      setScrollOffset(Math.min(displayMessages.length - 1, scrollOffset + 10));
      return;
    }
  });

  // 自动滚动到底部
  useEffect(() => {
    if (!uiState.selectedMessageId) {
      setScrollOffset(Math.max(0, displayMessages.length - 10));
    }
  }, [displayMessages.length, uiState.selectedMessageId]);

  return (
    <Box flexDirection="column" height="100%">
      {/* 标题栏 */}
      <Box
        borderStyle="round"
        borderColor={uiState.theme === 'dark' ? 'cyan' : 'blue'}
        paddingX={1}
        marginBottom={1}
      >
        <Text bold color="cyan">
          🚀 Continue Reasoning - React CLI
        </Text>
        {searchQuery && (
          <Text color="yellow" dimColor>
            {' '}(Searching: {searchQuery})
          </Text>
        )}
      </Box>

      {/* 主内容区 */}
      <Box flexGrow={1} flexDirection="column">
        {uiState.showHelp ? (
          <HelpPanel theme={uiState.theme} />
        ) : (
          <MessageList
            messages={displayMessages}
            scrollOffset={scrollOffset}
            compactMode={uiState.compactMode}
            showTimestamps={config.showTimestamps}
            showStepNumbers={config.showStepNumbers}
            selectedMessageId={uiState.selectedMessageId}
            theme={uiState.theme}
          />
        )}
      </Box>

      {/* 输入区域 */}
      {!uiState.showHelp && (
        <Box marginTop={1}>
          <InputArea
            value={uiState.currentInput}
            placeholder={uiState.isProcessing ? 'Processing...' : 'Type your message...'}
            disabled={uiState.isProcessing}
            onSubmit={onSubmit}
            onChange={(value) => onUIStateChange({ currentInput: value })}
            theme={uiState.theme}
          />
        </Box>
      )}

      {/* 状态栏 */}
      <Box marginTop={1}>
        <StatusBar
          sessionId={client.currentSessionId}
          messageCount={displayMessages.length}
          isProcessing={uiState.isProcessing}
          connectionStatus="connected"
          theme={uiState.theme}
          compactMode={uiState.compactMode}
        />
      </Box>
    </Box>
  );
};

export default App;