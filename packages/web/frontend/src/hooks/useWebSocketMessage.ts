import { useEffect, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { ServerMessage, ClientMessage } from '../types';

interface UseWebSocketMessageOptions {
  onMessage?: (message: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string | null) => void;
}

interface UseWebSocketMessageReturn {
  isConnected: boolean;
  error: string | null;
  sendMessage: (message: ClientMessage) => void;
  reconnect: () => void;
  disconnect: () => void;
}

export function useWebSocketMessage(options: UseWebSocketMessageOptions = {}): UseWebSocketMessageReturn {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const { isConnected, error, sendMessage, reconnect, disconnect, subscribe } = useWebSocketContext();
  
  // 使用 ref 存储回调，避免不必要的重新订阅
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  
  // 更新回调引用
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  });

  // 订阅消息
  useEffect(() => {
    if (!onMessageRef.current) return;
    
    const unsubscribe = subscribe((message: ServerMessage) => {
      onMessageRef.current?.(message);
    });
    
    return unsubscribe;
  }, [subscribe]);

  // 监听连接状态变化
  useEffect(() => {
    if (isConnected) {
      onConnectRef.current?.();
    } else {
      onDisconnectRef.current?.();
    }
  }, [isConnected]);

  // 监听错误状态变化
  useEffect(() => {
    onErrorRef.current?.(error);
  }, [error]);

  return {
    isConnected,
    error,
    sendMessage,
    reconnect,
    disconnect
  };
} 