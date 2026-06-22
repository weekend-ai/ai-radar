# AI Intelligence Newsletter MVP 计划书

> 保存时间：2026-06-21
> 来源：用户提供

核心目标：先做一个自己高频使用的 AI 资讯选题雷达，同时具备未来开放订阅产品的基础。

## 1. 产品定位

本产品是一个面向 AI builder、AI infra engineer、agent system designer 和技术内容创作者的资讯雷达与 newsletter 生成工具。

它不是传统 RSS Reader，而是一个从多源资讯中提取高价值信号的系统。产品会定时抓取 AI 相关信息源，完成去重、聚类、摘要、打分、标签化和选题角度生成，帮助用户快速判断：

- 今天 AI 领域发生了什么；
- 哪些信息值得关注；
- 哪些只是重复报道或噪音；
- 哪些可以发展成 newsletter 选题；
- 某个事件对 AI 工程实践、agent 系统、模型生态或开发者工具有什么影响。

第一版优先服务内容创作者本人，也就是内部编辑工作流；之后再扩展成可订阅的 newsletter 产品。

---

## 2. MVP 目标

### 2.1 核心目标

MVP 要完成从“信息源抓取”到“可发布 newsletter 草稿”的闭环。

完整流程如下：

```text
RSS / Web Sources
    ↓
定时抓取
    ↓
文章入库
    ↓
去重
    ↓
LLM 摘要与结构化分析
    ↓
重要性打分
    ↓
Topic 聚类
    ↓
选题池
    ↓
Newsletter Draft
```

### 2.2 MVP 不做什么

第一版暂不做以下功能：

- 不做复杂多租户系统；
- 不做完整订阅付费系统；
- 不做移动 App；
- 不做复杂推荐算法；
- 不做实时 push notification；
- 不做社交互动；
- 不做浏览器插件；
- 不做自动发 newsletter，先人工 review。

---

## 3. 目标用户

### 3.1 第一阶段用户

第一阶段主要用户是产品创建者本人，角色是：

- AI newsletter 作者
- AI infra / agent system 内容创作者
- 技术趋势观察者

主要使用场景：

- 每天打开 dashboard 看最近 AI 动态；
- 快速筛掉重复新闻；
- 找出值得写的 topic；
- 自动生成 newsletter 草稿；
- 手动编辑后发布到 Substack、Beehiiv、公众号、个人博客或 LinkedIn。

### 3.2 未来目标用户

未来可扩展到：

- AI 工程师；
- AI 产品经理；
- AI infra team；
- 技术创业者；
- 企业内部 AI platform team；
- 需要追踪 AI 变化的投资或研究人员。

---

## 4. 内容方向

MVP 聚焦以下内容方向：

- AI Models
- AI Infrastructure
- Agent Systems
- Coding Agents
- Developer Tools
- Model Provider Updates
- AI Research with Engineering Relevance

不做泛 AI 新闻，不追求覆盖所有 AI 动态，而是强调：

- 少而准
- 有判断
- 有工程视角
- 有选题价值

---

## 5. 语言策略

产品支持双语，但不是简单在页面中同时展示中文和英文。

### 5.1 Language Control

产品需要有全局语言控制：

- Language: English / 中文

用户切换语言后，整个界面、摘要、标签、按钮、newsletter draft 都跟随切换。

### 5.2 数据存储策略

原始文章保留原语言。

AI 生成内容需要支持多语言版本：

```text
article_insights
- summary_en
- summary_zh
- why_it_matters_en
- why_it_matters_zh
- newsletter_angle_en
- newsletter_angle_zh
```

也可以第一版先按当前 workspace language 动态生成，后续再缓存多语言结果。

### 5.3 推荐 MVP 做法

第一版建议采用：

- 原文只存一份
- 结构化 insight 默认生成英文
- 中文界面下按需生成中文版本并缓存

原因是多数信息源是英文，英文摘要更贴近原文；中文适合你后续对外发布和个人内容创作。

---

## 6. 信息源范围

第一版使用已有 sources 配置，按优先级分层。

### 6.1 Tier 1：高信号官方源

- OpenAI Blog
- Anthropic News
- Google AI Blog
- Hugging Face Blog

用途：

- 模型发布；
- 官方研究；
- 产品更新；
- 平台战略变化。

这些来源应该拥有最高 source weight。

### 6.2 Tier 2：行业分析源

- MIT Technology Review AI
- TechCrunch AI
- The Verge AI
- AI News

用途：

- 行业传播；
- 创业公司动态；
- 消费级 AI 产品；
- 大众媒体视角。

### 6.3 Tier 3：社区和趋势源

- Reddit ClaudeCode
- FutureTools
- LLM Stats AI News
- LLM Stats LLM Updates
- Arcade Blog
- Steve Yegge Blog
- Anthropic Economic Future

用途：

- 早期趋势；
- 开发者社区反馈；
- coding agent 真实使用场景；
- 工具生态变化。

这些来源信号强但噪音大，需要更依赖 scoring 和人工筛选。

### 6.4 Tier 4：研究源

- arXiv cs.AI
- arXiv cs.LG

用途：

- 研究趋势；
- 新方法；
- agent、eval、inference、model serving 等工程相关论文。

arXiv 不应直接进入主信息流，而应进入单独的 Research Watch 页面或分类。

---

## 7. 核心功能

### 7.1 Source Management

用户可以管理信息源：

- 添加 source；
- 开启 / 关闭 source；
- 设置 refresh interval；
- 设置 priority；
- 设置 category；
- 查看 last fetched；
- 查看 last error；
- 查看 article count；
- 手动触发 fetch。

MVP 字段：

```text
id
name
url
type
category
enabled
priority
refresh_interval_minutes
last_fetched_at
last_success_at
last_error
created_at
updated_at
```

### 7.2 Scheduled Fetching

系统按照每个 source 的 refresh interval 定时抓取。

推荐抓取频率：

- High priority official sources: 60 min
- Medium priority blogs/media: 120 min
- Industry media: 120-180 min
- arXiv: 360-720 min
- Reddit/community: 60-120 min

Fetch 机制：

```text
Scheduler 每分钟扫描需要抓取的 source
创建 fetch job
Worker 执行抓取
Parser 解析内容
Dedup 入库
更新 source 状态
```

失败处理：

如果某个 source 抓取失败：

- 第一次失败：记录 error
- 连续失败：降低抓取频率
- 超过阈值：标记为 unhealthy

Backoff 逻辑：

```text
1h → 2h → 6h → 24h
```

### 7.3 Article Ingestion

每条抓到的信息统一转换成 article。

Article 字段：

```text
id
source_id
external_id
url
canonical_url
title
author
summary_raw
content_raw
published_at
fetched_at
language
status
hash_url
hash_title
hash_content
created_at
updated_at
```

状态：

- new
- processed
- clustered
- dismissed
- failed

### 7.4 Deduplication

AI 新闻高度重复，因此 MVP 必须做去重。

第一层：文章级去重

判断是否是同一篇文章：

- same canonical_url
- same guid
- same title hash
- same content hash

第二层：事件级聚类

判断是否是同一个新闻事件：

- OpenAI releases new model
- TechCrunch reports OpenAI new model
- The Verge covers OpenAI new model
- Reddit discusses OpenAI new model

这些应该归到同一个 topic。

MVP 可以先用：

- title + summary embedding similarity

后续再用 LLM 判断是否属于同一事件。

### 7.5 AI Enrichment

每篇新文章进入系统后，由 LLM 生成结构化 insight。

输出内容：

```text
one_sentence_summary
key_points
entities
event_type
predicted_category
predicted_tags
why_it_matters
engineering_relevance
possible_newsletter_angle
importance_score
novelty_score
engineering_relevance_score
audience_fit_score
confidence
```

示例：

```json
{
  "summary": "Anthropic released a new Claude Code feature for background task execution.",
  "entities": ["Anthropic", "Claude Code"],
  "event_type": "product_update",
  "topics": ["coding-agent", "developer-tools", "agent-runtime"],
  "importance_score": 8,
  "engineering_relevance_score": 9,
  "audience_fit_score": 9,
  "why_it_matters": "This suggests coding agents are moving from interactive assistants toward asynchronous engineering workers.",
  "possible_newsletter_angle": "Coding agents are no longer just autocomplete tools. They are becoming workflow systems."
}
```

### 7.6 Scoring

每篇 article 和 topic 都要有分数，避免 dashboard 变成信息垃圾场。

Article Score：

```text
article_score =
source_weight
+ recency_score
+ novelty_score
+ engineering_relevance_score
+ audience_fit_score
+ entity_importance_score
- duplicate_penalty
- low_quality_penalty
```

Source Weight 示例：

```text
OpenAI Blog: 30
Anthropic News: 30
Google AI Blog: 25
Hugging Face Blog: 20
MIT Technology Review: 15
TechCrunch AI: 15
The Verge AI: 15
Reddit ClaudeCode: 12
arXiv cs.AI/cs.LG: 5 base score
```

Topic Score：

Topic score 不只看单篇文章，而要看：

```text
topic_score =
max_article_score
+ number_of_sources_bonus
+ official_source_bonus
+ community_discussion_bonus
+ recency_score
+ editorial_relevance_score
```

### 7.7 Topic Clustering

产品的核心对象不是 article，而是 topic。

Topic 表：

```text
id
title
slug
summary
status
importance_score
novelty_score
audience_fit_score
first_seen_at
last_seen_at
article_count
primary_article_id
created_at
updated_at
```

Topic 状态：

- open
- selected
- drafted
- published
- dismissed

Topic Article Relation：

```text
topic_id
article_id
relation_type
```

relation_type 包括：

- primary
- supporting
- analysis
- discussion
- duplicate

### 7.8 Editorial Inbox

Inbox 是用户每天主要看的页面。

页面展示：

每条 article 或 topic 展示：

- Title
- Source
- Published time
- Score
- Summary
- Why it matters
- Tags
- Category
- Actions

操作：

- Save
- Dismiss
- Add to Topic
- Generate Angle
- Mark as Newsletter Candidate

### 7.9 Topic Radar

Topic Radar 是比 Inbox 更重要的页面。

它不是展示所有文章，而是展示系统聚合出的事件和选题。

分区：

- Top Signals
- Emerging Topics
- Model Provider Updates
- Agent / Coding Agent Watch
- Infra Watch
- Research Watch
- Community Signals

每个 topic 展示：

- Topic title
- One-line summary
- Why it matters
- Primary source
- Supporting sources
- Score
- Suggested newsletter angle
- Actions

### 7.10 Newsletter Draft Generator

用户选择若干 topics 后，系统生成 newsletter 草稿。

Newsletter 结构：

- Subject
- Opening Note
- Top Stories
- Infra / Agent Watch
- Research Worth Reading
- Quick Hits
- Closing Thought
- Sources

生成方式：

用户可以选择：

- Generate Daily Brief
- Generate Weekly Newsletter
- Generate Topic Deep Dive
- Generate LinkedIn Post
- Generate Blog Outline

MVP 优先支持：

- Weekly Newsletter Draft
- Topic Angle List

---

## 8. 页面设计

MVP 需要 5 个页面。

### 8.1 Dashboard

展示系统整体状态。

内容：

- New articles today
- New topics today
- Top 5 topics
- Sources with errors
- Drafts in progress

主要用途：

让用户快速知道系统是否正常，以及今天有没有值得看的内容。

### 8.2 Inbox

展示最新抓取的 article。

Filters：

- Time range
- Source
- Category
- Priority
- Score
- Language
- Status

Actions：

- Dismiss
- Save
- Open source
- Generate summary
- Add to topic

### 8.3 Topic Radar

展示聚类后的 topic。

Tabs：

- Top Signals
- Model Providers
- Agent Systems
- Infrastructure
- Research
- Community
- Dismissed

Actions：

- Select for newsletter
- Generate angle
- Merge topics
- Dismiss topic
- Open source articles

### 8.4 Newsletter Drafts

展示生成过的 newsletter draft。

功能：

- Create new issue
- Select topics
- Generate draft
- Edit markdown
- Copy markdown
- Export HTML
- Mark as published

第一版可以不直接发送邮件，而是提供：

- Copy Markdown
- Copy HTML
- Export

### 8.5 Sources

管理 sources。

展示字段：

- Name
- Category
- Priority
- Enabled
- Refresh interval
- Last fetched
- Last error
- Article count
- Health status

Actions：

- Enable / Disable
- Fetch now
- Edit source
- Delete source

---

## 9. 数据库设计

### 9.1 sources

```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  priority TEXT DEFAULT 'medium',
  description TEXT,
  tags JSONB DEFAULT '[]',
  refresh_interval_minutes INT DEFAULT 120,
  last_fetched_at TIMESTAMP,
  last_success_at TIMESTAMP,
  last_error TEXT,
  article_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 9.2 articles

```sql
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT REFERENCES sources(id),
  external_id TEXT,
  url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT NOT NULL,
  author TEXT,
  summary_raw TEXT,
  content_raw TEXT,
  published_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT NOW(),
  language TEXT,
  status TEXT DEFAULT 'new',
  hash_url TEXT,
  hash_title TEXT,
  hash_content TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 9.3 article_insights

```sql
CREATE TABLE article_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id),
  summary_en TEXT,
  summary_zh TEXT,
  key_points JSONB DEFAULT '[]',
  entities JSONB DEFAULT '[]',
  event_type TEXT,
  predicted_category TEXT,
  predicted_tags JSONB DEFAULT '[]',
  why_it_matters_en TEXT,
  why_it_matters_zh TEXT,
  newsletter_angle_en TEXT,
  newsletter_angle_zh TEXT,
  importance_score INT,
  novelty_score INT,
  engineering_relevance_score INT,
  audience_fit_score INT,
  final_score INT,
  confidence NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 9.4 topics

```sql
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en TEXT,
  title_zh TEXT,
  slug TEXT,
  summary_en TEXT,
  summary_zh TEXT,
  status TEXT DEFAULT 'open',
  importance_score INT,
  novelty_score INT,
  audience_fit_score INT,
  final_score INT,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  article_count INT DEFAULT 0,
  primary_article_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 9.5 topic_articles

```sql
CREATE TABLE topic_articles (
  topic_id UUID REFERENCES topics(id),
  article_id UUID REFERENCES articles(id),
  relation_type TEXT DEFAULT 'supporting',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (topic_id, article_id)
);
```

### 9.6 newsletter_issues

```sql
CREATE TABLE newsletter_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en TEXT,
  title_zh TEXT,
  subject_en TEXT,
  subject_zh TEXT,
  status TEXT DEFAULT 'draft',
  language TEXT DEFAULT 'en',
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  body_markdown TEXT,
  body_html TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP
);
```

### 9.7 newsletter_issue_items

```sql
CREATE TABLE newsletter_issue_items (
  issue_id UUID REFERENCES newsletter_issues(id),
  topic_id UUID REFERENCES topics(id),
  article_id UUID REFERENCES articles(id),
  section TEXT,
  order_index INT,
  editor_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (issue_id, topic_id, article_id)
);
```

### 9.8 fetch_jobs

```sql
CREATE TABLE fetch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT REFERENCES sources(id),
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  article_count INT DEFAULT 0,
  new_article_count INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 10. 技术架构

### 10.1 推荐 MVP 技术栈

- Frontend: Next.js
- Backend: Next.js API routes or separate Node.js API
- Database: Postgres
- ORM: Prisma or Drizzle
- Queue: BullMQ + Redis
- Worker: Node.js worker
- LLM: OpenAI / Azure OpenAI
- Embeddings: pgvector
- Email later: Resend / Postmark
- Deployment: Vercel + Railway/Fly.io/Render + Neon/Supabase

### 10.2 MVP 部署方式

推荐：

- Web App: Vercel
- Worker: Railway / Fly.io / Render
- Postgres: Neon / Supabase
- Redis: Upstash

如果你希望 portfolio 更完整，可以部署到：

- Docker Compose
- Postgres
- Redis
- Worker
- Web

这样更能展示系统设计能力。

---

## 11. Worker Pipeline

### 11.1 Fetch Pipeline

```text
scan_due_sources
    ↓
create_fetch_job
    ↓
fetch_source
    ↓
parse_feed
    ↓
normalize_articles
    ↓
deduplicate_articles
    ↓
store_new_articles
    ↓
enqueue_enrichment_jobs
```

### 11.2 Enrichment Pipeline

```text
new_article
    ↓
extract text
    ↓
generate insight
    ↓
generate embedding
    ↓
score article
    ↓
find related topic
    ↓
create or update topic
```

### 11.3 Newsletter Pipeline

```text
selected_topics
    ↓
generate outline
    ↓
generate issue draft
    ↓
human edit
    ↓
export markdown/html
    ↓
mark published
```

---

## 12. LLM Prompt 设计

### 12.1 Article Insight Prompt

输入：

- Article title
- Source name
- Published date
- Raw summary
- Raw content if available
- Target audience
- Language

输出：

```json
{
  "one_sentence_summary": "",
  "key_points": [],
  "entities": [],
  "event_type": "",
  "predicted_category": "",
  "predicted_tags": [],
  "why_it_matters": "",
  "engineering_relevance": "",
  "possible_newsletter_angle": "",
  "importance_score": 0,
  "novelty_score": 0,
  "engineering_relevance_score": 0,
  "audience_fit_score": 0,
  "confidence": 0.0
}
```

### 12.2 Scoring Rubric

Importance Score:

- 1-3: minor update
- 4-6: useful but narrow
- 7-8: important for AI builders
- 9-10: major industry/model/platform shift

Novelty Score:

- 1-3: repeated/common news
- 4-6: incremental update
- 7-8: new signal
- 9-10: genuinely new pattern or launch

Engineering Relevance:

- 1-3: mostly business/media
- 4-6: some developer relevance
- 7-8: affects AI product/system design
- 9-10: affects architecture, infra, agent design, evals, cost, reliability

Audience Fit:

- 1-3: too generic
- 4-6: relevant but not central
- 7-8: strong fit for AI builder audience
- 9-10: highly aligned with agent/infra/coding AI audience

---

## 13. Bilingual UX 设计

### 13.1 Global Language Switch

页面顶部提供：

- Language: English / 中文

影响：

- UI labels
- Article summaries
- Topic summaries
- Newsletter drafts
- Button text
- Filters
- System prompts

### 13.2 不采用双栏展示

不建议第一版做：

```text
English | 中文
```

因为会显得拥挤，也不符合“整个页面 language control”的要求。

### 13.3 推荐实现

```text
user_settings.language = 'en' | 'zh'
```

读取 insight 时：

```text
if language = zh:
  show summary_zh if exists
  else generate zh summary
else:
  show summary_en if exists
  else generate en summary
```

---

## 14. MVP 开发计划

### Week 1：基础抓取与入库

#### Day 1：项目初始化

任务：

- Initialize Next.js project
- Setup Postgres
- Setup Prisma/Drizzle
- Define schema
- Seed initial sources
- Build basic Sources page

交付：

- 可以看到 sources 列表
- 可以启用/禁用 source
- 可以查看 source metadata

#### Day 2：RSS Fetcher

任务：

- Implement RSS parser
- Fetch one source manually
- Normalize article
- Store articles
- Basic dedup by url/guid/title

交付：

- 点击 Fetch Now 可以抓取 OpenAI Blog
- 新文章进入 articles 表
- 重复文章不会重复入库

#### Day 3：Scheduler + Worker

任务：

- Setup Redis + BullMQ
- Implement fetch job queue
- Scan due sources
- Worker consumes jobs
- Update last_fetched and last_error

交付：

- 系统可以按照 refresh_interval 自动抓取
- Sources 页面显示 fetch 状态

#### Day 4：Inbox 页面

任务：

- Build Inbox page
- List articles
- Filters by source/category/status
- Sort by published_at/fetched_at
- Article detail drawer

交付：

- 用户可以浏览所有抓到的 articles
- 可以 dismiss/save article

#### Day 5：LLM Enrichment

任务：

- Design article insight prompt
- Call LLM
- Store article_insights
- Generate scores
- Show summary and why_it_matters in Inbox

交付：

- 每篇新文章可以自动生成摘要、标签和分数
- Inbox 从普通 RSS 列表升级为 AI digest

### Week 2：Topic Radar 与 Newsletter Draft

#### Day 6：Embedding + Topic Clustering

任务：

- Generate embeddings for articles
- Find similar existing topics
- Create/update topics
- Build topic_articles relation

交付：

- 相似新闻可以被聚合到同一个 topic

#### Day 7：Topic Radar 页面

任务：

- Build Topic Radar page
- Show topic score
- Show related articles
- Show suggested angle
- Actions: select/dismiss/merge

交付：

- 用户可以从 topic 角度浏览资讯，而不是只看文章流

#### Day 8：Newsletter Draft Generator

任务：

- Select topics
- Generate issue outline
- Generate markdown draft
- Store newsletter_issues
- Build draft editor page

交付：

- 用户可以选择几个 topics，一键生成 newsletter 草稿

#### Day 9：Bilingual Support

任务：

- Add global language switch
- Add i18n for UI
- Support zh/en insight display
- Generate newsletter in selected language

交付：

- 整个页面可以切换中文/英文
- newsletter draft 可按当前语言生成

#### Day 10：Polish + Demo

任务：

- Improve scoring display
- Add source health indicators
- Add manual fetch all
- Add copy markdown/html
- Add seed data
- Deploy MVP

交付：

- 可用的网页 MVP
- 可以定时抓取 sources
- 可以浏览 inbox
- 可以查看 topic radar
- 可以生成 bilingual newsletter draft

---

## 15. MVP 验收标准

MVP 完成的标准不是“功能很多”，而是以下闭环跑通：

### 15.1 信息源抓取

- 至少 10 个 source 可以正常抓取
- 失败 source 有错误提示
- 重复抓取不会重复入库

### 15.2 内容理解

- 新文章可以自动生成摘要
- 可以自动打标签
- 可以自动评分
- 可以解释 why it matters

### 15.3 Topic 聚类

- 相似事件可以聚合
- 每个 topic 有 summary 和 score
- 用户可以选择或 dismiss topic

### 15.4 Newsletter 草稿

- 用户可以选择 topics
- 系统可以生成一篇 newsletter draft
- draft 可以复制为 markdown
- 支持中文或英文生成

### 15.5 个人使用价值

每天打开页面 5-10 分钟，可以知道过去 24 小时最值得关注的 AI 动态。

每周可以从系统中生成一篇 newsletter 初稿。

---

## 16. 风险与应对

### 16.1 Source 不稳定

风险：

- 部分 URL 并不是真 RSS
- 部分 feed 失效
- 部分媒体限制访问

应对：

- 增加 source health status
- 支持 custom parser
- 先保证 Tier 1 source 稳定

### 16.2 内容噪音过大

风险：

- 抓到很多低价值 AI 新闻
- arXiv 论文过多
- 媒体重复报道

应对：

- 强 scoring
- topic 聚类
- source weight
- 人工 dismiss feedback

### 16.3 LLM 成本

风险：

- 每篇文章都完整 summarization 成本较高

应对：

- 只 enrich 新文章
- 先用 RSS summary
- 高分文章再抓全文
- 低分文章轻量处理
- 缓存 insight

### 16.4 Newsletter 质量过于 AI 味

风险：

- 生成内容像普通 AI 摘要，没有个人风格

应对：

- newsletter draft 只作为初稿
- 系统重点生成 angle 和 structure
- 最终由人编辑
- 加入个人 editorial style prompt

---

## 17. 后续版本路线图

### V1.1：更强编辑工作流

- Topic merge
- Manual notes
- Personal writing style memory
- Newsletter templates
- LinkedIn post generator
- Blog outline generator

### V1.2：订阅系统

- Subscriber management
- Email delivery
- Open/click tracking
- Preference center
- Weekly digest subscription

### V1.3：个性化 Topic

- User chooses topics
- Personalized digest
- Saved filters
- Custom source lists

### V1.4：Team / B2B

- Workspace
- Team sources
- Internal newsletter
- Slack delivery
- Company-specific AI radar

---

## 18. 推荐第一版交付物

MVP 最终应该交付：

1. 一个可登录的网页 app
2. Sources 管理页面
3. Inbox 页面
4. Topic Radar 页面
5. Newsletter Draft 页面
6. 定时抓取 worker
7. LLM enrichment pipeline
8. 中英文 language switch
9. Markdown export
10. 一套可演示的 seed sources

---

## 19. 第一版成功标准

如果第一版能做到下面这件事，就算成功：

你每天打开这个系统，不再需要手动刷 OpenAI、Anthropic、TechCrunch、Reddit、arXiv。

系统已经帮你把过去 24 小时的 AI 动态聚合成 5-10 个高价值 topics。

你每周只需要从这些 topics 中选 3-5 个，就能生成一篇有个人判断的 AI newsletter 草稿。

这就是 MVP 的核心价值。

建议下一步不要马上写完整代码，而是先做 Day 1-2 的最小闭环：

- sources seed
- fetch OpenAI / Anthropic RSS
- articles 入库
- Inbox 展示

只要这个跑通，后面的 LLM enrichment、topic radar、newsletter draft 都可以逐层加上去。
