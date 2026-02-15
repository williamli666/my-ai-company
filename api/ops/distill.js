import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    // 1. 获取最近一次圆桌对话的内容
    const { data: events } = await supabase
      .from('ops_agent_events')
      .select('summary')
      .eq('kind', 'gemini_chat')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!events?.length) return res.status(404).json({ message: 'No chat found' });

    // 2. 让 Gemini 提炼核心洞察
    const prompt = `你是记忆提炼师。请分析以下对话，并提取出 1 条对量化交易有价值的策略或教训。
    对话内容: ${events[0].summary}
    请按 JSON 格式返回: {"type": "strategy/lesson", "content": "内容", "confidence": 0.9}`;

    const result = await model.generateContent(prompt);
    const memory = JSON.parse(result.response.text().replace(/```json|```/g, ''));

    // 3. 写入 ops_agent_memory 表
    if (memory.confidence >= 0.55) {
      await supabase.from('ops_agent_memory').insert([{
        agent_id: 'analyst',
        type: memory.type,
        content: memory.content,
        confidence: memory.confidence,
        tags: ['distilled']
      }]);
    }

    return res.status(200).json({ success: true, memory });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}