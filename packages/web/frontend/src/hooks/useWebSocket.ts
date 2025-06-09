import { useState, useEffect, useCallback, useRef } from 'react';
import { ServerMessage, ClientMessage } from '../types';

interface UseWebSocketOptions {
  url: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  onMessage?: (message: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  error: string | null;
  sendMessage: (message: ClientMessage) => void;
  reconnect: () => void;
  disconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    reconnectAttempts = 3,
    reconnectInterval = 2000,
    onMessage,
    onConnect,
    onDisconnect,
    onError
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 使用浏览器原生 WebSocket 类型
  const wsRef = useRef<globalThis.WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const isConnectingRef = useRef(false);
  // 记录组件是否已卸载，防止在 StrictMode 下重复挂载造成的循环重连
  const isUnmountedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      // 移除所有事件监听器
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      
      if (wsRef.current.readyState === globalThis.WebSocket.OPEN || 
          wsRef.current.readyState === globalThis.WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(() => {
    // 防止重复连接
    if (isConnectingRef.current || 
        wsRef.current?.readyState === globalThis.WebSocket.OPEN ||
        !shouldReconnectRef.current) {
      return;
    }

    isConnectingRef.current = true;
    setError(null);

    try {
      console.log(`🔌 Connecting to WebSocket: ${url}`);
      
      // 使用浏览器原生 WebSocket
      const ws = new globalThis.WebSocket(url);
      wsRef.current = ws;

      // 设置连接超时
      const connectTimeout = setTimeout(() => {
        if (ws.readyState === globalThis.WebSocket.CONNECTING) {
          console.log('❌ WebSocket connection timeout');
          ws.close();
          setError('Connection timeout');
          isConnectingRef.current = false;
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectCountRef.current = 0;
        isConnectingRef.current = false;
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          onMessage?.(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectTimeout);
        console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`);
        
        setIsConnected(false);
        isConnectingRef.current = false;
        onDisconnect?.();
        
        // 只有在应该重连且未达到最大次数时才重连
        if (!isUnmountedRef.current && shouldReconnectRef.current && 
            reconnectCountRef.current < reconnectAttempts &&
            event.code !== 1000) { // 1000 是正常关闭
          
          reconnectCountRef.current++;
          console.log(`📡 Scheduling reconnect ${reconnectCountRef.current}/${reconnectAttempts} in ${reconnectInterval}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isUnmountedRef.current && shouldReconnectRef.current) {
              connect();
            }
          }, reconnectInterval);
        } else if (reconnectCountRef.current >= reconnectAttempts) {
          setError(`Failed to reconnect after ${reconnectAttempts} attempts`);
        }
      };

      ws.onerror = (event) => {
        clearTimeout(connectTimeout);
        console.error('❌ WebSocket error:', event);
        setError('WebSocket connection error');
        isConnectingRef.current = false;
        onError?.(event);
      };

    } catch (err) {
      console.error('❌ Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
      isConnectingRef.current = false;
    }
  }, [url, reconnectAttempts, reconnectInterval, onMessage, onConnect, onDisconnect, onError]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === globalThis.WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (err) {
        console.error('❌ Failed to send message:', err);
        setError('Failed to send message');
      }
    } else {
      console.warn('⚠️ WebSocket is not connected');
      setError('WebSocket is not connected');
    }
  }, []);

  const reconnect = useCallback(() => {
    console.log('🔄 Manual reconnect requested');
    reconnectCountRef.current = 0;
    shouldReconnectRef.current = true;
    isUnmountedRef.current = false;
    cleanup();
    
    // 延迟重连，避免立即连接
    setTimeout(() => {
      if (!isUnmountedRef.current && shouldReconnectRef.current) {
        connect();
      }
    }, 500);
  }, [cleanup, connect]);

  const disconnect = useCallback(() => {
    console.log('🛑 Manual disconnect');
    shouldReconnectRef.current = false;
    isUnmountedRef.current = true;
    cleanup();
    setIsConnected(false);
  }, [cleanup]);

  // 组件挂载时连接
  useEffect(() => {
    shouldReconnectRef.current = true;
    isUnmountedRef.current = false;
    
    // 减少初始连接延迟，从 1000ms 改为 100ms
    const initialTimeout = setTimeout(() => {
      if (!isUnmountedRef.current && shouldReconnectRef.current) {
        connect();
      }
    }, 100);
    
    // 组件卸载时清理
    return () => {
      // 标记已卸载，禁止任何后续自动重连
      isUnmountedRef.current = true;
      shouldReconnectRef.current = false;
      clearTimeout(initialTimeout);
      cleanup();
    };
  }, [connect, cleanup]);

  return {
    isConnected,
    error,
    sendMessage,
    reconnect,
    disconnect
  };
} 