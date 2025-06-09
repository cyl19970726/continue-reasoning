import { WebSocketProvider } from './contexts/WebSocketContext';
import { ChatInterface } from './components/ChatInterface';

function App() {
  // 从环境变量或默认值获取 WebSocket URL
  const wsUrl = `ws://${window.location.hostname}:3002/ws`;
  
  return (
    <WebSocketProvider 
      url={wsUrl}
      reconnectAttempts={5}
      reconnectInterval={2000}
    >
      <div className="h-screen bg-gray-50">
        <ChatInterface sessionId="default-session" />
      </div>
    </WebSocketProvider>
  );
}

export default App; 