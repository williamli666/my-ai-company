const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  console.log('💓 正在执行系统巡检...');

  // 1. 记忆提炼
  const { data: events } = await supabase.from('ops_agent_events').select('summary').eq('kind', 'gemini_chat').limit(1);
  if (events && events.length > 0) {
    console.log('🧠 正在提炼对话记忆...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `总结量化观点：${events[0].summary}` }],
    });
    await supabase.from('ops_agent_memory').insert([{ agent_id: 'analyst', content: completion.choices[0].message.content, type: 'insight', confidence: 1.0 }]);
    console.log('✅ 记忆已存入笔记本。');
  }

  // 2. 主动性逻辑
  console.log('🤔 Agent 正在思考是否要主动发起提议...');
  const initiative = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: '返回一个 JSON 任务提案: {"should_propose": true, "title": "...", "reason": "..."}' }],
    response_format: { type: "json_object" }
  });
  const decision = JSON.parse(initiative.choices[0].message.content);
  if (decision.should_propose) {
    await supabase.from('ops_mission_proposals').insert([{ agent_id: 'analyst', title: decision.title, summary: decision.reason, status: 'pending', is_initiative: true }]);
    console.log(`💡 Agent 发起了一个主动提案: ${decision.title}`);
  }

  console.log('✨ 巡检完成。');
}
main();