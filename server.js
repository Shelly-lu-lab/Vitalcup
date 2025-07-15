const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chineseLunar = require('chinese-lunar');
const DATA_FILE = path.join(__dirname, 'daily_juice.json');

const app = express();
const PORT = 3000;

app.use(express.static('.'));
app.use(express.json());

// ====== 火山引擎/即梦相关内容已删除 ======
// 只保留通义千问API相关内容
const QWEN_API_KEY = 'sk-6a496d64be234dd98bd17ea6992b2d15';
const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 通义千问文生图API
const QWEN_IMAGE_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';

const solarTerms = [
  { name: "小寒", month: 1, day: 6 },
  { name: "大寒", month: 1, day: 20 },
  { name: "立春", month: 2, day: 4 },
  { name: "雨水", month: 2, day: 19 },
  { name: "惊蛰", month: 3, day: 6 },
  { name: "春分", month: 3, day: 21 },
  { name: "清明", month: 4, day: 5 },
  { name: "谷雨", month: 4, day: 20 },
  { name: "立夏", month: 5, day: 6 },
  { name: "小满", month: 5, day: 21 },
  { name: "芒种", month: 6, day: 6 },
  { name: "夏至", month: 6, day: 21 },
  { name: "小暑", month: 7, day: 7 },
  { name: "大暑", month: 7, day: 23 },
  { name: "立秋", month: 8, day: 8 },
  { name: "处暑", month: 8, day: 23 },
  { name: "白露", month: 9, day: 8 },
  { name: "秋分", month: 9, day: 23 },
  { name: "寒露", month: 10, day: 8 },
  { name: "霜降", month: 10, day: 24 },
  { name: "立冬", month: 11, day: 8 },
  { name: "小雪", month: 11, day: 22 },
  { name: "大雪", month: 12, day: 7 },
  { name: "冬至", month: 12, day: 22 }
];

function getSolarTermByDate(year, month, day) {
  for (let i = solarTerms.length - 1; i >= 0; i--) {
    const t = solarTerms[i];
    if (month > t.month || (month === t.month && day >= t.day)) {
      return t.name;
    }
  }
  return solarTerms[solarTerms.length - 1].name;
}

function getTodayInfo() {
  // 使用北京时间
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const dateStr = `${year}年${month}月${day}日`;
  const solarTerm = getSolarTermByDate(year, month, day);
  return { dateStr, solarTerm };
}

function getPrompt() {
  const { dateStr, solarTerm } = getTodayInfo();
  return [
    { role: "system", content: "你是一个健康饮品推荐助手，每天会为用户生成一份蔬果汁推荐，包括日期、节气、推荐原材料（4种）、每日物语（80字以内，文艺、健康、积极）。返回格式为JSON，字段有：date, solar_term, ingredients, poem。" },
    { role: "user", content: `请生成${dateStr}（节气：${solarTerm}）的蔬果汁推荐。` }
  ];
}

async function generateDailyJuice() {
  const messages = getPrompt();
  const body = {
    model: "qwen-plus",
    messages,
    result_format: "text"
  };
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${QWEN_API_KEY}`
  };
  const resp = await axios.post(QWEN_API_URL, body, { headers });
  // 假设返回内容在 resp.data.choices[0].message.content
  const content = resp.data.choices[0].message.content;
  // 解析JSON
  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    // 若不是标准JSON，可用正则或其它方式提取
    data = { date: '', solar_term: '', ingredients: '', poem: content };
  }
  // 强制覆盖为今天日期
  data.date = getTodayDateStr();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log('生成内容:', data);
  return data;
}

function getTodayDateStr() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  return `${year}年${month}月${day}日`;
}

// 记录上一次生成的配料组合
let lastIngredients = '';

// 提供API给前端获取每日推荐
app.get('/api/daily-juice', async (req, res) => {
  let needUpdate = true;
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    if (data.date === getTodayDateStr()) {
      needUpdate = false;
      res.json(data);
      return;
    }
  }
  // 不是当天，重新生成
  const data = await generateDailyJuice();
  res.json(data);
});

// 新增：AI生成蔬果汁配料和物语的API
app.get('/api/ai-juice', async (req, res) => {
  // 获取当前节气
  const { dateStr, solarTerm } = getTodayInfo();
  // 构造避免重复的提示
  const avoidLast = lastIngredients ? `上一次的配料是：${lastIngredients}，本次请尽量不同。` : '';
  const prompt = `请为我生成一组全新的健康蔬果汁推荐，要求：\n1. 生成一个富有禅意、优雅且与配料和季节高度相关的中文名字，并为其生成一个独特、优美、与中文名和配料语义高度匹配的英文名（英文名字段必须为 name_en，不要用其他字段名，不要总是用 Morning Dew、Serene Clouds 等通用词汇，每次都要有变化，且不要与上一次英文名重复）；\n2. 生成4-6种水果和蔬菜的配料，水果和蔬菜均衡；\n3. 每种组合都要兼顾营养价值、口味和口感的多样性，同时符合当前节气的时令水果蔬菜（当前节气：${solarTerm}）；\n4. 配料之间不能存在食物相克的风险；\n${avoidLast}\n5. 返回格式为JSON：{\"name\":\"xxx\",\"name_en\":\"xxx\",\"ingredients\":[\"xxx\",\"xxx\"],\"poem\":\"xxx\",\"物语\":\"xxx\"}\n6. 并写一句富有诗意的物语。`;
  try {
    const body = {
      model: "qwen-plus",
      messages: [
        { role: "system", content: "你是一个健康饮品推荐助手。" },
        { role: "user", content: prompt }
      ],
      result_format: "text"
    };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_API_KEY}`
    };
    const resp = await axios.post(QWEN_API_URL, body, { headers });
    let text = resp.data.choices[0].message.content.trim();
    console.log('AI原始返回内容:', text);
    // 只提取JSON部分
    const match = text.match(/\{[\s\S]*\}/);
    let data;
    if (match) {
      data = JSON.parse(match[0]);
    } else {
      data = { name: "清心露", name_en: "Morning Dew", ingredients: ["苹果","黄瓜","薄荷","菠菜","橙子","胡萝卜"], poem: "清晨的第一缕阳光，藏在蔬果的清甜里。", "物语": "清新甘露，润泽心田。" };
    }
    // 英文名兼容多种字段
    if (!data.name_en) {
      data.name_en = data.英文名 || data.en_name || data.english_name || '';
      // 尝试用正则提取英文名
      if (!data.name_en) {
        const enMatch = text.match(/"name_en"\s*:\s*"([^"]+)"/i) || text.match(/"英文名"\s*:\s*"([^"]+)"/i) || text.match(/"en_name"\s*:\s*"([^"]+)"/i) || text.match(/"english_name"\s*:\s*"([^"]+)"/i);
        if (enMatch) data.name_en = enMatch[1];
      }
      if (!data.name_en) data.name_en = "Morning Dew";
    }
    console.log('最终JSON数据:', data);
    // 记录本次配料，供下次避免重复
    lastIngredients = Array.isArray(data.ingredients) ? data.ingredients.join('、') : (data.ingredients || '');
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ name: "清心露", name_en: "Morning Dew", ingredients: ["苹果","黄瓜","薄荷","菠菜","橙子","胡萝卜"], poem: "清晨的第一缕阳光，藏在蔬果的清甜里。", "物语": "清新甘露，润泽心田。" });
  }
});

const WANXIANG_API_KEY = 'sk-6a496d64be234dd98bd17ea6992b2d15';
const WANXIANG_CREATE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const WANXIANG_RESULT_URL = 'https://dashscope.aliyuncs.com/api/v1/tasks/';

app.post('/api/ai-image', async (req, res) => {
  const { ingredients, name } = req.body;
  const prompt = `一支透明的漂亮的玻璃杯中装满了${ingredients}，这些蔬菜水果色彩丰富，清新诱人，光线明亮，背景简洁。`;
  try {
    // 1. 创建任务
    const createResp = await axios.post(
      WANXIANG_CREATE_URL,
      {
        model: "wanx2.1-t2i-turbo",
        input: { prompt },
        parameters: { size: "1024*1024", n: 1 }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WANXIANG_API_KEY}`,
          'X-DashScope-Async': 'enable'
        }
      }
    );
    const taskId = createResp.data.output.task_id;
    // 2. 轮询获取结果
    let imageUrl = '';
    let status = '';
    for (let i = 0; i < 20; i++) { // 最多轮询20次
      await new Promise(r => setTimeout(r, 4000)); // 每4秒查一次
      const resultResp = await axios.get(
        WANXIANG_RESULT_URL + taskId,
        {
          headers: {
            'Authorization': `Bearer ${WANXIANG_API_KEY}`
          }
        }
      );
      status = resultResp.data.output.task_status;
      if (status === 'SUCCEEDED') {
        imageUrl = resultResp.data.output.results[0].url;
        break;
      } else if (status === 'FAILED') {
        break;
      }
    }
    if (imageUrl) {
      res.json({ url: imageUrl });
    } else {
      res.status(500).json({ url: '', msg: '图片生成失败或超时' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ url: '', msg: 'API调用失败' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
}); 