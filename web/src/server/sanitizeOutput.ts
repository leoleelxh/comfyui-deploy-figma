/**
 * 工具函数：清理运行数据以减少数据库存储压力
 * 此函数移除输入输出数据中的大型属性，保留必要的元数据
 */
export function sanitizeRunData(data: any): any {
  // 如果不是对象或者是空值，直接返回
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // 处理数组
  if (Array.isArray(data)) {
    return data.map(item => sanitizeRunData(item));
  }
  
  // 处理对象
  const result = { ...data };
  
  // 清理输出数据中的图片
  if (result.images && Array.isArray(result.images)) {
    result.images = result.images.map((image: any) => {
      const cleanImage = { ...image };
      // 删除大型属性
      delete cleanImage.data;
      delete cleanImage.raw_data;
      delete cleanImage.base64;
      delete cleanImage.mask;
      
      // 处理seed_info
      if (cleanImage.seed_info && typeof cleanImage.seed_info === 'string' && cleanImage.seed_info.length > 1000) {
        try {
          const seedInfo = JSON.parse(cleanImage.seed_info);
          cleanImage.seed_info = { seed: seedInfo.seed }; // 只保留种子值
        } catch (e) {
          delete cleanImage.seed_info;
        }
      }
      
      return cleanImage;
    });
  }

  // 清理输入数据中的base64
  if (result.inputs && typeof result.inputs === 'object') {
    Object.keys(result.inputs).forEach(key => {
      const value = result.inputs[key];
      if (typeof value === 'string' && value.startsWith('data:')) {
        // 将base64替换为标记，表示这里曾经有图片数据
        result.inputs[key] = '[IMAGE DATA CLEANED]';
      }
    });
  }
  
  // 处理其他可能的大型属性
  if (result.error && typeof result.error === 'string' && result.error.length > 5000) {
    result.error = result.error.substring(0, 5000) + '... [错误信息已截断]';
  }
  
  // 处理日志数据
  if (result.logs && Array.isArray(result.logs) && result.logs.length > 10) {
    result.logs = result.logs.slice(0, 10);
    result.logs.push({ message: `... [已截断 ${result.logs.length - 10} 条日志]` });
  }
  
  return result;
} 