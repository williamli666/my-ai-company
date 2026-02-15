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
    // A. 目标检索
    const { data: goals } = await supabase.from('ops_agent_goals').select('title').eq('status', 'active').limit(1);
    const currentGoal = goals?.[0]?.title || "自主量化工具开发";

    // B. 执行力系统：锁定 thinking 或 queued 状态的任务进行“收尾”
    console.log('💻 正在清理待处理的技术步骤...');
    const { data: pendingSteps } = await supabase
      .from('ops_mission_steps')
      .select('*')
      .in('status', ['queued', 'todo', 'thinking']) // 专门抓取卡在 thinking 的任务
      .limit(1);

    if (pendingSteps && pendingSteps.length > 0) {
      const step = pendingSteps[0];
      console.log(`🛠️ 正在强制完成步骤 [${step.title}] 的代码方案...`);

      const codeGen = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个量化开发专家。直接给出核心 Python 代码块，不要废话。" },
          { role: "user", content: `目标：${currentGoal}\n步骤：${step.title}` }
        ],
        max_tokens: 800 // 进一步缩短长度确保快速返回
      });

      const note = codeGen.choices[0].message.content;
      
      // 强制更新状态为 done
      const { error: upError } = await supabase.from('ops_mission_steps')
        .update({ 
          technical_note: note, 
          status: 'done' // 必须跳转到 done
        })
        .eq('id', step.id);

      if (upError) throw upError;
      console.log(`✅ [${step.title}] 状态已从 thinking 强制跳转至 done。`);
    }

    console.log('✨ 巡检完成。');
  } catch (error) {
    console.error('❌ 运行遇到挑战:', error.message);
  }
}
main();