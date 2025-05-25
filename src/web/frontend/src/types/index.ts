// 复用后端类型
export interface InteractiveMessage {
  id: string;
  timestamp: number;
  type: string;
  source: 'user' | 'agent' | 'system';
  sessionId: string;
  payload: any;
}

export interface ServerMessage {
  id: string;
  type: 'event' | 'response' | 'error' | 'status';
  payload: any;
  timestamp: number;
}

export interface ClientMessage {
  id: string;
  type: 'command' | 'approval_response' | 'input_response' | 'collaboration_response' | 'execution_mode_change';
  sessionId: string;
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

export interface WebUIStats {
  activeConnections: number;
  totalMessages: number;
  sessionsCreated: number;
  uptime: number;
  memoryUsage: number;
}

// UI 状态类型
export interface UIState {
  connected: boolean;
  sessionId: string | null;
  executionMode: 'auto' | 'manual' | 'supervised';
  loading: boolean;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'agent' | 'system' | 'error';
  content: string;
  timestamp: number;
  metadata?: {
    command?: string;
    fileOperations?: FileOperation[];
    approval?: ApprovalRequest;
    collaboration?: CollaborationRequest;
  };
}

export interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'create' | 'move' | 'copy';
  path: string;
  preview?: string;
  backup?: boolean;
}

export interface ApprovalRequest {
  id: string;
  actionType: 'file_write' | 'file_delete' | 'command_execute' | 'git_operation' | 'network_access';
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: {
    command?: string;
    filePaths?: string[];
    preview?: string;
  };
}

export interface CollaborationRequest {
  id: string;
  problemType: 'error_resolution' | 'design_decision' | 'implementation_choice' | 'testing_strategy';
  context: {
    description: string;
    errorMessage?: string;
    codeSnippet?: string;
    filePath?: string;
    suggestions?: string[];
  };
  urgency: 'low' | 'medium' | 'high';
} 