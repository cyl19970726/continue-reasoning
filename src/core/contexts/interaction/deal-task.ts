import { z } from 'zod';
import { IContext, IAgent, ToolCallResult, ITool } from '../../interfaces';
import { logger } from '../../utils/logger';
import { createTool, ContextHelper } from '../../utils';

// 任务处理上下文数据结构
const DealTaskContextSchema = z.object({
  currentTask: z.string().optional(),
  taskHistory: z.array(z.object({
    timestamp: z.number(),
    taskId: z.string(),
    content: z.string(),
    status: z.enum(['received', 'processing', 'completed', 'failed']),
    result: z.string().optional(),
    error: z.string().optional()
  })).default([]),
  processingTasks: z.array(z.object({
    taskId: z.string(),
    content: z.string(),
    startTime: z.number(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal')
  })).default([])
});

type DealTaskContextData = z.infer<typeof DealTaskContextSchema>;

// 处理任务工具
const ProcessTaskTool = createTool({
  name: 'process_task',
  description: 'Process a given task by executing the appropriate actions',
  inputSchema: z.object({
    taskContent: z.string().describe('The content of the task to process'),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().describe('Task priority level'),
    metadata: z.object({
      category: z.string().optional().describe('Task category for organization'),
      expectedDuration: z.number().optional().describe('Expected duration in minutes'),
      dependencies: z.array(z.string()).optional().describe('Task dependencies')
    }).optional().describe('Additional task metadata')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    status: z.enum(['received', 'processing', 'completed', 'failed']),
    message: z.string().optional()
  }),
  async: false,
  execute: async (params, agent) => {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`Processing task: "${params.taskContent}" (${taskId})`);
    
    // 更新上下文中的任务状态
    if (agent) {
      const context = agent.contextManager.findContextById('deal-task-context');
      if (context && 'setData' in context && 'getData' in context) {
        const currentData = (context as any).getData();
        
        // 添加到处理中的任务列表
        const newProcessingTask = {
          taskId,
          content: params.taskContent,
          startTime: Date.now(),
          priority: params.priority || 'normal' as const
        };
        
        // 添加到任务历史
        const newHistoryEntry = {
          timestamp: Date.now(),
          taskId,
          content: params.taskContent,
          status: 'processing' as const
        };
        
        (context as any).setData({
          ...currentData,
          currentTask: params.taskContent,
          processingTasks: [...currentData.processingTasks, newProcessingTask],
          taskHistory: [...currentData.taskHistory, newHistoryEntry]
        });
      }
    }
    
    return {
      success: true,
      taskId,
      status: 'processing' as const,
      message: `Task ${taskId} started processing`
    };
  }
});

// 完成任务工具
const CompleteTaskTool = createTool({
  name: 'complete_task',
  description: 'Mark a task as completed with results',
  inputSchema: z.object({
    taskId: z.string().describe('The ID of the task to complete'),
    result: z.string().describe('The result or outcome of the task'),
    summary: z.string().optional().describe('Optional summary of what was accomplished')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    message: z.string()
  }),
  async: false,
  execute: async (params, agent) => {
    logger.info(`Completing task: ${params.taskId} with result: "${params.result}"`);
    
    if (agent) {
      const context = agent.contextManager.findContextById('deal-task-context');
      if (context && 'setData' in context && 'getData' in context) {
        const currentData = (context as any).getData();
        
        // 从处理中的任务列表移除
        const updatedProcessingTasks = currentData.processingTasks.filter(
          (task: any) => task.taskId !== params.taskId
        );
        
        // 更新任务历史中的状态
        const updatedTaskHistory = currentData.taskHistory.map((task: any) => {
          if (task.taskId === params.taskId) {
            return {
              ...task,
              status: 'completed' as const,
              result: params.result
            };
          }
          return task;
        });
        
        (context as any).setData({
          ...currentData,
          currentTask: undefined, // 清除当前任务
          processingTasks: updatedProcessingTasks,
          taskHistory: updatedTaskHistory
        });
      }
    }
    
    return {
      success: true,
      taskId: params.taskId,
      message: `Task ${params.taskId} completed successfully`
    };
  }
});

// 失败任务工具
const FailTaskTool = createTool({
  name: 'fail_task',
  description: 'Mark a task as failed with error information',
  inputSchema: z.object({
    taskId: z.string().describe('The ID of the task that failed'),
    error: z.string().describe('The error message or reason for failure'),
    retryable: z.boolean().optional().describe('Whether this task can be retried')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    message: z.string()
  }),
  async: false,
  execute: async (params, agent) => {
    logger.error(`Task failed: ${params.taskId} - ${params.error}`);
    
    if (agent) {
      const context = agent.contextManager.findContextById('deal-task-context');
      if (context && 'setData' in context && 'getData' in context) {
        const currentData = (context as any).getData();
        
        // 从处理中的任务列表移除
        const updatedProcessingTasks = currentData.processingTasks.filter(
          (task: any) => task.taskId !== params.taskId
        );
        
        // 更新任务历史中的状态
        const updatedTaskHistory = currentData.taskHistory.map((task: any) => {
          if (task.taskId === params.taskId) {
            return {
              ...task,
              status: 'failed' as const,
              error: params.error
            };
          }
          return task;
        });
        
        (context as any).setData({
          ...currentData,
          currentTask: undefined, // 清除当前任务
          processingTasks: updatedProcessingTasks,
          taskHistory: updatedTaskHistory
        });
      }
    }
    
    return {
      success: true,
      taskId: params.taskId,
      message: `Task ${params.taskId} marked as failed`
    };
  }
});

// 创建 DealTaskContext 工厂函数
export function createDealTaskContext() {
  const baseContext = ContextHelper.createContext({
    id: 'deal-task-context',
    description: 'Manages task processing, execution tracking, and completion status. This context handles direct task processing workflows.',
    dataSchema: DealTaskContextSchema,
    initialData: {
      taskHistory: [],
      processingTasks: []
    },
    renderPromptFn: (data: DealTaskContextData) => {
      const { currentTask, taskHistory, processingTasks } = data;
      
      let prompt = '## Task Processing Context\n\n';
      
      if (currentTask) {
        prompt += `**Current Task:** ${currentTask}\n\n`;
      }
      
      if (processingTasks.length > 0) {
        prompt += '**Processing Tasks:**\n';
        processingTasks.forEach(task => {
          const duration = Math.round((Date.now() - task.startTime) / 1000);
          prompt += `- [${task.priority.toUpperCase()}] ${task.taskId}: ${task.content} (${duration}s)\n`;
        });
        prompt += '\n';
      }
      
      if (taskHistory.length > 0) {
        prompt += '**Recent Task History:**\n';
        const recentHistory = taskHistory.slice(-10); // 最近10条
        recentHistory.forEach(entry => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          const statusIcon = {
            'received': '📝',
            'processing': '⚙️',
            'completed': '✅',
            'failed': '❌'
          }[entry.status];
          
          prompt += `- [${time}] ${statusIcon} ${entry.taskId}: ${entry.content}`;
          if (entry.result) prompt += ` → ${entry.result}`;
          if (entry.error) prompt += ` ❌ ${entry.error}`;
          prompt += '\n';
        });
        prompt += '\n';
      }
      
      prompt += '**Guidelines:**\n';
      prompt += '- Use `process_task` when receiving a new task to handle\n';
      prompt += '- Always call `complete_task` when finishing a task successfully\n';
      prompt += '- Call `fail_task` if a task cannot be completed\n';
      prompt += '- Track task progress and provide meaningful results\n';
      
      return prompt;
    },
    toolSetFn: () => ({
      name: 'TaskProcessingTools',
      description: 'Tools for processing, tracking, and managing task execution',
      tools: [ProcessTaskTool, CompleteTaskTool, FailTaskTool],
      active: true,
      source: 'local' as const
    }),
    handleToolCall: (toolCallResult: ToolCallResult) => {
      // 处理工具调用结果
      if (toolCallResult.name === 'process_task') {
        logger.debug('Task processing started');
      } else if (toolCallResult.name === 'complete_task') {
        logger.debug('Task completed successfully');
      } else if (toolCallResult.name === 'fail_task') {
        logger.debug('Task marked as failed');
      }
    }
  });

  // 扩展 context 添加自定义方法
  return {
    ...baseContext,
    
    // 处理新任务
    async handleNewTask(taskContent: string, priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'): Promise<string> {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 添加到任务历史
      const newHistoryEntry = {
        timestamp: Date.now(),
        taskId,
        content: taskContent,
        status: 'received' as const
      };
      
      baseContext.setData({
        ...baseContext.data,
        currentTask: taskContent,
        taskHistory: [...baseContext.data.taskHistory, newHistoryEntry]
      });
      
      logger.info(`New task received: "${taskContent}" (${taskId})`);
      return taskId;
    },

    // 获取当前处理中的任务
    getProcessingTasks(): any[] {
      return baseContext.data.processingTasks || [];
    },

    // 获取任务历史
    getTaskHistory(): any[] {
      return baseContext.data.taskHistory || [];
    },

    // 检查是否有处理中的任务
    hasProcessingTasks(): boolean {
      return (baseContext.data.processingTasks || []).length > 0;
    }
  };
}

// 导出默认实例
export const DealTaskContext = createDealTaskContext();
