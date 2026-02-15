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
    // 1. 记忆提炼
    const { data: events } = await supabase.from('ops_agent_events').select('summary').eq('kind', 'gemini_chat').limit(1);
    if (events?.length > 0) {
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: `简述量化观点：${events[0].summary}` }],
      });
      await supabase.from('ops_agent_memory').insert([{ agent_id: 'quant-bot-01', content: completion.choices[0].message.content, type: 'insight', confidence: 1.0 }]);
      console.log('✅ 记忆已存入笔记本。');
    }

    // 2. 目标检索
    const { data: goals } = await supabase.from('ops_agent_goals').select('*').eq('status', 'active').order('priority', { ascending: true }).limit(1);
    const currentGoal = goals?.[0]?.title || "自主探索开发机会";

    // 3. 目标驱动的提案 + 任务拆解
    console.log(`🤔 基于目标 [${currentGoal}] 正在拆解任务...`);
    const initiative = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: `你是一个量化研究员。目标是：${currentGoal}。请提交一个提案并拆解为3步。` },
        { role: "user", content: '返回 JSON: {"should_propose":true, "title":"...", "reason":"...", "steps":[{"order":1,"title":"..."},{"order":2,"title":"..."},{"order":3,"title":"..."}]}' }
      ]
    });

    // 核心修复：彻底清理 JSON 字符串
    let decision;
    const rawContent = initiative.choices[0].message.content;
    const cleanJson = rawContent.replace(/```json|```/g, '').trim();
    
    try {
      decision = JSON.parse(cleanJson);
    } catch (e) {
      console.log('⚠️ 解析失败，DeepSeek 返回内容：', rawContent);
      return;
    }

    if (decision?.should_propose) {
      // 写入提案
      const { data: proposal, error: pError } = await supabase.from('ops_mission_proposals').insert([{ 
        agent_id: 'quant-bot-01', 
        title: decision.title, 
        summary: decision.reason, 
        status: 'pending', 
        is_initiative: true 
      }]).select();

      if (pError) throw pError;

      // 自动拆解任务步骤
      if (decision.steps && proposal?.[0]) {
        const stepsToInsert = decision.steps.map(s => ({
          proposal_id: proposal[0].id,
          step_order: s.order,
          title: s.title,
          status: 'todo'
        }));
        await supabase.from('ops_mission_steps').insert(stepsToInsert);
        console.log(`💡 提案已存入并自动拆解为 ${decision.steps.length} 个步骤！`);
      }
    }

    console.log('✨ 巡检完成。');
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}
main();