job-copilot/
├── package.json          # 依赖: playwright, openai, zod, string-similarity, dotenv
├── tsconfig.json         # TS 配置
├── .env                  # OPENAI_API_KEY
├── profile.json          # 用户数据 (Source of Truth)
├── src/
│   ├── index.ts          # [Main Loop] 串联整个流程
│   ├── types.ts          # [Schema] 定义 Profile 和 AgentAction (Zod)
│   ├── config.ts         # 配置加载
│   │
│   ├── browser/          # [Browser Layer]
│   │   ├── distiller.ts  # [Phase 1] 注入脚本: 清洗 DOM + 注入 data-sme-id
│   │   ├── executor.ts   # [Phase 3] 执行器: smart_select, fill, autocomplete
│   │   └── verifier.ts   # [Phase 4] 观察者: check value, check aria-invalid
│   │
│   └── agent/            # [Agent Layer]
│       ├── planner.ts    # [Phase 2] 调用 OpenAI, 使用 Structured Outputs
│       └── prompts.ts    # System Prompts (含 CoT 指令)
│
└── tests/                # [Isolation Tests]
    ├── test_distiller.ts # 验证 HTML 提取质量
    └── test_planner.ts   # 验证 LLM JSON 生成格式