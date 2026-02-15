

const { createClient } = require('@supabase/supabase-js');

// 修改为从环境变量读取
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function runTest() {
    console.log('🚀 开始模拟 Agent 产生想法...');

    const input = {
        agent_id: 'quant-bot-01',
        title: '量化交易工具市场分析任务',
        proposed_steps: [{ 
            kind: 'analyze', 
            payload: { topic: 'trading tools', region: 'China' } 
        }]
    };

    // 1. 在 ops_mission_proposals 插入提案
    const { data: proposal, error: err1 } = await supabase
        .from('ops_mission_proposals')
        .insert([{
            agent_id: input.agent_id,
            title: input.title,
            proposed_steps: input.proposed_steps,
            status: 'pending'
        }])
        .select().single();

    if (err1) return console.error('❌ 插入提案失败:', err1.message);
    console.log('✅ 提案已存入 ops_mission_proposals 表');

    // 2. 模拟自动批准：创建正式任务 (Mission)
    const { data: mission, error: err2 } = await supabase
        .from('ops_missions')
        .insert([{ 
            title: input.title, 
            created_by: input.agent_id, 
            status: 'approved' 
        }])
        .select().single();

    if (err2) return console.error('❌ 创建任务失败:', err2.message);

    // 3. 写入具体执行步骤 (Step)
    const { error: err3 } = await supabase
        .from('ops_mission_steps')
        .insert([{
            mission_id: mission.id,
            kind: 'analyze',
            status: 'queued', 
            payload: input.proposed_steps[0].payload
        }]);

    if (err3) return console.error('❌ 写入步骤失败:', err3.message);

    console.log('🎉 成功！你的任务已经进入队列，去 Supabase 刷新看看吧。');
}

runTest();