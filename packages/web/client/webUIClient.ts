import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { 
  InteractiveMessage, 
  StatusUpdateEvent, 
  MessageHandler, 
  EventFilter, 
  SubscriptionConfig,
  InteractiveCapabilities 
} from '@continue-reasoning/core';
import { BaseInteractiveLayer } from '@continue-reasoning/core';
import { logger } from '@continue-reasoning/core';
import { 
  WebUIClientConfig, 
  WebSocketConnection, 
  WebUIStats, 
  ClientMessage, 
  ServerMessage,
  WebUICapabilities 
} from './types';

export class WebUIClient extends BaseInteractiveLayer {
  private httpServer?: http.Server;
  private wsServer?: WebSocketServer;
  private connections: Map<string, WebSocketConnection> = new Map();
  private stats: WebUIStats;
  private startTime: number;
  
  protected config: WebUIClientConfig;

  constructor(config: WebUIClientConfig) {
    super(config);
    
    // 修复静态文件路径 - 使用相对于项目根目录的路径
    const defaultStaticPath = path.resolve(process.cwd(), 'src/web/frontend/dist');
    
    this.config = {
      serverPort: 3002,
      staticPath: defaultStaticPath,
      enableWebSocket: true,
      corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
      maxConcurrentConnections: 100,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      enableFileUpload: true,
      uploadMaxSize: 10 * 1024 * 1024, // 10MB
      ...config
    };
    
    // 验证静态文件路径是否存在
    if (!fs.existsSync(this.config.staticPath!)) {
      logger.warn(`Static path does not exist: ${this.config.staticPath}`);
      logger.info(`Current working directory: ${process.cwd()}`);
      logger.info(`__dirname: ${__dirname}`);
    } else {
      logger.info(`Static files will be served from: ${this.config.staticPath}`);
    }
    
    this.startTime = Date.now();
    this.stats = {
      activeConnections: 0,
      totalMessages: 0,
      sessionsCreated: 0,
      uptime: 0,
      memoryUsage: 0
    };
  }

  static createDefault(eventBus: any): WebUIClient {
    const capabilities: InteractiveCapabilities = {
      supportsRealTimeUpdates: true,
      supportsFilePreview: true,
      supportsCodeHighlighting: true,
      supportsInteractiveApproval: true,
      supportsCollaboration: true,
      maxConcurrentSessions: 10,
      supportedEventTypes: [
        'approval_request',
        'approval_response',
        'collaboration_request',
        'collaboration_response',
        'input_request',
        'input_response',
        'status_update',
        'error',
        'execution_mode_change',
        'task_event',
        'file_operation',
        'command_execution'
      ]
    };

    return new WebUIClient({
      name: 'Web UI Client',
      capabilities,
      eventBus,
      serverPort: 3002,
      enableWebSocket: true,
      enableFileUpload: true
    });
  }

  async sendMessage(message: InteractiveMessage): Promise<void> {
    const serverMessage: ServerMessage = {
      id: uuidv4(),
      type: 'event',
      payload: message,
      timestamp: Date.now()
    };

    // Send to all connected clients in the same session
    for (const connection of this.connections.values()) {
      if (connection.sessionId === message.sessionId) {
        this.sendToConnection(connection, serverMessage);
      }
    }

    await this.config.eventBus.publish(message);
  }

  getWebUIStats(): WebUIStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }

  getWebUICapabilities(): WebUICapabilities {
    return {
      supportsFileUpload: this.config.enableFileUpload || false,
      supportsCodeHighlighting: true,
      supportsRealTimeCollaboration: true,
      supportsScreensharing: false,
      maxFileSize: this.config.uploadMaxSize || 10 * 1024 * 1024,
      supportedFileTypes: ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.md', '.txt', '.json', '.yaml', '.yml']
    };
  }

  protected async onStart(): Promise<void> {
    try {
      await this.startHttpServer();
      if (this.config.enableWebSocket) {
        await this.startWebSocketServer();
      }
      
      // Subscribe to all event types this client supports
      this.config.capabilities.supportedEventTypes.forEach(eventType => {
        this.subscribe([eventType], this.handleEventMessage.bind(this) as any);
      });

      logger.info(`Web UI Client started on port ${this.config.serverPort}`);
    } catch (error) {
      logger.error('Failed to start Web UI Client:', error);
      throw error;
    }
  }

  protected async onStop(): Promise<void> {
    // Close all WebSocket connections
    for (const connection of this.connections.values()) {
      connection.socket.close();
    }
    this.connections.clear();

    // Stop servers
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    if (this.httpServer) {
      this.httpServer.close();
    }

    logger.info('Web UI Client stopped');
  }

  private async startHttpServer(): Promise<void> {
    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.config.serverPort, () => {
        logger.info(`HTTP server listening on port ${this.config.serverPort}`);
        resolve();
      });

      this.httpServer!.on('error', (error) => {
        logger.error('HTTP server error:', error);
        reject(error);
      });
    });
  }

  private async startWebSocketServer(): Promise<void> {
    const wsPort = this.config.webSocketPort || this.config.serverPort;
    
    if (this.config.webSocketPort && this.config.webSocketPort !== this.config.serverPort) {
      // 使用独立的 WebSocket 端口
      this.wsServer = new WebSocketServer({ 
        port: wsPort,
        path: '/ws'
      });
      logger.info(`WebSocket server started on independent port ${wsPort}/ws`);
    } else {
      // 使用 HTTP 服务器的端口
      this.wsServer = new WebSocketServer({ 
        server: this.httpServer,
        path: '/ws'
      });
      logger.info(`WebSocket server started on /ws (shared with HTTP server)`);
    }

    this.wsServer.on('connection', (socket: WebSocket, request) => {
      this.handleWebSocketConnection(socket, request);
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';
    
    // Set CORS headers
    this.setCorsHeaders(res);
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API routes
    if (url.startsWith('/api/')) {
      this.handleApiRequest(req, res);
      return;
    }

    // Static file serving
    this.serveStaticFile(url, res);
  }

  private setCorsHeaders(res: http.ServerResponse): void {
    const allowedOrigins = this.config.corsOrigins || ['*'];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.join(','));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  private handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '';
    const method = req.method || 'GET';

    try {
      if (url === '/api/stats' && method === 'GET') {
        this.sendJsonResponse(res, 200, this.getWebUIStats());
      } else if (url === '/api/capabilities' && method === 'GET') {
        this.sendJsonResponse(res, 200, this.getWebUICapabilities());
      } else if (url === '/api/sessions' && method === 'POST') {
        const sessionId = this.config.eventBus.createSession();
        this.stats.sessionsCreated++;
        this.sendJsonResponse(res, 201, { sessionId });
      } else if (url.startsWith('/api/sessions/') && method === 'DELETE') {
        const sessionId = url.split('/')[3];
        this.config.eventBus.closeSession(sessionId);
        this.sendJsonResponse(res, 200, { message: 'Session closed' });
      } else {
        this.sendJsonResponse(res, 404, { error: 'API endpoint not found' });
      }
    } catch (error) {
      logger.error('API request error:', error);
      this.sendJsonResponse(res, 500, { error: 'Internal server error' });
    }
  }

  private serveStaticFile(url: string, res: http.ServerResponse): void {
    // Default to index.html for SPA routing
    if (url === '/' || url === '/index.html') {
      url = '/index.html';
    }

    const filePath = path.join(this.config.staticPath || '', url);
    
    // Security check - prevent directory traversal
    if (!filePath.startsWith(this.config.staticPath || '')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // For SPA, serve index.html for unknown routes
      if (!url.includes('.')) {
        this.serveStaticFile('/index.html', res);
        return;
      }
      
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    // Determine content type
    const ext = path.extname(filePath);
    const contentType = this.getContentType(ext);
    
    res.setHeader('Content-Type', contentType);
    
    // Stream file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    stream.on('error', (error) => {
      logger.error('File serving error:', error);
      res.writeHead(500);
      res.end('Internal server error');
    });
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    return types[ext] || 'text/plain';
  }

  private sendJsonResponse(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private handleWebSocketConnection(socket: WebSocket, request: http.IncomingMessage): void {
    const userAgent = request.headers['user-agent'] || '';
    const origin = request.headers.origin || '';
    const host = request.headers.host || '';
    const upgrade = request.headers.upgrade || '';
    const connectionHeader = request.headers.connection || '';
    
    logger.info(`WebSocket connection attempt - Origin: "${origin}", Host: "${host}", UserAgent: "${userAgent.substring(0, 100)}"`);
    
    // 检查是否是有效的 WebSocket 升级请求
    if (upgrade.toLowerCase() !== 'websocket' || !connectionHeader.toLowerCase().includes('upgrade')) {
      logger.warn(`Rejected invalid WebSocket upgrade request from ${request.socket.remoteAddress}`);
      socket.close(1002, 'Invalid WebSocket upgrade');
      return;
    }
    
    // 更宽松的浏览器检查
    const isBrowserConnection = (
      userAgent.includes('Mozilla') || 
        userAgent.includes('Chrome') || 
        userAgent.includes('Safari') || 
        userAgent.includes('Firefox') ||
      userAgent.includes('Edge') ||
      userAgent.includes('WebKit')
    );
    
    // 更宽松的 Origin 检查 - 允许 localhost 和 127.0.0.1 的各种端口
    const hasValidOrigin = (
      !origin || // 允许没有 Origin 头的连接
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      host.includes('localhost') ||
      host.includes('127.0.0.1')
    );
    
    logger.debug(`Connection validation - isBrowser: ${isBrowserConnection}, hasValidOrigin: ${hasValidOrigin}`);
    
    // 只在明显不是浏览器连接时才拒绝
    if (!hasValidOrigin && origin && !isBrowserConnection) {
      logger.warn(`Rejected WebSocket connection - UserAgent: "${userAgent}", Origin: "${origin}", Host: "${host}"`);
      socket.close(1008, 'Unauthorized connection');
      return;
    }

    const clientId = uuidv4();
    const sessionId = this.getCurrentSession();
    
    logger.info(`✅ WebSocket client connected: ${clientId} (session: ${sessionId})`);

    const wsConnection: WebSocketConnection = {
      id: clientId,
      socket,
      sessionId,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    };

    this.connections.set(clientId, wsConnection);
    this.stats.activeConnections = this.connections.size;

    // Send welcome message
    this.sendToConnection(wsConnection, {
      id: uuidv4(),
      type: 'status',
      payload: {
        message: 'Connected to HHH-AGI Web UI',
        sessionId,
        capabilities: this.getWebUICapabilities()
      },
      timestamp: Date.now()
    });

    // Handle messages
    socket.on('message', (data: Buffer) => {
      this.handleWebSocketMessage(wsConnection, data);
    });

    // Handle disconnect
    socket.on('close', (code, reason) => {
      this.connections.delete(clientId);
      this.stats.activeConnections = this.connections.size;
      logger.info(`WebSocket client disconnected: ${clientId} (code: ${code}, reason: ${reason})`);
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error(`WebSocket error for ${clientId}:`, error);
      this.connections.delete(clientId);
      this.stats.activeConnections = this.connections.size;
    });
  }

  private handleWebSocketMessage(connection: WebSocketConnection, data: Buffer): void {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      connection.lastActivity = Date.now();
      this.stats.totalMessages++;

      logger.debug(`Received WebSocket message from ${connection.id}:`, message.type);

      // Process different message types
      switch (message.type) {
        case 'command':
          this.handleClientCommand(connection, message);
          break;
        case 'approval_response':
        case 'input_response':
        case 'collaboration_response':
          this.handleClientResponse(connection, message);
          break;
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
      this.sendToConnection(connection, {
        id: uuidv4(),
        type: 'error',
        payload: { message: 'Invalid message format' },
        timestamp: Date.now()
      });
    }
  }

  private async handleClientCommand(connection: WebSocketConnection, message: ClientMessage): Promise<void> {
    // Convert client command to interactive message
    const interactiveMessage: InteractiveMessage = {
      id: uuidv4(),
      timestamp: Date.now(),
      type: 'input_response',
      source: 'user',
      sessionId: connection.sessionId,
      payload: {
        requestId: 'web-ui-input',
        value: message.payload.command,
        cancelled: false
      }
    };

    await this.sendMessage(interactiveMessage);
  }

  private async handleClientResponse(connection: WebSocketConnection, message: ClientMessage): Promise<void> {
    // Forward response to event bus
    await this.config.eventBus.publish({
      type: message.type as any,
      source: 'user',
      sessionId: connection.sessionId,
      payload: message.payload
    });
  }

  private async handleEventMessage(message: InteractiveMessage): Promise<void> {
    // Forward events to connected clients
    const serverMessage: ServerMessage = {
      id: uuidv4(),
      type: 'event',
      payload: message,
      timestamp: Date.now()
    };

    for (const connection of this.connections.values()) {
      if (connection.sessionId === message.sessionId) {
        this.sendToConnection(connection, serverMessage);
      }
    }
  }

  private sendToConnection(connection: WebSocketConnection, message: ServerMessage): void {
    try {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error(`Error sending message to connection ${connection.id}:`, error);
    }
  }
} 