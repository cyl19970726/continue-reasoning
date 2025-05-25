import { InteractiveLayerConfig } from '../../core/events/interactiveLayer';
import { WebSocket } from 'ws';

export interface WebUIClientConfig extends InteractiveLayerConfig {
  serverPort?: number;
  webSocketPort?: number;
  staticPath?: string;
  enableWebSocket?: boolean;
  corsOrigins?: string[];
  maxConcurrentConnections?: number;
  sessionTimeout?: number;
  enableFileUpload?: boolean;
  uploadMaxSize?: number;
}

export interface WebSocketConnection {
  id: string;
  socket: WebSocket;
  sessionId: string;
  userId?: string;
  connectedAt: number;
  lastActivity: number;
}

export interface WebUIStats {
  activeConnections: number;
  totalMessages: number;
  sessionsCreated: number;
  uptime: number;
  memoryUsage: number;
}

export interface ClientMessage {
  id: string;
  type: 'command' | 'approval_response' | 'input_response' | 'collaboration_response';
  sessionId: string;
  payload: any;
  timestamp: number;
}

export interface ServerMessage {
  id: string;
  type: 'event' | 'response' | 'error' | 'status';
  payload: any;
  timestamp: number;
}

export interface WebUICapabilities {
  supportsFileUpload: boolean;
  supportsCodeHighlighting: boolean;
  supportsRealTimeCollaboration: boolean;
  supportsScreensharing: boolean;
  maxFileSize: number;
  supportedFileTypes: string[];
} 