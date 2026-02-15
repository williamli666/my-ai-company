const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function heartbeat() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  console.log('💓 正在执行系统巡检...');

  try {
    // 1. 【执行 Chapter 1：产生新想法】
    // 模拟 Agent 根据当前行情产生一个分析提案
    await supabase.from('ops_mission_proposals').insert([{
      agent_id: 'quant_bot',
      title: '心跳自动巡检任务',
      proposed_steps: [{ kind: 'analyze', payload: { focus: 'market_trend' } }],
      status: 'pending'
    }]);

    // 2. 【执行 Chapter 3：提炼记忆】
    // 获取最近的一场对话事件
    const { data: events } = await supabase
      .from('ops_agent_events')
      .select('summary')
      .eq('kind', 'gemini_chat')
      .order('created_at', { ascending: false })
      .limit(1);

    if (events?.length > 0) {
      console.log('🧠 正在提炼对话记忆...');
      const prompt = `分析以下对话，提取一条关于量化交易的策略洞察。内容要短小精悍。
      对话内容: ${events[0].summary}
      请按 JSON 格式返回: {"content": "具体的策略内容", "confidence": 0.9}`;

      const result = await model.generateContent(prompt);
      const memory = JSON.parse(result.response.text().replace(/```json|```/g, ''));

      // 只有信心分高于 0.55 才记录
      if (memory.confidence >= 0.55) {
        await supabase.from('ops_agent_memory').insert([{
          agent_id: 'analyst',
          type: 'insight',
          content: memory.content,
          confidence: memory.confidence
        }]);
        console.log('✅ 记忆已存入笔记本。');
      }
    }

    console.log('✨ 巡检完成。');
  } catch (err) {
    console.error('❌ 巡检失败:', err.message);
  }
}

heartbeat();