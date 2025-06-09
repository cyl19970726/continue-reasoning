import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { ServerMessage, ClientMessage } from '../types';

interface WebSocketContextType {
  isConnected: boolean;
  error: string | null;
  sendMessage: (message: ClientMessage) => void;
  reconnect: () => void;
  disconnect: () => void;
  subscribe: (callback: (message: ServerMessage) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  url: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export function WebSocketProvider({ 
  children, 
  url, 
  reconnectAttempts = 3, 
  reconnectInterval = 2000 
}: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 全局单例连接管理
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const isConnectingRef = useRef(false);
  
  // 订阅者管理 - 支持多个组件订阅同一个连接
  const subscribersRef = useRef<Set<(message: ServerMessage) => void>>(new Set());
  
  // 连接实例 ID，防止过期连接干扰
  const connectionIdRef = useRef<string | null>(null);
  const providerIdRef = useRef<string>(`ws-provider-${Math.random().toString(36).substring(7)}`);

  const cleanup = useCallback(() => {
    console.log(`🧹 [${providerIdRef.current}] Cleaning up WebSocket connection`);
    
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
      
      if (wsRef.current.readyState === WebSocket.OPEN || 
          wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    
    isConnectingRef.current = false;
    connectionIdRef.current = null;
  }, []);

  const connect = useCallback(() => {
    // 防止重复连接
    if (isConnectingRef.current || 
        wsRef.current?.readyState === WebSocket.OPEN ||
        !shouldReconnectRef.current) {
      console.log(`⏭️ [${providerIdRef.current}] Skipping connection (already connecting/connected)`);
      return;
    }

    // 生成新的连接 ID
    const connectionId = `${providerIdRef.current}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    connectionIdRef.current = connectionId;
    
    isConnectingRef.current = true;
    setError(null);

    try {
      console.log(`🔌 [${providerIdRef.current}] Connecting to WebSocket: ${url}`);
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      // 连接超时处理
      const connectTimeout = setTimeout(() => {
        if (connectionIdRef.current === connectionId && 
            ws.readyState === WebSocket.CONNECTING) {
          console.log(`❌ [${providerIdRef.current}] Connection timeout`);
          ws.close();
          setError('Connection timeout');
          isConnectingRef.current = false;
        }
      }, 10000);

      ws.onopen = () => {
        // 验证连接有效性
        if (connectionIdRef.current !== connectionId) {
          console.log(`🚫 [${providerIdRef.current}] Outdated connection, closing`);
          ws.close();
          return;
        }
        
        clearTimeout(connectTimeout);
        console.log(`✅ [${providerIdRef.current}] WebSocket connected successfully`);
        setIsConnected(true);
        setError(null);
        reconnectCountRef.current = 0;
        isConnectingRef.current = false;
      };

      ws.onmessage = (event) => {
        // 只处理当前有效连接的消息
        if (connectionIdRef.current !== connectionId) return;
        
        try {
          const message: ServerMessage = JSON.parse(event.data);
          console.log(`📨 [${providerIdRef.current}] Received message:`, message.type);
          
          // 通知所有订阅者
          subscribersRef.current.forEach(callback => {
            try {
              callback(message);
            } catch (err) {
              console.error(`❌ [${providerIdRef.current}] Error in message subscriber:`, err);
            }
          });
        } catch (err) {
          console.error(`❌ [${providerIdRef.current}] Failed to parse message:`, err);
        }
      };

      ws.onclose = (event) => {
        // 只处理当前有效连接的关闭事件
        if (connectionIdRef.current !== connectionId) {
          console.log(`🚫 [${providerIdRef.current}] Ignoring close event from outdated connection`);
          return;
        }
        
        clearTimeout(connectTimeout);
        console.log(`🔌 [${providerIdRef.current}] WebSocket closed: ${event.code} - ${event.reason}`);
        
        setIsConnected(false);
        isConnectingRef.current = false;
        
        // 智能重连逻辑
        if (shouldReconnectRef.current && 
            reconnectCountRef.current < reconnectAttempts &&
            event.code !== 1000) { // 1000 是正常关闭
          
          reconnectCountRef.current++;
          const delay = Math.min(reconnectInterval * Math.pow(2, reconnectCountRef.current - 1), 30000); // 指数退避，最大30秒
          
          console.log(`📡 [${providerIdRef.current}] Scheduling reconnect ${reconnectCountRef.current}/${reconnectAttempts} in ${delay}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (shouldReconnectRef.current && connectionIdRef.current === connectionId) {
              connect();
            }
          }, delay);
        } else if (reconnectCountRef.current >= reconnectAttempts) {
          setError(`Failed to reconnect after ${reconnectAttempts} attempts`);
        }
      };

      ws.onerror = (event) => {
        if (connectionIdRef.current !== connectionId) return;
        
        clearTimeout(connectTimeout);
        console.error(`❌ [${providerIdRef.current}] WebSocket error:`, event);
        setError('WebSocket connection error');
        isConnectingRef.current = false;
      };

    } catch (err) {
      console.error(`❌ [${providerIdRef.current}] Failed to create WebSocket:`, err);
      setError('Failed to create WebSocket connection');
      isConnectingRef.current = false;
    }
  }, [url, reconnectAttempts, reconnectInterval]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        console.log(`📤 [${providerIdRef.current}] Sending message:`, message.type);
        wsRef.current.send(JSON.stringify(message));
      } catch (err) {
        console.error(`❌ [${providerIdRef.current}] Failed to send message:`, err);
        setError('Failed to send message');
      }
    } else {
      console.warn(`⚠️ [${providerIdRef.current}] WebSocket is not connected`);
      setError('WebSocket is not connected');
    }
  }, []);

  const reconnect = useCallback(() => {
    console.log(`🔄 [${providerIdRef.current}] Manual reconnect requested`);
    reconnectCountRef.current = 0;
    shouldReconnectRef.current = true;
    cleanup();
    
    setTimeout(() => {
      if (shouldReconnectRef.current) {
        connect();
      }
    }, 500);
  }, [cleanup, connect]);

  const disconnect = useCallback(() => {
    console.log(`🛑 [${providerIdRef.current}] Manual disconnect`);
    shouldReconnectRef.current = false;
    cleanup();
    setIsConnected(false);
  }, [cleanup]);

  const subscribe = useCallback((callback: (message: ServerMessage) => void) => {
    console.log(`📝 [${providerIdRef.current}] New subscriber added (total: ${subscribersRef.current.size + 1})`);
    subscribersRef.current.add(callback);
    
    return () => {
      console.log(`📝 [${providerIdRef.current}] Subscriber removed (total: ${subscribersRef.current.size - 1})`);
      subscribersRef.current.delete(callback);
    };
  }, []);

  // Provider 级别的连接管理 - 只在 Provider 挂载时连接
  useEffect(() => {
    console.log(`🚀 [${providerIdRef.current}] WebSocketProvider mounted`);
    shouldReconnectRef.current = true;
    
    // 延迟连接，确保组件完全挂载
    const initialTimeout = setTimeout(() => {
      if (shouldReconnectRef.current) {
        console.log(`🔌 [${providerIdRef.current}] Starting initial connection`);
        connect();
      }
    }, 100);
    
    return () => {
      console.log(`🧹 [${providerIdRef.current}] WebSocketProvider unmounting`);
      shouldReconnectRef.current = false;
      clearTimeout(initialTimeout);
      cleanup();
    };
  }, [connect, cleanup]);

  const contextValue: WebSocketContextType = {
    isConnected,
    error,
    sendMessage,
    reconnect,
    disconnect,
    subscribe
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
} 