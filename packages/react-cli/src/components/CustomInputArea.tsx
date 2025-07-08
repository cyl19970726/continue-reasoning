import React, { useState, useCallback } from 'react';
import { Box, Text, useStdin } from 'ink';
import { useKeypress } from '../hooks/useKeypress.js';

interface CustomInputAreaProps {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (value: string) => void;
  onChange: (value: string) => void;
  theme?: string;
  compactMode?: boolean;
}

/**
 * 基于 Gemini CLI 模式的自定义输入组件
 */
const CustomInputArea: React.FC<CustomInputAreaProps> = ({
  value,
  placeholder = 'Type your message...',
  disabled = false,
  onSubmit,
  onChange,
  theme = 'dark',
  compactMode = false
}) => {
  const [text, setText] = useState(value);
  const [cursorPosition, setCursorPosition] = useState(0);
  
  const handleSubmit = useCallback((submittedValue: string) => {
    if (submittedValue.trim()) {
      onSubmit(submittedValue);
      setText('');
      setCursorPosition(0);
      onChange('');
    }
  }, [onSubmit, onChange]);

  const handleKeypress = useCallback((key: any) => {
    if (disabled) return;

    // Handle Enter key
    if (key.name === 'return' && !key.ctrl && !key.meta) {
      handleSubmit(text);
      return;
    }

    // Handle Ctrl+Enter for multiline (future enhancement)
    if (key.name === 'return' && (key.ctrl || key.meta)) {
      // For now, just submit
      handleSubmit(text);
      return;
    }

    // Handle Backspace
    if (key.name === 'backspace') {
      if (cursorPosition > 0) {
        const newText = text.slice(0, cursorPosition - 1) + text.slice(cursorPosition);
        setText(newText);
        setCursorPosition(cursorPosition - 1);
        onChange(newText);
      }
      return;
    }

    // Handle Delete
    if (key.name === 'delete') {
      if (cursorPosition < text.length) {
        const newText = text.slice(0, cursorPosition) + text.slice(cursorPosition + 1);
        setText(newText);
        onChange(newText);
      }
      return;
    }

    // Handle Arrow keys
    if (key.name === 'left') {
      setCursorPosition(Math.max(0, cursorPosition - 1));
      return;
    }

    if (key.name === 'right') {
      setCursorPosition(Math.min(text.length, cursorPosition + 1));
      return;
    }

    // Handle Home/End
    if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
      setCursorPosition(0);
      return;
    }

    if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
      setCursorPosition(text.length);
      return;
    }

    // Handle Ctrl+U (clear line)
    if (key.ctrl && key.name === 'u') {
      setText('');
      setCursorPosition(0);
      onChange('');
      return;
    }

    // Handle regular character input
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const char = key.sequence;
      const newText = text.slice(0, cursorPosition) + char + text.slice(cursorPosition);
      setText(newText);
      setCursorPosition(cursorPosition + 1);
      onChange(newText);
      return;
    }
  }, [disabled, text, cursorPosition, handleSubmit, onChange]);

  useKeypress(handleKeypress, { isActive: !disabled });

  const inputColor = theme === 'dark' ? 'cyan' : 'blue';
  const borderColor = disabled ? 'gray' : inputColor;

  // Render the input with cursor
  const renderTextWithCursor = () => {
    if (text.length === 0) {
      return (
        <Text color="gray">
          {cursorPosition === 0 ? '█' : ''}{placeholder}
        </Text>
      );
    }

    const beforeCursor = text.slice(0, cursorPosition);
    const atCursor = text[cursorPosition] || ' ';
    const afterCursor = text.slice(cursorPosition + 1);

    return (
      <Text>
        {beforeCursor}
        <Text backgroundColor={inputColor} color="black">
          {atCursor}
        </Text>
        {afterCursor}
      </Text>
    );
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={compactMode ? 0 : 1}
    >
      {/* 输入提示 */}
      <Box marginBottom={compactMode ? 0 : 1}>
        <Text color={inputColor} bold>
          {disabled ? '⏳ Processing...' : '💬 Message:'}
        </Text>
        {!disabled && (
          <Text dimColor>
            {' '}(Enter to send, Ctrl+U to clear)
          </Text>
        )}
      </Box>

      {/* 输入框 */}
      <Box>
        {disabled ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <Box width="100%">
            <Text color={inputColor}>{'> '}</Text>
            <Box flexGrow={1}>
              {renderTextWithCursor()}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default CustomInputArea;