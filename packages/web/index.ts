// Web UI Client
export { WebUIClient } from './client/webUIClient';
export type { 
  WebUIClientConfig,
  WebSocketConnection,
  WebUIStats,
  ClientMessage,
  ServerMessage,
  WebUICapabilities
} from './client/types';

// Re-export core event types for convenience
export type { 
  InteractiveMessage,
  InteractiveCapabilities,
  MessageHandler,
  EventFilter,
  SubscriptionConfig
} from '@continue-reasoning/core';

export { BaseInteractiveLayer, EventBus } from '@continue-reasoning/core'; 