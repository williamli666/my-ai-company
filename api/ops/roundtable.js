import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    // 【核心改动：查询记忆】从笔记本里取最近的 3 条经验
    const { data: memories } = await supabase
      .from('ops_agent_memory')
      .select('content')
      .order('created_at', { ascending: false })
      .limit(3);

    // 把记忆拼接成一段话
    const memoryContext = memories?.length 
      ? `\n以下是你之前的经验教训，请在对话中参考：\n${memories.map(m => "- " + m.content).join('\n')}`
      : "";

    const topic = "今日量化交易策略讨论";

    // 【核心改动：注入提示词】让 Gemini 带着记忆思考
    const systemPrompt = `你正在模拟 AI 公司的内部会议。
    角色: Boss (简练)、Analyst (严谨)。
    主题: ${topic}。${memoryContext}
    要求: 请生成一段对话，每人一句，每句不超过 120 字。`;

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();

    // 存入事件流
    await supabase.from('ops_agent_events').insert([{
      agent_id: 'roundtable',
      kind: 'gemini_chat_with_memory', // 改个名字标记这是有记忆的聊天
      title: topic,
      summary: responseText
    }]);

    return res.status(200).json({ success: true, content: responseText });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}