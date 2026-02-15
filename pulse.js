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
    const { data: events } = await supabase
      .from('ops_agent_events')
      .select('summary')
      .eq('kind', 'gemini_chat')
      .limit(1);

    if (events && events.length > 0) {
      console.log('🧠 正在提炼对话记忆...');
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: `简述此量化观点：${events[0].summary}` }],
      });
      
      await supabase.from('ops_agent_memory').insert([{ 
        agent_id: 'quant-bot-01', 
        content: completion.choices[0].message.content, 
        type: 'insight' 
      }]);
      console.log('✅ 记忆已存入笔记本。');
    }

    // --- 步骤 B: 目标检索 ---
    console.log('🎯 正在检索当前核心目标...');
    const { data: goals } = await supabase
      .from('ops_agent_goals')
      .select('*')
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .limit(1);

    const currentGoal = (goals && goals.length > 0) ? goals[0].title : "自主探索量化工具开发";

    // --- 步骤 C: 目标驱动的提案与任务拆解 ---
    console.log(`🤔 基于目标 [${currentGoal}] 正在拆解任务...`);
    
    const initiative = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { 
          role: "system", 
          content: `你是一个专业的量化交易研究员。目标是：${currentGoal}。请产生一个提案并拆解为3步。要求返回标准的 JSON 格式。` 
        },
        { 
          role: "user", 
          content: '返回 JSON: {"should_propose": true, "title": "...", "reason": "...", "steps": [{"order": 1, "title": "..."}, {"order": 2, "title": "..."}, {"order": 3, "title": "..."}]}' 
        }
      ]
    });

    // 强化的 JSON 清洗逻辑
    let decision;
    try {
      const rawContent = initiative.choices[0].message.content;
      const cleanJson = rawContent.replace(/```json|```/g, '').trim();
      decision = JSON.parse(cleanJson);
    } catch (e) {
      console.log('⚠️ JSON 解析异常，DeepSeek 返回内容：', initiative.choices[0].message.content);
      return;
    }
    
    if (decision && decision.should_propose) {
      // 构造插入数据，适配可能缺失的 summary 字段
      const proposalData = {
        agent_id: 'quant-bot-01', 
        title: decision.title, 
        status: 'pending', 
        is_initiative: true
      };

      // 动态判断字段名，增加鲁棒性
      if (decision.reason) {
        proposalData.summary = decision.reason; 
      }

      const { data: proposal, error: pError } = await supabase
        .from('ops_mission_proposals')
        .insert([proposalData])
        .select();

      if (pError) {
        console.error('❌ 提案入库失败 (地基不稳):', pError.message);
        return;
      }

      // 写入任务步骤 (Chapter 7)
      if (decision.steps && proposal?.[0]) {
        const stepsToInsert = decision.steps.map(s => ({
          proposal_id: proposal[0].id,
          step_order: s.order,
          title: s.title,
          status: 'todo'
        }));
        await supabase.from('ops_mission_steps').insert(stepsToInsert);
        console.log(`💡 提案与 ${decision.steps.length} 个步骤已全部入库！`);
      }
    }

    console.log('✨ 巡检完成。');

  } catch (error) {
    console.error('❌ 巡检过程遇到致命错误:', error.message);
  }
}

main();