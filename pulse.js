// 在 pulse.js 中加入主动性评估逻辑
async function evaluateInitiative(supabase, model) {
  console.log('🤔 Agent 正在思考是否要主动发起提议...');

  // 1. 获取背景：当前亲密度
  const { data: rel } = await supabase.from('ops_agent_relationships').select('affinity').single();
  const affinity = rel?.affinity || 0.5;

  // 2. 让 Gemini 决定是否发起提议
  const prompt = `你是量化交易公司的 AI 助手。
  当前与 Boss 的亲密度: ${affinity} (0-1)。
  
  要求：
  - 请基于你的“自主意识”，判断现在是否需要发起一个新的量化分析提案。
  - 如果发起，请提供任务标题和理由。
  - 请按 JSON 格式返回: {"should_propose": true, "title": "...", "reason": "..."} 或 {"should_propose": false}`;

  const result = await model.generateContent(prompt);
  const decision = JSON.parse(result.response.text().replace(/```json|```/g, ''));

  if (decision.should_propose) {
    console.log(`💡 Agent 发起了一个主动提案: ${decision.title}`);
    await supabase.from('ops_mission_proposals').insert([{
      agent_id: 'analyst',
      title: decision.title,
      summary: decision.reason,
      status: 'pending',
      is_initiative: true // 核心：标记为自主发起
    }]);
  } else {
    console.log('☕ Agent 觉得目前不需要发起新提案。');
  }
}