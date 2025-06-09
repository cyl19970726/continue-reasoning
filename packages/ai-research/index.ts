// AI Research Framework - 实验性智能体框架
// 简单、独立的智能体实现，支持 function-call 和 ReAct 两种模式

// 核心接口
export * from './interfaces';

// XML 提取工具
export * from './xml-extractor';

// 基础工具集
export * from './tools';

// Function Call Agent
export * from './function-call';

// ReAct Agent
export * from './react';

// 便捷函数
export { createBasicTools, createCalculatorTool, createThinkTool, createTimeTool } from './tools';
export { createFunctionCallAgent } from './function-call';
export { createReactAgent } from './react';
export { xmlExtractor, quickExtract, quickExtractMultiple } from './xml-extractor';

// 天气工具
export { WeatherTool, createWeatherTool, CITY_COORDINATES } from './tools/weather-tool';

// 示例
export { runReactWeatherExample } from './react-weather-example';
