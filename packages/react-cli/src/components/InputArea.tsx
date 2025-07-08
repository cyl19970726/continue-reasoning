import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputAreaProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  onSubmit: (value: string) => void;
  onChange: (value: string) => void;
  onCancel?: () => void;
  theme?: string;
  compactMode?: boolean;
}

/**
 * 输入区域组件
 */
const InputArea: React.FC<InputAreaProps> = ({
  value,
  placeholder = 'Type your message...',
  multiline = false,
  disabled = false,
  onSubmit,
  onChange,
  onCancel,
  theme = 'dark',
  compactMode = false
}) => {
  const [isMultiline, setIsMultiline] = useState(multiline);

  const handleSubmit = (input: string) => {
    if (input.trim()) {
      onSubmit(input);
      onChange(''); // 清空输入
    }
  };

  const inputColor = theme === 'dark' ? 'cyan' : 'blue';
  const borderColor = disabled ? 'gray' : inputColor;

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
            {' '}(Ctrl+Enter for multiline, Enter to send)
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
              <TextInput
                value={value}
                placeholder={placeholder}
                onChange={onChange}
                onSubmit={handleSubmit}
                showCursor
                focus={!disabled}
              />
            </Box>
          </Box>
        )}
      </Box>

      {/* 多行模式指示 */}
      {isMultiline && !disabled && (
        <Box marginTop={1}>
          <Text dimColor>
            Multiline mode active. Press Ctrl+Enter to toggle, Enter to send.
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default InputArea;