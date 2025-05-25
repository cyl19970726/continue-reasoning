import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Send, Terminal, AlertCircle, CheckCircle, Clock, User, Bot, Settings } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { 
  ChatMessage, 
  ServerMessage, 
  ClientMessage, 
  UIState,
  ApprovalRequest,
  CollaborationRequest 
} from '../types';

interface ChatInterfaceProps {
  sessionId: string;
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [uiState, setUIState] = useState<UIState>({
    connected: false,
    sessionId,
    executionMode: 'auto',
    loading: false,
    error: null
  });
  const [modeChangeLoading, setModeChangeLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleWebSocketMessage = useCallback((serverMessage: ServerMessage) => {
    console.log('Received server message:', serverMessage);

    switch (serverMessage.type) {
      case 'event':
        handleEventMessage(serverMessage.payload);
        break;
      case 'status':
        setUIState(prev => ({ ...prev, connected: true, error: null }));
        addSystemMessage(serverMessage.payload.message);
        break;
      case 'error':
        setUIState(prev => ({ ...prev, error: serverMessage.payload.message }));
        addErrorMessage(serverMessage.payload.message);
        break;
      case 'response':
        addAgentMessage(JSON.stringify(serverMessage.payload, null, 2));
        break;
    }
  }, []);

  const { isConnected, error, sendMessage, reconnect } = useWebSocket({
    url: `ws://${window.location.hostname}:3001/ws`,
    onMessage: handleWebSocketMessage,
    onConnect: () => {
      setUIState(prev => ({ ...prev, connected: true, error: null }));
      addSystemMessage('Connected to HHH-AGI');
    },
    onDisconnect: () => {
      setUIState(prev => ({ ...prev, connected: false }));
      addSystemMessage('Disconnected from server');
    },
    onError: () => {
      setUIState(prev => ({ ...prev, error: 'Connection error' }));
    }
  });

  const handleEventMessage = useCallback((event: any) => {
    switch (event.type) {
      case 'status_update':
        addAgentMessage(`${getStageIcon(event.payload.stage)} ${event.payload.message}`, {
          progress: event.payload.progress
        });
        break;
      case 'approval_request':
        addApprovalMessage(event);
        break;
      case 'collaboration_request':
        addCollaborationMessage(event);
        break;
      case 'error':
        addErrorMessage(event.payload.message);
        break;
      case 'execution_mode_change':
        setUIState(prev => ({ ...prev, executionMode: event.payload.toMode }));
        addSystemMessage(`Execution mode changed to: ${event.payload.toMode}`);
        break;
      case 'execution_mode_change_confirmed':
        setModeChangeLoading(false);
        if (event.payload.success) {
          setUIState(prev => ({ ...prev, executionMode: event.payload.mode }));
          addSystemMessage(`✅ Mode switch confirmed: ${event.payload.mode}`);
        } else {
          addErrorMessage(`❌ Mode switch failed: ${event.payload.error || 'Unknown error'}`);
        }
        break;
      default:
        addAgentMessage(JSON.stringify(event, null, 2));
    }
  }, []);

  const addUserMessage = (content: string) => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, message]);
  };

  const addAgentMessage = (content: string, metadata?: any) => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'agent',
      content,
      timestamp: Date.now(),
      metadata
    };
    setMessages(prev => [...prev, message]);
  };

  const addSystemMessage = (content: string) => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'system',
      content,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, message]);
  };

  const addErrorMessage = (content: string) => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'error',
      content,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, message]);
  };

  const addApprovalMessage = (event: any) => {
    const approval: ApprovalRequest = {
      id: event.id,
      actionType: event.payload.actionType,
      description: event.payload.description,
      riskLevel: event.payload.details.riskLevel,
      details: event.payload.details
    };

    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'agent',
      content: `⚠️ Approval Required: ${approval.description}`,
      timestamp: Date.now(),
      metadata: { approval }
    };
    setMessages(prev => [...prev, message]);
  };

  const addCollaborationMessage = (event: any) => {
    const collaboration: CollaborationRequest = {
      id: event.id,
      problemType: event.payload.problemType,
      context: event.payload.context,
      urgency: event.payload.urgency
    };

    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'agent',
      content: `🤝 Collaboration Request: ${collaboration.context.description}`,
      timestamp: Date.now(),
      metadata: { collaboration }
    };
    setMessages(prev => [...prev, message]);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || !isConnected) return;

    const command = inputValue.trim();
    addUserMessage(command);

    const clientMessage: ClientMessage = {
      id: Date.now().toString(),
      type: 'command',
      sessionId,
      payload: { command },
      timestamp: Date.now()
    };

    sendMessage(clientMessage);
    setInputValue('');
  };

  const handleApproval = (approval: ApprovalRequest, decision: 'accept' | 'reject') => {
    const clientMessage: ClientMessage = {
      id: Date.now().toString(),
      type: 'approval_response',
      sessionId,
      payload: {
        requestId: approval.id,
        decision,
        rememberChoice: false
      },
      timestamp: Date.now()
    };

    sendMessage(clientMessage);
    addUserMessage(`${decision === 'accept' ? '✅' : '❌'} ${decision} approval request`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'planning': return '📋';
      case 'executing': return '⚡';
      case 'testing': return '🧪';
      case 'reviewing': return '👀';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';
    const isError = message.type === 'error';

    return (
      <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-blue-500 ml-2' : 
            isSystem ? 'bg-gray-500 mr-2' : 
            isError ? 'bg-red-500 mr-2' : 'bg-green-500 mr-2'
          }`}>
            {isUser ? <User size={16} className="text-white" /> :
             isSystem ? <Terminal size={16} className="text-white" /> :
             isError ? <AlertCircle size={16} className="text-white" /> :
             <Bot size={16} className="text-white" />}
          </div>
          
          <div className={`rounded-lg px-4 py-2 ${
            isUser ? 'bg-blue-500 text-white' :
            isSystem ? 'bg-gray-100 text-gray-800' :
            isError ? 'bg-red-100 text-red-800' :
            'bg-white border border-gray-200'
          }`}>
            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
            
            {/* 渲染审批请求 */}
            {message.metadata?.approval && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                <div className="text-xs text-yellow-800">
                  <strong>Risk Level:</strong> {message.metadata.approval.riskLevel}
                </div>
                {message.metadata.approval.details.preview && (
                  <pre className="mt-1 text-xs bg-gray-100 p-1 rounded overflow-x-auto">
                    {message.metadata.approval.details.preview}
                  </pre>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => message.metadata?.approval && handleApproval(message.metadata.approval, 'accept')}
                    className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => message.metadata?.approval && handleApproval(message.metadata.approval, 'reject')}
                    className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
            
            <div className="text-xs opacity-70 mt-1">
              {formatTimestamp(message.timestamp)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleModeToggle = () => {
    if (modeChangeLoading) return; // 防止重复点击
    
    const newMode = uiState.executionMode === 'auto' ? 'manual' : 'auto';
    setModeChangeLoading(true);
    
    const clientMessage: ClientMessage = {
      id: Date.now().toString(),
      type: 'execution_mode_change',
      sessionId,
      payload: {
        fromMode: uiState.executionMode,
        toMode: newMode,
        reason: 'User requested mode change via web UI'
      },
      timestamp: Date.now()
    };

    sendMessage(clientMessage);
    addUserMessage(`🔄 Switching execution mode: ${uiState.executionMode} → ${newMode}`);
    
    // 设置超时，防止永远加载
    setTimeout(() => {
      setModeChangeLoading(false);
    }, 10000);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="text-blue-500" size={20} />
            <h1 className="font-semibold text-gray-800">HHH-AGI Web UI</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Execution Mode Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Mode:</span>
              <button
                onClick={handleModeToggle}
                disabled={!isConnected || modeChangeLoading}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  uiState.executionMode === 'auto'
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={`Click to switch to ${uiState.executionMode === 'auto' ? 'manual' : 'auto'} mode`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  uiState.executionMode === 'auto' ? 'bg-green-500' : 'bg-yellow-500'
                }`} />
                <span className="capitalize">{uiState.executionMode}</span>
                {modeChangeLoading ? (
                  <div className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
                ) : (
                  <Settings size={14} />
                )}
              </button>
            </div>
            
            <div className={`flex items-center gap-1 text-sm ${
              isConnected ? 'text-green-600' : 'text-red-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            
            {!isConnected && (
              <button
                onClick={reconnect}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
        
        {/* Mode Description */}
        <div className="mt-2 text-xs text-gray-500">
          {uiState.executionMode === 'auto' 
            ? '⚡ Auto mode: Agent executes actions without approval'
            : '✋ Manual mode: Agent requests approval for risky actions'
          }
        </div>
        
        {(error || uiState.error) && (
          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
            {error || uiState.error}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              <Bot size={48} className="mx-auto mb-4 text-gray-400" />
              <p>Welcome to HHH-AGI! Send a command to get started.</p>
            </div>
          )}
          
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a command..."
              disabled={!isConnected}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <button
              onClick={handleSendMessage}
              disabled={!isConnected || !inputValue.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 