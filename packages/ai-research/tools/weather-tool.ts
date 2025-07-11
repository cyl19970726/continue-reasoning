import { ITool, ToolCallDefinition } from '../interfaces.js';
import { z } from 'zod';

// 天气API工具
export class WeatherTool implements ITool {
  name = 'get_weather';
  description = '获取指定经纬度的当前天气温度（摄氏度）';
  params = z.object({ 
    latitude: z.number().describe('纬度，范围-90到90'),
    longitude: z.number().describe('经度，范围-180到180')
  });

  async execute_func(params: { latitude: number; longitude: number }) {
    try {
      const temperature = await getWeather(params.latitude, params.longitude);
      return {
        latitude: params.latitude,
        longitude: params.longitude,
        temperature: temperature,
        unit: '摄氏度',
        success: true
      };
    } catch (error) {
      throw new Error(`获取天气数据失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  toCallDefinition(): ToolCallDefinition {
    return {
      type: 'function',
      name: this.name,
      description: this.description,
      paramSchema: this.params,
      strict: false
    };
  }
}

// 获取天气的核心函数
async function getWeather(latitude: number, longitude: number) {
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`);
  const data = await response.json() as any;
  return data.current.temperature_2m;
}

// 便捷函数
export function createWeatherTool(): WeatherTool {
  return new WeatherTool();
}

// 一些常用城市的坐标
export const CITY_COORDINATES = {
  '北京': { latitude: 39.9042, longitude: 116.4074 },
  '上海': { latitude: 31.2304, longitude: 121.4737 },
  '广州': { latitude: 23.1291, longitude: 113.2644 },
  '深圳': { latitude: 22.5431, longitude: 114.0579 },
  '成都': { latitude: 30.5728, longitude: 104.0668 },
  '杭州': { latitude: 30.2741, longitude: 120.1551 },
  '西安': { latitude: 34.3416, longitude: 108.9398 },
  '武汉': { latitude: 30.5928, longitude: 114.3055 },
  '南京': { latitude: 32.0603, longitude: 118.7969 },
  '重庆': { latitude: 29.4316, longitude: 106.9123 },
  
  // 国际城市
  '东京': { latitude: 35.6762, longitude: 139.6503 },
  '纽约': { latitude: 40.7128, longitude: -74.0060 },
  '伦敦': { latitude: 51.5074, longitude: -0.1278 },
  '巴黎': { latitude: 48.8566, longitude: 2.3522 },
  '洛杉矶': { latitude: 34.0522, longitude: -118.2437 },
  '悉尼': { latitude: -33.8688, longitude: 151.2093 }
}; 