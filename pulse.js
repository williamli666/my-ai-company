const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function main() {
  console.log('💓 正在执行系统巡检...');

  // 1. 记忆提炼：将对话转为知识
  const { data: events } = await supabase.from('ops_agent_events').select('*').eq('kind', 'gemini_chat').limit(3);
  if (events && events.length > 0) {
    console.log('🧠 正在提炼对话记忆...');
    const result = await model.generateContent(`提炼核心量化观点：${events.map(e => e.summary).join('; ')}`);
    await supabase.from('ops_agent_memory').insert([{ agent_id: 'analyst', content: result.response.text(), type: 'insight', confidence: 0.9 }]);
    console.log('✅ 记忆已存入笔记本。');
  }

  // 2. 主动性：Agent 产生自主想法
  console.log('🤔 Agent 正在思考是否要主动发起提议...');
  const initiativeResult = await model.generateContent('作为量化研究员，请返回一个 JSON 任务提案: {"should_propose": true, "title": "...", "reason": "..."}');
  const decision = JSON.parse(initiativeResult.response.text().replace(/```json|```/g, ''));
  if (decision.should_propose) {
    await supabase.from('ops_mission_proposals').insert([{ agent_id: 'analyst', title: decision.title, summary: decision.reason, status: 'pending', is_initiative: true }]);
    console.log(`💡 Agent 发起了一个主动提案: ${decision.title}`);
  }

  console.log('✨ 巡检完成。');
}
main();