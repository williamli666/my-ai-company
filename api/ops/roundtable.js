import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. 定义 Agent 声音 (Voices)
  const VOICES = {
    boss: { displayName: 'Boss', tone: '结果导向，直接', directive: '你是个心急的项目经理，关心进度和利润。' },
    analyst: { displayName: 'Analyst', tone: '客观，看证据', directive: '你是个数据分析师，除非有数据支持，否则你持怀疑态度。' }
  };

  try {
    // 2. 模拟一场对话 (这里未来会调用 LLM API)
    const topic = "今日市场波动性分析";
    const dialogue = [
      { speaker: 'analyst', text: "数据表明 BTC 波动率在上升，这可能是一个入场信号。" },
      { speaker: 'boss', text: "好，重点是风险。我们现在的止损策略能覆盖这种波动吗？" }
    ];

    // 3. 记录对话事件到 ops_agent_events
    for (const turn of dialogue) {
      await supabase.from('ops_agent_events').insert([{
        agent_id: turn.speaker,
        kind: 'roundtable_talk',
        title: topic,
        summary: turn.text
      }]);
    }

    // 4. (进阶) 提炼记忆：将对话总结存入 ops_agent_memory
    
    return res.status(200).json({ success: true, message: 'Roundtable completed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}