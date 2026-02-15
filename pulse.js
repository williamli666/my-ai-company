const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// 1. 初始化客户端
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 2. 配置 DeepSeek (使用 OpenAI 兼容模式)
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

async function main() {
  console.log('💓 正在执行系统巡检 (DeepSeek Mode)...');

  try {
    // --- 步骤 A: 记忆提炼 (Distill Memory) ---
    const { data: events } = await supabase
      .from('ops_agent_events')
      .select('summary')
      .eq('kind', 'gemini_chat')
      .limit(1);

    if (events && events.length > 0) {
      console.log('🧠 正在提炼对话记忆...');
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: `总结这段量化观点：${events[0].summary}` }],
      });
      
      const insight = completion.choices[0].message.content;
      await supabase.from('ops_agent_memory').insert([{ 
        agent_id: 'analyst', 
        content: insight, 
        type: 'insight', 
        confidence: 1.0 
      }]);
      console.log('✅ 记忆已存入笔记本。');
    }

    // --- 步骤 B: 目标检索 (Goal Retrieval) ---
    console.log('🎯 正在检索当前核心目标...');
    const { data: goals } = await supabase
      .from('ops_agent_goals')
      .select('*')
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .limit(1);

    const currentGoal = (goals && goals.length > 0) 
      ? goals[0].title 
      : "自主探索量化交易工具的开发机会";

    // --- 步骤 C: 目标驱动的主动提案 (Goal-Driven Initiative) ---
    console.log(`🤔 Agent 正在基于目标 [${currentGoal}] 思考提议...`);
    
    const initiative = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { 
          role: "system", 
          content: `你是一个专业的量化交易研究员。你的长期目标是：${currentGoal}。请以此为核心产生一个具体、可落地的任务提案。` 
        },
        { 
          role: "user", 
          content: '请返回一个 JSON 格式的提案，包含 should_propose(true), title, reason 三个字段。' 
        }
      ],
      response_format: { type: "json_object" } // 确保 DeepSeek 返回标准的 JSON
    });

    const decision = JSON.parse(initiative.choices[0].message.content.replace(/```json|```/g, ''));
    
    if (decision.should_propose) {
      await supabase.from('ops_mission_proposals').insert([{ 
        agent_id: 'analyst', 
        title: decision.title, 
        summary: decision.reason, 
        status: 'pending', 
        is_initiative: true 
      }]);
      console.log(`💡 DeepSeek 发起了一个指向目标的提案: ${decision.title}`);
    }

    console.log('✨ 巡检完成。');

  } catch (error) {
    console.error('❌ 巡检过程中遇到错误:', error.message);
  }
}

main();