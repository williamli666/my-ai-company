import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 验证授权（防止别人恶意触发你的心跳）
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('💓 心跳触发：正在巡检系统状态...');

    // 1. 模拟评估触发器 (Chapter 1 逻辑)
    // 实际项目中这里会调用 evaluateTriggers()
    const { data: triggerCount } = await supabase
      .from('ops_policy')
      .select('value')
      .eq('key', 'system_status')
      .single();

    // 2. 这里的逻辑可以根据教程 Chapter 1 扩展：
    // - 检查是否有超时的任务并标记失败 (Recover stuck tasks)
    // - 检查是否需要开启新的 Agent 对话
    
    // 记录一次运行日志 (Chapter 8)
    await supabase.from('ops_agent_events').insert([{
      agent_id: 'system',
      kind: 'heartbeat_pulse',
      title: '心跳自检完成',
      summary: '系统运行正常，触发器已评估。'
    }]);

    return res.status(200).json({ success: true, message: 'Heartbeat processed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}