const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// 1. 初始化 Supabase 客户端
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 2. 配置 DeepSeek
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

async function main() {
  console.log('💓 正在执行系统巡检 (DeepSeek Mode)...');

  try {
    // --- 步骤 A: 记忆提炼 ---
    const { data: events } = await supabase.from('ops_agent_events').select('summary').eq('kind', 'gemini_chat').limit(1);
    if (events && events.length > 0) {
      console.log('🧠 正在提炼对话记忆...');
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: `简述此量化观点：${events[0].summary}` }],
      });
      await supabase.from('ops_agent_memory').insert([{ agent_id: 'quant-bot-01', content: completion.choices[0].message.content, type: 'insight' }]);
      console.log('✅ 记忆已存入笔记本。');
    }

    // --- 步骤 B: 目标检索 ---
    const { data: goals } = await supabase.from('ops_agent_goals').select('*').eq('status', 'active').order('priority', { ascending: true }).limit(1);
    const currentGoal = (goals && goals.length > 0) ? goals[0].title : "自主探索量化工具开发";

    // --- 步骤 C: 提案与拆解逻辑 ---
    console.log(`🤔 基于目标 [${currentGoal}] 正在检索任务...`);
    const initiative = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: `你是一个专业的量化交易研究员。目标是：${currentGoal}。请产生一个提案并拆解为3步。` },
        { role: "user", content: '返回 JSON: {"should_propose": true, "title": "...", "reason": "...", "steps": [{"order": 1, "title": "..."}, {"order": 2, "title": "..."}, {"order": 3, "title": "..."}]}' }
      ]
    });

    let decision;
    try {
      decision = JSON.parse(initiative.choices[0].message.content.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.log('⚠️ 提案解析跳过。');
    }
    
    if (decision && decision.should_propose) {
      const { data: proposal, error: pError } = await supabase.from('ops_mission_proposals').insert([{ 
        agent_id: 'quant-bot-01', title: decision.title, summary: decision.reason, is_initiative: true 
      }]).select();

      if (!pError && decision.steps && proposal?.[0]) {
        const steps = decision.steps.map(s => ({ proposal_id: proposal[0].id, step_order: s.order, title: s.title, status: 'todo' }));
        await supabase.from('ops_mission_steps').insert(steps);
        console.log(`💡 新提案已存入并拆解。`);
      }
    }

    // --- 步骤 D: 自动生成技术方案 (Chapter 8 新增) ---
    console.log('💻 正在检查是否有待处理的技术步骤...');
    const { data: pendingSteps } = await supabase
      .from('ops_mission_steps')
      .select('*')
      .or('status.eq.todo,status.eq.queued') // 兼容不同的状态名
      .limit(1);

    if (pendingSteps && pendingSteps.length > 0) {
      const step = pendingSteps[0];
      console.log(`🛠️ 正在为步骤 [${step.title}] 生成 Python/SQL 技术方案...`);

      const codeGen = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个量化开发专家。请为任务步骤提供核心代码实现方案（Markdown 格式）。" },
          { role: "user", content: `目标：${currentGoal}\n步骤名称：${step.title}\n请给出技术实现代码：` }
        ]
      });

      const technicalNote = codeGen.choices[0].message.content;
      
      await supabase.from('ops_mission_steps').update({
        technical_note: technicalNote,
        status: 'done' // 标记方案已完成
      }).eq('id', step.id);

      console.log(`✅ 步骤 [${step.title}] 的方案已录入 technical_note。`);
    }

    console.log('✨ 巡检完成。');

  } catch (error) {
    console.error('❌ 巡检过程遇到错误:', error.message);
  }
}

main();