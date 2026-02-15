const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

async function main() {
  console.log('💓 正在执行系统巡检 (DeepSeek Mode)...');

  try {
    // A. 记忆提炼：将对话转为 Insight
    const { data: events } = await supabase.from('ops_agent_events').select('summary').eq('kind', 'gemini_chat').limit(1);
    if (events?.length > 0) {
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: `简述量化观点：${events[0].summary}` }],
      });
      await supabase.from('ops_agent_memory').insert([{ agent_id: 'quant-bot-01', content: completion.choices[0].message.content, type: 'insight' }]);
      console.log('✅ 记忆已同步。');
    }

    // B. 目标检索
    const { data: goals } = await supabase.from('ops_agent_goals').select('*').eq('status', 'active').limit(1);
    const currentGoal = goals?.[0]?.title || "自主量化工具开发";

    // C. 提案与拆解
    console.log(`🤔 基于目标 [${currentGoal}] 正在生成拆解方案...`);
    const initiative = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: `你是一个量化研究员。目标是：${currentGoal}。` },
        { role: "user", content: '返回 JSON: {"should_propose":true, "title":"...", "reason":"...", "steps":[{"order":1,"title":"..."},{"order":2,"title":"..."}]}' }
      ]
    });

    const rawContent = initiative.choices[0].message.content.replace(/```json|```/g, '').trim();
    const decision = JSON.parse(rawContent);

    if (decision?.should_propose) {
      // 插入提案
      const { data: proposal, error: pError } = await supabase.from('ops_mission_proposals').insert([{ 
        agent_id: 'quant-bot-01', // 严格对齐你的 ID
        title: decision.title, 
        summary: decision.reason, 
        is_initiative: true 
      }]).select();

      if (pError) throw pError;

      // 插入步骤 (Chapter 7)
      if (decision.steps && proposal?.[0]) {
        const steps = decision.steps.map(s => ({
          proposal_id: proposal[0].id,
          step_order: s.order,
          title: s.title
        }));
        await supabase.from('ops_mission_steps').insert(steps);
        console.log(`💡 提案与 ${steps.length} 个步骤已全部入库！`);
      }
    }
    console.log('✨ 巡检完成。');
  } catch (error) {
    console.error('❌ 基础架构对接失败:', error.message); // 会捕获字段缺失等错误
  }
}
main();