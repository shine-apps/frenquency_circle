/**
 * 兴趣 × MBTI 16 型推荐概率矩阵种子数据。
 *
 * 每个类型列出 6 条推荐(来自现有兴趣标签库 hobby_tags 的标签名),
 * matchProbability 为 0-100 的推荐权重,结果页按权重降序取 top-N。
 * 插库时按标签名映射 hobby_tags.id,映射失败即报错(seed 保证数据一致性)。
 * 未列出的 (tag, type) 组合视为概率 0,不入库。
 */

import type { MbtiTypeCode } from "@/lib/mbti/types"

export type MbtiHobbyScoreSeed = {
  tagName: string
  matchProbability: number
  reason: string
}

export const MBTI_HOBBY_SCORE_SEEDS: Record<
  MbtiTypeCode,
  MbtiHobbyScoreSeed[]
> = {
  INTJ: [
    { tagName: "书法", matchProbability: 95, reason: "临帖需要长期专注与自我要求，正合你深度钻研、精益求精的天性，一笔一画皆是长期主义的修行。" },
    { tagName: "国画", matchProbability: 90, reason: "留白与构图的经营如同战略设计，你善于在整体布局中把控细节，墨色深浅间自成体系。" },
    { tagName: "篆刻", matchProbability: 85, reason: "方寸之间讲究法度与巧思，安静、独立、需要极致耐心，恰好契合你的专注与审美。" },
    { tagName: "古琴", matchProbability: 80, reason: "曲深而静，重内不重外，适合在独处中获得深度滋养，与你享受独处的性格天然契合。" },
    { tagName: "摄影", matchProbability: 75, reason: "取景、构图、后期都有一套可不断优化的体系，满足你对技术精进与审美表达的双重要求。" },
    { tagName: "瑜伽", matchProbability: 70, reason: "独自练习即可完成，讲求呼吸与身体的自我觉察，是高强度思考后很好的平衡与修复。" },
  ],
  INTP: [
    { tagName: "手冲咖啡", matchProbability: 88, reason: "水温、研磨度、注水手法都是可反复实验的变量，像一场随时可以推翻重来的味觉实验。" },
    { tagName: "摄影", matchProbability: 85, reason: "器材、参数、光影背后有大量可钻研的原理，你享受搞懂'为什么'再按下快门的过程。" },
    { tagName: "AI绘画", matchProbability: 82, reason: "提示词与模型能力的边界值得不断探索，是新知识与创造力结合的绝佳玩场。" },
    { tagName: "电子音乐", matchProbability: 80, reason: "合成器、音序、编曲逻辑像搭建一个可编程的声音系统，理性与创意兼得。" },
    { tagName: "视频剪辑", matchProbability: 78, reason: "节奏、结构、叙事是可拆解的工程问题，一个人即可完成从构思到成片的全流程。" },
    { tagName: "钓鱼", matchProbability: 70, reason: "了解鱼的习性、天气与水域的关系是门学问，安静等待的过程恰好放空大脑。" },
  ],
  ENTJ: [
    { tagName: "力量训练", matchProbability: 90, reason: "以数据与计划驱动进步，每一组重量都是可量化的目标，符合你结果导向的行事风格。" },
    { tagName: "骑行", matchProbability: 85, reason: "长距离骑行像一场项目管理：路线规划、体能分配、补给节奏，缺一不可。" },
    { tagName: "网球", matchProbability: 80, reason: "攻防节奏快、对抗性强，既讲策略又拼执行力，是很好的决策力训练场。" },
    { tagName: "攀岩", matchProbability: 78, reason: "每一次登顶都来自清晰的路线判断与坚决的执行，过程充满目标达成的掌控感。" },
    { tagName: "跑步", matchProbability: 75, reason: "配速与里程数据化、目标明确，是把自律变成习惯的最简路径。" },
    { tagName: "拉丁舞", matchProbability: 70, reason: "在领导感与表现力之间切换，帮你把果断用更松弛的方式表达出来。" },
  ],
  ENTP: [
    { tagName: "相声", matchProbability: 85, reason: "抖包袱考验即兴与逻辑的反转，你天生享受语言交锋与观众反应的即时博弈。" },
    { tagName: "精酿", matchProbability: 82, reason: "原料配比与风味实验空间巨大，约上朋友边品边聊新想法，是社交与创造的结合。" },
    { tagName: "飞盘", matchProbability: 80, reason: "规则新潮、战术多变，快速上手的正反馈与团队攻防的博弈感都很对你的胃口。" },
    { tagName: "街舞", matchProbability: 78, reason: "自由风格与个人表达空间大，即兴 Solo 正是把脑洞直接变成动作的出口。" },
    { tagName: "摄影", matchProbability: 75, reason: "题材广泛、玩法多变，纪实、街拍都能承载你旺盛的好奇心与表达欲。" },
    { tagName: "电子音乐", matchProbability: 72, reason: "风格流派百花齐放，混音与编曲都是把新点子快速落地的声音实验。" },
  ],
  INFJ: [
    { tagName: "茶艺", matchProbability: 92, reason: "一壶一盏间的仪式感与静观，让细腻的你在专注中获得深层的安宁与秩序感。" },
    { tagName: "香道", matchProbability: 88, reason: "品香讲究静心与觉知，契合你向内探索、追求精神深度的天性。" },
    { tagName: "国画", matchProbability: 85, reason: "写意笔墨承载含蓄的情感表达，不需言语也能画出内心的丰盈世界。" },
    { tagName: "瑜伽", matchProbability: 80, reason: "体式与呼吸的觉察让你从'共情他人'回到'感受自己'，是难得的向内充电。" },
    { tagName: "古琴", matchProbability: 78, reason: "琴音低缓悠远，适合在安静的独处中与自己对话，滋养内在世界。" },
    { tagName: "书法", matchProbability: 75, reason: "静心练字是情绪的整理过程，笔墨之间自然完成一次自我修复。" },
  ],
  INFP: [
    { tagName: "国画", matchProbability: 88, reason: "写意画重意境与情绪，正是你把内心感受化为具体形象的温柔出口。" },
    { tagName: "香道", matchProbability: 85, reason: "气味记忆与情绪高度相连，制香、品香是只属于你的感官日记。" },
    { tagName: "书法", matchProbability: 82, reason: "字如其人，练字是与自己相处的方式，情绪都在笔锋里被温柔安放。" },
    { tagName: "插画", matchProbability: 80, reason: "用画面讲故事，把你丰富的想象力与细腻情感变成可见的小世界。" },
    { tagName: "园艺", matchProbability: 78, reason: "照料植物缓慢而治愈，观察生命成长的细节最能安放你的柔软。" },
    { tagName: "古筝", matchProbability: 75, reason: "音色如流水般抒情，弹奏时情绪有了流动的通道，孤独也变得美好。" },
  ],
  ENFJ: [
    { tagName: "民族民间舞", matchProbability: 85, reason: "群体排练与共同演出让你在带动大家的过程中发光，天生的舞台组织者。" },
    { tagName: "话剧", matchProbability: 82, reason: "理解角色、与同伴共创一场演出，是共情力与组织力的完美舞台。" },
    { tagName: "茶艺", matchProbability: 80, reason: "以茶会友，你擅长在分享茶汤的时刻照顾每个人的感受与节奏。" },
    { tagName: "中式插花", matchProbability: 78, reason: "一花一叶的取舍里满是温度，作品还能装点大家共同的空间。" },
    { tagName: "徒步", matchProbability: 75, reason: "组队徒步时你自然成为凝聚者，照应每个人的进度与情绪。" },
    { tagName: "跑步", matchProbability: 72, reason: "组织跑团、带朋友打卡，把自律变成一种带动他人的影响力。" },
  ],
  ENFP: [
    { tagName: "徒步", matchProbability: 88, reason: "山野之间充满未知的风景与偶遇，边走边聊正好安放你旺盛的好奇心与热情。" },
    { tagName: "街舞", matchProbability: 85, reason: "音乐一响就能点燃全场，即兴与律动是你表达快乐的本能方式。" },
    { tagName: "尊巴", matchProbability: 82, reason: "像开一场派对式的健身课，把运动变成集体狂欢，越跳越上头。" },
    { tagName: "摄影", matchProbability: 80, reason: "抓住生活中鲜活的瞬间与人，你的热情让镜头前的人自然放松。" },
    { tagName: "露营", matchProbability: 78, reason: "和朋友们围坐星空下畅聊，新鲜的场景给灵感与友谊同时充电。" },
    { tagName: "尤克里里", matchProbability: 76, reason: "上手快、氛围感强，随时抱起来就能给朋友即兴伴奏。" },
  ],
  ISTJ: [
    { tagName: "太极拳", matchProbability: 88, reason: "招式有章法、进退有次序，日复一日的练习正合你按部就班的自律。" },
    { tagName: "钓鱼", matchProbability: 85, reason: "准备装备、选点、守候的完整流程有条不紊，收获与否都是对耐心的回报。" },
    { tagName: "书法", matchProbability: 82, reason: "临帖讲究一笔不苟，长期练习看得见进步，是典型的低风险高确定性的爱好。" },
    { tagName: "乒乓球", matchProbability: 78, reason: "规则清晰、回合分明，稳定的基本功在对抗中最能体现价值。" },
    { tagName: "登山", matchProbability: 75, reason: "按既定路线稳步登顶，过程可控、成果踏实，走一步有一步的收获。" },
    { tagName: "茶艺", matchProbability: 72, reason: "冲泡流程讲究次序与水温细节，严谨的你很快就能泡出一手好茶。" },
  ],
  ISFJ: [
    { tagName: "烘焙", matchProbability: 90, reason: "精确的配方与用心的制作，最终变成家人朋友脸上的笑容，付出都被温柔看见。" },
    { tagName: "中式插花", matchProbability: 85, reason: "花材修剪与搭配需要细致耐心，作品又能装点家居、温暖身边的人。" },
    { tagName: "刺绣", matchProbability: 82, reason: "一针一线皆是心意，安静专注的过程本身就在为情绪蓄能。" },
    { tagName: "茶艺", matchProbability: 80, reason: "为家人朋友斟上一盏好茶，是把体贴落到实处的最美仪式。" },
    { tagName: "园艺", matchProbability: 78, reason: "每天小小的照料换来四季的花开，适合把关怀种进土里慢慢生长。" },
    { tagName: "手冲咖啡", matchProbability: 70, reason: "为在意的人磨豆冲煮，细节里的用心都是无声的表达。" },
  ],
  ESTJ: [
    { tagName: "篮球", matchProbability: 88, reason: "团队配合讲纪律、战术讲执行，你在组织攻防中天然担任指挥角色。" },
    { tagName: "排球", matchProbability: 82, reason: "轮转与站位规则明确，靠团队纪律赢球，最能发挥你的组织协调力。" },
    { tagName: "羽毛球", matchProbability: 80, reason: "节奏快、对抗直接，输赢当场见分晓，干脆利落。" },
    { tagName: "定向越野", matchProbability: 78, reason: "读图、决策、执行一气呵成，是效率与判断力的双重比拼。" },
    { tagName: "跑步", matchProbability: 75, reason: "目标明确、强度可控，坚持训练的复利效应符合你对回报的期待。" },
    { tagName: "力量训练", matchProbability: 72, reason: "以计划表推进、以数据检验，是最讲秩序与执行力的训练方式。" },
  ],
  ESFJ: [
    { tagName: "广场舞", matchProbability: 88, reason: "大家一起跳才有味道，你享受熟悉的队伍、热闹的氛围与集体默契。" },
    { tagName: "交谊舞", matchProbability: 85, reason: "舞伴配合与舞池互动让每一次起舞都充满人情味，你的热情最能带动气氛。" },
    { tagName: "烘焙", matchProbability: 82, reason: "做的点心总要与人分享才完整，分给朋友的那一刻最有成就感。" },
    { tagName: "中式插花", matchProbability: 78, reason: "作品为家增色、为聚会添彩，你的用心总能被大家看见。" },
    { tagName: "羽毛球", matchProbability: 76, reason: "约球容易成局，边打边聊，运动与友谊一起经营。" },
    { tagName: "排舞", matchProbability: 74, reason: "固定舞步与集体排练其乐融融，越跳越像一家人。" },
  ],
  ISTP: [
    { tagName: "木作", matchProbability: 92, reason: "选料、开榫、打磨全是手上功夫，看得见的成果最令你踏实满足。" },
    { tagName: "攀岩", matchProbability: 85, reason: "冷静读线、精准发力，身体就是你要不断调校的精密机器。" },
    { tagName: "钓鱼", matchProbability: 82, reason: "安静独处、观察水流天气，万事俱备后的那一竿最见功夫。" },
    { tagName: "骑行", matchProbability: 78, reason: "自己保养调校车辆、规划路线，人车合一的顺滑感只有骑过才懂。" },
    { tagName: "台球", matchProbability: 76, reason: "角度、力度、杆法的计算都藏在看似轻松的一击里，冷静者占优。" },
    { tagName: "皮具", matchProbability: 75, reason: "裁皮、打斩、缝线，工具与手艺的配合给你心流的确定性。" },
  ],
  ISFP: [
    { tagName: "油画", matchProbability: 90, reason: "色彩与笔触是最直接的情绪表达，不说话也能画出内心风景。" },
    { tagName: "水彩", matchProbability: 85, reason: "水色交融的偶然之美不可复制，正如你随性又敏锐的审美直觉。" },
    { tagName: "摄影", matchProbability: 82, reason: "你总能发现别人忽略的光影与角落，镜头是你观察世界的温柔方式。" },
    { tagName: "扎染", matchProbability: 80, reason: "晕染的花纹每件独一无二，不可预测的美恰好属于随性的你。" },
    { tagName: "陶艺", matchProbability: 78, reason: "泥土在指尖慢慢成形，专注手上的感觉就能让情绪自然流淌。" },
    { tagName: "瑜伽", matchProbability: 74, reason: "在呼吸与舒展中感受身体，温和地与自己相处。" },
  ],
  ESTP: [
    { tagName: "拳击", matchProbability: 90, reason: "实战对抗直接干脆，反应速度与临场决策就是你的主场。" },
    { tagName: "自由搏击", matchProbability: 85, reason: "高强度、快节奏，每一回合都肾上腺素拉满，压力瞬间清空。" },
    { tagName: "潜水", matchProbability: 82, reason: "探索未知的水下世界，感官体验直接而震撼，正是你要的'来真的'。" },
    { tagName: "飞盘", matchProbability: 80, reason: "上手即战、攻防转换飞快，奔跑与鱼跃救盘带来的爽感无可替代。" },
    { tagName: "台球", matchProbability: 78, reason: "一杆清台的成就感当场兑现，手感和心理博弈缺一不可。" },
    { tagName: "足球", matchProbability: 76, reason: "高速攻防中的瞬间判断与突破，是身体本能与胆识的较量。" },
  ],
  ESFP: [
    { tagName: "街舞", matchProbability: 90, reason: "聚光灯下自由律动，你的表现欲和感染力天生属于舞台。" },
    { tagName: "爵士舞", matchProbability: 85, reason: "韵律感与表现力兼备，每一段成品舞都是一次闪闪发光的亮相。" },
    { tagName: "尊巴", matchProbability: 82, reason: "把健身房变成派对现场，笑着流汗才是你喜欢的运动方式。" },
    { tagName: "拉丁舞", matchProbability: 80, reason: "热情的节奏与同伴的互动，让快乐加倍、氛围拉满。" },
    { tagName: "音乐剧", matchProbability: 78, reason: "唱跳演一体，能唱能跳又能演绎角色的你如鱼得水。" },
    { tagName: "Vlog", matchProbability: 76, reason: "把有趣的日常记录并分享出去，你的生活本身就是好素材。" },
  ],
}
