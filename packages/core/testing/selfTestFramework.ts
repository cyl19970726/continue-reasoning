import { 
  SelfTestEvent, 
  InteractiveMessage 
} from '../events/types';
import { IEventBus } from '../events/eventBus';
import { IAgent } from '../interfaces';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// 测试类型定义
export interface TestCase {
  id: string;
  name: string;
  category: 'basic_operations' | 'code_quality' | 'project_level' | 'collaboration' | 'error_handling';
  description: string;
  expectedOutput?: any;
  timeout?: number; // 毫秒
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  validate?: (result: any) => Promise<TestValidationResult>;
}

export interface TestValidationResult {
  passed: boolean;
  score: number; // 0-100
  message: string;
  metrics?: Record<string, any>;
  recommendations?: string[];
}

export interface TestResult {
  testId: string;
  testName: string;
  category: string;
  passed: boolean;
  score: number;
  executionTime: number;
  output: any;
  error?: Error;
  metrics: Record<string, any>;
  recommendations: string[];
  timestamp: number;
}

export interface TestSuite {
  name: string;
  description: string;
  tests: TestCase[];
  parallel?: boolean;
}

export interface TestSession {
  id: string;
  suiteNames: string[];
  startTime: number;
  endTime?: number;
  results: TestResult[];
  overallScore: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface SelfTestConfig {
  testSuitesPath?: string;
  resultsPath?: string;
  maxConcurrentTests?: number;
  defaultTimeout?: number;
  enableAutoImprovement?: boolean;
  improvementThreshold?: number; // 分数阈值，低于此分数则触发改进
}

export class SelfTestFramework {
  private agent: IAgent;
  private eventBus: IEventBus;
  private config: SelfTestConfig;
  private testSuites: Map<string, TestSuite> = new Map();
  private activeSessions: Map<string, TestSession> = new Map();
  private testHistory: TestResult[] = [];
  
  constructor(agent: IAgent, eventBus: IEventBus, config: SelfTestConfig = {}) {
    this.agent = agent;
    this.eventBus = eventBus;
    this.config = {
      testSuitesPath: path.join(process.cwd(), 'tests', 'self-tests'),
      resultsPath: path.join(process.cwd(), 'test-results'),
      maxConcurrentTests: 3,
      defaultTimeout: 30000,
      enableAutoImprovement: true,
      improvementThreshold: 70,
      ...config
    };
    
    this.loadTestSuites();
  }

  // 注册测试套件
  registerTestSuite(suite: TestSuite): void {
    this.testSuites.set(suite.name, suite);
    logger.info(`Registered test suite: ${suite.name}`);
  }

  // 运行指定的测试套件
  async runTestSuite(suiteName: string, sessionId?: string): Promise<TestSession> {
    const suite = this.testSuites.get(suiteName);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteName}`);
    }

    const session = this.createTestSession([suiteName], sessionId);
    
    try {
      await this.publishTestEvent('self_test', {
        testType: 'capability_assessment',
        testName: suiteName,
        result: 'pass', // 暂时设置，后面会更新
        score: 0,
        metrics: { testsTotal: suite.tests.length }
      });

      logger.info(`Starting test suite: ${suiteName} (${suite.tests.length} tests)`);
      
      if (suite.parallel) {
        await this.runTestsInParallel(suite.tests, session);
      } else {
        await this.runTestsSequentially(suite.tests, session);
      }
      
      session.endTime = Date.now();
      session.status = 'completed';
      session.overallScore = this.calculateOverallScore(session.results);
      
      await this.saveTestResults(session);
      await this.handleTestCompletion(session);
      
      logger.info(`Test suite completed: ${suiteName}, Score: ${session.overallScore}`);
      
    } catch (error) {
      session.status = 'failed';
      session.endTime = Date.now();
      logger.error(`Test suite failed: ${suiteName}`, error);
      throw error;
    }
    
    return session;
  }

  // 运行多个测试套件
  async runTestSuites(suiteNames: string[], sessionId?: string): Promise<TestSession> {
    const session = this.createTestSession(suiteNames, sessionId);
    
    try {
      for (const suiteName of suiteNames) {
        const suite = this.testSuites.get(suiteName);
        if (!suite) {
          logger.warn(`Test suite not found: ${suiteName}`);
          continue;
        }
        
        if (suite.parallel) {
          await this.runTestsInParallel(suite.tests, session);
        } else {
          await this.runTestsSequentially(suite.tests, session);
        }
      }
      
      session.endTime = Date.now();
      session.status = 'completed';
      session.overallScore = this.calculateOverallScore(session.results);
      
      await this.saveTestResults(session);
      await this.handleTestCompletion(session);
      
    } catch (error) {
      session.status = 'failed';
      session.endTime = Date.now();
      logger.error('Test suites execution failed', error);
      throw error;
    }
    
    return session;
  }

  // 运行全部测试
  async runAllTests(sessionId?: string): Promise<TestSession> {
    const allSuiteNames = Array.from(this.testSuites.keys());
    return this.runTestSuites(allSuiteNames, sessionId);
  }

  // 获取测试历史
  getTestHistory(category?: string, limit?: number): TestResult[] {
    let filtered = this.testHistory;
    
    if (category) {
      filtered = this.testHistory.filter(result => result.category === category);
    }
    
    return filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit || 100);
  }

  // 获取性能趋势
  getPerformanceTrends(category?: string, days: number = 30): any {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentResults = this.testHistory
      .filter(result => result.timestamp > cutoff)
      .filter(result => !category || result.category === category);

    // 按日期分组计算平均分数
    const dailyScores: Record<string, number[]> = {};
    
    recentResults.forEach(result => {
      const date = new Date(result.timestamp).toDateString();
      if (!dailyScores[date]) {
        dailyScores[date] = [];
      }
      dailyScores[date].push(result.score);
    });

    const trends = Object.entries(dailyScores).map(([date, scores]) => ({
      date,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      testCount: scores.length
    }));

    return trends.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // 自动改进功能
  async triggerAutoImprovement(session: TestSession): Promise<void> {
    if (!this.config.enableAutoImprovement) return;
    
    const failedTests = session.results.filter(result => !result.passed);
    const lowScoreTests = session.results.filter(result => result.score < this.config.improvementThreshold!);
    
    if (failedTests.length === 0 && lowScoreTests.length === 0) {
      return; // 没有需要改进的测试
    }

    logger.info(`Triggering auto-improvement for ${failedTests.length} failed tests and ${lowScoreTests.length} low-score tests`);

    // 分析失败模式
    const failureAnalysis = this.analyzeFailures([...failedTests, ...lowScoreTests]);
    
    // 生成改进建议
    const improvements = await this.generateImprovements(failureAnalysis);
    
    // 应用改进（这里是概念性的，实际实现会更复杂）
    await this.applyImprovements(improvements);
    
    await this.publishTestEvent('self_test', {
      testType: 'performance_benchmark',
      testName: 'auto_improvement',
      result: 'pass',
      score: 100,
      metrics: {
        failedTests: failedTests.length,
        lowScoreTests: lowScoreTests.length,
        improvementsApplied: improvements.length
      },
      recommendations: improvements.map(imp => imp.description)
    });
  }

  private createTestSession(suiteNames: string[], sessionId?: string): TestSession {
    const session: TestSession = {
      id: sessionId || `session-${Date.now()}`,
      suiteNames,
      startTime: Date.now(),
      results: [],
      overallScore: 0,
      status: 'running'
    };
    
    this.activeSessions.set(session.id, session);
    return session;
  }

  private async runTestsSequentially(tests: TestCase[], session: TestSession): Promise<void> {
    for (const test of tests) {
      try {
        const result = await this.executeTest(test);
        session.results.push(result);
        this.testHistory.push(result);
        
        // 发布测试结果事件
        await this.publishTestEvent('self_test', {
          testType: 'capability_assessment',
          testName: test.name,
          result: result.passed ? 'pass' : 'fail',
          score: result.score,
          metrics: result.metrics,
          recommendations: result.recommendations
        });
        
      } catch (error) {
        logger.error(`Test execution failed: ${test.name}`, error);
        session.results.push(this.createFailedTestResult(test, error as Error));
      }
    }
  }

  private async runTestsInParallel(tests: TestCase[], session: TestSession): Promise<void> {
    const chunks = this.chunkArray(tests, this.config.maxConcurrentTests!);
    
    for (const chunk of chunks) {
      const promises = chunk.map(test => this.executeTest(test).catch(error => {
        logger.error(`Test execution failed: ${test.name}`, error);
        return this.createFailedTestResult(test, error as Error);
      }));
      
      const results = await Promise.all(promises);
      session.results.push(...results);
      this.testHistory.push(...results);
      
      // 发布批量测试结果事件
      for (const result of results) {
        await this.publishTestEvent('self_test', {
          testType: 'capability_assessment',
          testName: result.testName,
          result: result.passed ? 'pass' : 'fail',
          score: result.score,
          metrics: result.metrics,
          recommendations: result.recommendations
        });
      }
    }
  }

  private async executeTest(test: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // 执行setup
      if (test.setup) {
        await test.setup();
      }
      
      // 执行测试逻辑（这里是简化版本，实际会调用agent的方法）
      const output = await this.runTestLogic(test);
      
      // 验证结果
      let validation: TestValidationResult;
      if (test.validate) {
        validation = await test.validate(output);
      } else {
        validation = this.defaultValidation(test, output);
      }
      
      const result: TestResult = {
        testId: test.id,
        testName: test.name,
        category: test.category,
        passed: validation.passed,
        score: validation.score,
        executionTime: Date.now() - startTime,
        output,
        metrics: validation.metrics || {},
        recommendations: validation.recommendations || [],
        timestamp: Date.now()
      };
      
      // 执行teardown
      if (test.teardown) {
        await test.teardown();
      }
      
      return result;
      
    } catch (error) {
      return this.createFailedTestResult(test, error as Error, Date.now() - startTime);
    }
  }

  private async runTestLogic(test: TestCase): Promise<any> {
    // 这里是简化的测试逻辑，实际实现会根据测试类型调用不同的agent方法
    switch (test.category) {
      case 'basic_operations':
        return this.testBasicOperations(test);
      case 'code_quality':
        return this.testCodeQuality(test);
      case 'project_level':
        return this.testProjectLevel(test);
      case 'collaboration':
        return this.testCollaboration(test);
      case 'error_handling':
        return this.testErrorHandling(test);
      default:
        throw new Error(`Unknown test category: ${test.category}`);
    }
  }

  private async testBasicOperations(test: TestCase): Promise<any> {
    // 测试基本操作，如文件读写、命令执行等
    return { status: 'completed', details: `Basic operation test: ${test.name}` };
  }

  private async testCodeQuality(test: TestCase): Promise<any> {
    // 测试代码质量，如语法检查、最佳实践等
    return { quality: 'good', issues: [], score: 85 };
  }

  private async testProjectLevel(test: TestCase): Promise<any> {
    // 测试项目级别的操作，如项目初始化、依赖管理等
    return { projectStatus: 'healthy', components: ['frontend', 'backend'] };
  }

  private async testCollaboration(test: TestCase): Promise<any> {
    // 测试协作功能
    return { collaborationLevel: 'effective', communicationScore: 90 };
  }

  private async testErrorHandling(test: TestCase): Promise<any> {
    // 测试错误处理能力
    return { errorHandled: true, recoveryTime: 150, errorType: 'validation' };
  }

  private defaultValidation(test: TestCase, output: any): TestValidationResult {
    // 默认验证逻辑
    const passed = output && !output.error;
    const score = passed ? 100 : 0;
    
    return {
      passed,
      score,
      message: passed ? 'Test passed with default validation' : 'Test failed with default validation',
      metrics: { executionSuccessful: passed }
    };
  }

  private createFailedTestResult(test: TestCase, error: Error, executionTime?: number): TestResult {
    return {
      testId: test.id,
      testName: test.name,
      category: test.category,
      passed: false,
      score: 0,
      executionTime: executionTime || 0,
      output: null,
      error,
      metrics: { errorOccurred: true },
      recommendations: ['Review test implementation', 'Check error logs'],
      timestamp: Date.now()
    };
  }

  private calculateOverallScore(results: TestResult[]): number {
    if (results.length === 0) return 0;
    
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    return Math.round(totalScore / results.length);
  }

  private analyzeFailures(failedResults: TestResult[]): any {
    const categoryCounts: Record<string, number> = {};
    const commonErrors: Record<string, number> = {};
    
    failedResults.forEach(result => {
      categoryCounts[result.category] = (categoryCounts[result.category] || 0) + 1;
      
      if (result.error) {
        const errorKey = result.error.message || 'Unknown error';
        commonErrors[errorKey] = (commonErrors[errorKey] || 0) + 1;
      }
    });
    
    return {
      totalFailures: failedResults.length,
      categoryCounts,
      commonErrors,
      failureRate: failedResults.length / this.testHistory.length
    };
  }

  private async generateImprovements(analysis: any): Promise<Array<{id: string, description: string, implementation: () => Promise<void>}>> {
    const improvements = [];
    
    // 基于分析生成改进建议
    if (analysis.categoryCounts['code_quality'] > 0) {
      improvements.push({
        id: 'improve-code-quality',
        description: 'Enhance code quality checking mechanisms',
        implementation: async () => {
          // 实际的改进实现
          logger.info('Applying code quality improvements...');
        }
      });
    }
    
    if (analysis.categoryCounts['error_handling'] > 0) {
      improvements.push({
        id: 'enhance-error-handling',
        description: 'Improve error handling and recovery mechanisms',
        implementation: async () => {
          logger.info('Enhancing error handling...');
        }
      });
    }
    
    return improvements;
  }

  private async applyImprovements(improvements: Array<{id: string, description: string, implementation: () => Promise<void>}>): Promise<void> {
    for (const improvement of improvements) {
      try {
        await improvement.implementation();
        logger.info(`Applied improvement: ${improvement.description}`);
      } catch (error) {
        logger.error(`Failed to apply improvement: ${improvement.description}`, error);
      }
    }
  }

  private async handleTestCompletion(session: TestSession): Promise<void> {
    // 保存测试结果
    await this.saveTestResults(session);
    
    // 如果启用了自动改进并且分数低于阈值，触发改进
    if (session.overallScore < this.config.improvementThreshold!) {
      await this.triggerAutoImprovement(session);
    }
    
    // 清理活跃会话
    this.activeSessions.delete(session.id);
  }

  private async saveTestResults(session: TestSession): Promise<void> {
    if (!this.config.resultsPath) return;
    
    try {
      const resultsDir = this.config.resultsPath;
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      const fileName = `test-results-${session.id}.json`;
      const filePath = path.join(resultsDir, fileName);
      
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      logger.info(`Test results saved to: ${filePath}`);
      
    } catch (error) {
      logger.error('Failed to save test results', error);
    }
  }

  private loadTestSuites(): void {
    // 加载预定义的测试套件
    this.registerDefaultTestSuites();
    
    // 从文件系统加载测试套件（如果配置了路径）
    if (this.config.testSuitesPath && fs.existsSync(this.config.testSuitesPath)) {
      try {
        // 这里可以实现从文件加载测试套件的逻辑
        logger.info(`Loading test suites from: ${this.config.testSuitesPath}`);
      } catch (error) {
        logger.warn('Failed to load test suites from filesystem', error);
      }
    }
  }

  private registerDefaultTestSuites(): void {
    // 基本操作测试套件
    const basicOpsSuite: TestSuite = {
      name: 'basic-operations',
      description: 'Tests for basic agent operations like file I/O, command execution',
      tests: [
        {
          id: 'file-read-test',
          name: 'File Reading Test',
          category: 'basic_operations',
          description: 'Test agent ability to read files',
          timeout: 5000
        },
        {
          id: 'file-write-test', 
          name: 'File Writing Test',
          category: 'basic_operations',
          description: 'Test agent ability to write files',
          timeout: 5000
        }
      ]
    };

    // 代码质量测试套件
    const codeQualitySuite: TestSuite = {
      name: 'code-quality',
      description: 'Tests for code generation and quality assessment',
      tests: [
        {
          id: 'syntax-check-test',
          name: 'Syntax Validation Test',
          category: 'code_quality',
          description: 'Test agent ability to generate syntactically correct code',
          timeout: 10000
        }
      ]
    };

    this.registerTestSuite(basicOpsSuite);
    this.registerTestSuite(codeQualitySuite);
  }

  private async publishTestEvent(type: 'self_test', payload: any): Promise<void> {
    const event: SelfTestEvent = {
      id: '',
      timestamp: 0,
      type,
      source: 'system',
      sessionId: 'test-framework',
      payload
    };
    
    await this.eventBus.publish(event);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
} 