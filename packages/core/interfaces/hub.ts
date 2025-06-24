import { IEventBus } from '../events/eventBus';
import { IAgent } from './agent';

/**
 * Interactive Layer Interface
 */
export interface IInteractiveLayer {
    id: string;
    
    // Lifecycle methods
    start(): Promise<void>;
    stop(): Promise<void>;
    
    // Hub integration
    setInteractionHub?(hub: IInteractionHub): void;
    
    // Event handlers
    onAgentStateChange?(agentId: string, payload: any): Promise<void>;
    
    // Capabilities
    getCapabilities(): any;
}

/**
 * Interaction Hub Interface
 */
export interface IInteractionHub {
    eventBus: IEventBus;
    
    // Registration
    registerAgent(agent: IAgent): Promise<void>;
    registerInteractiveLayer(layer: IInteractiveLayer): Promise<void>;
    
    // Lifecycle
    start(): Promise<void>;
    stop(): Promise<void>;
    
    // Access
    getAgents(): IAgent[];
    getInteractiveLayers(): IInteractiveLayer[];
    
    // Communication
    broadcastToAgents(eventType: string, payload: any): Promise<void>;
    broadcastToInteractiveLayers(eventType: string, payload: any): Promise<void>;
    routeEvent(event: any, targetType: 'agent' | 'interactive_layer', targetId?: string): Promise<void>;
    
    // Status
    getSystemStatus(): {
        agents: Array<{ id: string; status: string; isRunning: boolean }>;
        interactiveLayers: Array<{ id: string; capabilities: any }>;
        eventBusStatus: any;
    };
    
    checkHealth(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: {
            hubRunning: boolean;
            eventBusRunning: boolean;
            agentsCount: number;
            layersCount: number;
            errorAgents: string[];
        };
    };
} 