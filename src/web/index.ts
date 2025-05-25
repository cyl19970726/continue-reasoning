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
} from '../core/events/types';

export { BaseInteractiveLayer } from '../core/events/interactiveLayer';
export { EventBus } from '../core/events/eventBus'; 