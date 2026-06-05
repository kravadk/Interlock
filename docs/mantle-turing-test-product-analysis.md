# Mantle Turing Test Product Analysis

Дата аналізу: 2026-05-30

Цей документ критично оцінює поточний Interlock Control Plane під Mantle Turing Test Hackathon 2026. Мета - не захистити поточну ідею, а зрозуміти, як перетворити її з сильного dev demo на продукт, який виглядає як реальна інфраструктура для Mantle AI agents.

## 1. Короткий висновок

Поточний продукт уже не є простою заглушкою. У репозиторії є live Mantle Sepolia contracts, TypeScript SDK, CLI, MCP server, indexer API, Next.js dashboard, Benchmark Arena, Agent Safety Card, policy packs, docs і smoke gates. Це хороший фундамент для `AI DevTools`.

Але для перемоги цього ще недостатньо. Основна слабкість не технічна, а продуктова:

```text
поточний стан: agent tx preflight tool
сильний стан: agent safety + benchmark + reputation control plane for Mantle agents
```

Судді Mantle Turing Test будуть чекати не просто красивий dashboard, а agent-native продукт, який показує:

- агент реально пропонує on-chain дію;
- система перевіряє дію до виконання;
- risky action блокується з поясненням;
- safe action можна виконати або хоча б коректно дозволити;
- рішення й результат видимі on-chain;
- агент отримує benchmark/reputation evidence;
- дев може інтегрувати це через SDK, REST, MCP або CLI.

Найсильніший напрям:

```text
Interlock Control Plane for Mantle AI Agents:
preflight + policy + simulation + on-chain evidence + benchmark + MCP/SDK integration
```

Не треба міняти ідею повністю. Треба змінити демонстрацію: замість "ось форма, яка перевіряє tx" показати "ось AI agent runtime, який хоче зробити DeFi/RWA/wallet action на Mantle, а Interlock є його safety and benchmark layer".

## 2. Що вже є в поточному продукті

Фактичний стан repo:

- `README.md` уже позиціонує продукт як `Interlock Control Plane`.
- Є Mantle Sepolia deployment:
  - `AgentRegistry`: `0xa8d6f3478b683ee674ff5a9167e6838c589162b4`
  - `PolicyRegistry`: `0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0`
  - `ActionAttestation`: `0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3`
- Є public dashboard: [https://mantle-nine-beta.vercel.app](https://mantle-nine-beta.vercel.app)
- Є developer surfaces:
  - SDK;
  - REST preflight example;
  - CLI;
  - MCP server;
  - indexer API;
  - dashboard;
  - examples for raw Viem, backend automation, GOAT-style adapter, AgentKit-style adapter.
- Dashboard уже має:
  - Start Here;
  - Agent Profile;
  - Policy Editor;
  - Action Review;
  - Benchmark Arena;
  - Policy Checks;
  - Flight Recorder;
  - Developer Integration;
  - Mantle Ecosystem;
  - public `/agent/:id` Agent Safety Card.
- Є сильне правило: не показувати fake history, fake balances, fake transactions або fake protocol addresses.

Це можна залишати. Це вже ближче до developer product, ніж до одноразового демо.

## 3. Чому продукт все ще слабший за GitLawb-рівень

GitLawb сильний не тому, що він має більше фіч. Він сильний тому, що виглядає як повна система:

- public website;
- live network;
- node/daemon;
- CLI;
- MCP tools;
- contracts;
- releases;
- docs;
- network explorer;
- DID/capability identity story;
- зрозуміла категорія: decentralized GitHub for AI agents.

Interlock поки виглядає слабше, бо його core demo ще не доводить корисний агентний сценарій. Поточний dashboard показує багато правильних блоків, але judge може подумати:

```text
"Це transaction checker. А де сам AI agent? Де Mantle DeFi/RWA action? Де реальний benchmark outcome?"
```

Критичні прогалини:

1. **Немає hero agent flow**
   - Є preflight, але немає сильного сценарію "AI agent хотів виконати Mantle-native strategy".
   - Safe action часто виглядає як технічний contract read, а не як цінна агентна дія.

2. **Mantle ecosystem integration поки більше template/link-level**
   - Merchant Moe, Agni, Fluxion, Byreal/RealClaw, mETH, USDY, fBTC, MI4 згадані як напрямки.
   - Потрібен хоча б один конкретний policy pack або adapter flow з реальними адресами або чесним `test contract` сценарієм.

3. **Benchmark Arena ще не виглядає як незалежний benchmark**
   - Є scenario suite, але треба показати score як публічний результат агента.
   - В ідеалі: agent запускає кілька задач, Interlock оцінює, public card показує score.

4. **Reputation поки прості counters**
   - Це нормально для Dev Alpha, але треба чітко подати як "evidence counters", не як production trust score.
   - Roadmap має вести до ERC-8004-style validation/reputation.

5. **Hosted recorder/indexer не є повністю product-grade**
   - Якщо public dashboard працює без hosted indexer, треба або мати RPC fallback, або чесно показати обмеження.
   - Для суддів краще мати hosted read API, щоб Flight Recorder одразу показував live attestations.

6. **Submission polish ще неповний**
   - У `docs/submission-readiness.md` зазначено, що для DoraHacks deployment award потрібні Mantlescan verification, public GitHub URL і demo video.
   - Без короткого demo video продукт виглядатиме слабше, ніж є насправді.

## 4. Mantle ecosystem: що важливо для нас

За PRNewswire, Mantle Turing Test Hackathon 2026 має $120K prize pool і дві фази. Phase 1 `ClawHack` пов'язаний з RealClaw/Byreal і on-chain strategies across Mantle DeFi, включно з Merchant Moe, Agni Finance і Fluxion. Phase 2 `AI Awakening` має шість треків:

- `AI Trading & Strategy`
- `AI Alpha & Data`
- `AI x RWA`
- `Consumer & Viral DApps`
- `AI DevTools`
- `Agentic Wallets & Economy`

Три головні сигнали хакатону:

- on-chain benchmarking of AI agents;
- ERC-8004 identity/reputation;
- radical transparency of agent decisions.

Mantle позиціонується як distribution layer для on-chain finance, RWA і liquidity. У пресрелізі також згадані mETH, fBTC, MI4, Ethena USDe, Ondo USDY і Bybit/Mantle зв'язка.

Для Interlock це означає:

- просто задеплоїти contracts на Mantle Sepolia недостатньо;
- треба показати, що Mantle agent може діяти в DeFi/RWA/wallet context;
- Interlock має бути safety/evidence layer для цих дій;
- benchmark/reputation має виглядати не як декоративна метрика, а як запис історії рішень агента.

### Ніші, які ще слабко закриті

1. **Pre-execution safety for autonomous agents**
   - AgentKit/GOAT дають агентам wallet/actions.
   - Але потрібен standard preflight layer перед `sendTransaction`.

2. **Transparent benchmark evidence**
   - Хакатон прямо говорить про on-chain benchmarking.
   - Мало проектів покажуть не тільки результат, а й reason-by-reason audit trail.

3. **Track-specific policy packs**
   - DeFi agent, RWA yield agent, consumer spending agent і alpha bot мають різні ризики.
   - Interlock може дати готові policy templates для кожного треку.

4. **Agent reputation as evidence, not hype**
   - Не "AI trust score", а прості, перевірювані counters: allowed, blocked, failed simulations, benchmark pass rate.

5. **MCP/agent-native workflow**
   - Якщо судді мислять agentic AI, то MCP server і tool-call flow є сильнішим сигналом, ніж тільки web UI.

## 5. Fit по треках хакатону

### Primary: AI DevTools

Найкращий трек. Interlock - це tooling для девів, які будують AI agents на Mantle.

Що треба показати:

- SDK call before `sendTransaction`;
- MCP tool call from an agent;
- CLI `doctor`, `preflight`, `record`, `history`;
- dashboard як developer console;
- structured errors і snippets.

Що буде банально:

- "AI audit assistant" без real on-chain flow;
- просто transaction simulator;
- dashboard без integration story.

Що може виглядати сильно:

- control plane, який працює з AgentKit/GOAT/MCP;
- live preflight on Mantle Sepolia;
- public Agent Safety Card;
- Benchmark Arena як test suite for agents.

### Secondary: Agentic Wallets & Economy

Добрий другий трек, якщо подати Interlock як "spending constitution" для agent wallets.

Що треба показати:

- agent wallet/action provider proposes tx;
- policy дозволяє або блокує;
- wallet не просто підключений, а обмежений rules/capabilities;
- record on-chain.

Що не треба робити зараз:

- full wallet;
- ERC-4337 account;
- Safe/Rhinestone module як mandatory MVP;
- custody claims.

### Stretch: AI Trading & Strategy

Можна зачепити через DeFi Trading Guard.

Сильний сценарій:

```text
agent proposes rebalance/swap/deposit
-> Interlock checks router, selector, value, slippage, simulation
-> safe action allowed
-> high slippage / unknown target / overspend blocked
```

Ризик: якщо робити повноцінного trading bot, scope розвалиться.

### Stretch: AI Alpha & Data

Можна зачепити через anomaly-aware policy:

- Nansen/Elfa-style signal може бути metadata input;
- agent отримує alert;
- пропонує on-chain action;
- Interlock вимагає policy confirmation або блокує risky action.

Для MVP це краще лишити як adapter/example, не core.

### Stretch: AI x RWA

Можна зачепити через RWA Yield Guard:

- policy для mETH/USDY-like vaults;
- max exposure;
- slippage;
- approved target vaults;
- risk report hash.

Ризик: без реального RWA partner/demo це легко виглядає як template. Тому RWA має бути policy pack, не головний MVP.

## 6. Конкуренти і референси

| Референс | Що робить | Чому сильний | Що взяти | Як Interlock відрізняється |
| --- | --- | --- | --- | --- |
| GitLawb | Decentralized git network for AI agents with DID identity, MCP, CLI, live network | Виглядає як повний продукт, не демо | Live status, MCP, CLI, explorer, docs, releases | Interlock не замінює GitHub, а контролює on-chain дії агентів |
| Coinbase AgentKit | Toolkit for giving AI agents wallet and on-chain interactions | Швидкий onboarding, action providers, wallet/framework integrations | AgentKit wrapper before action execution | AgentKit gives agents hands; Interlock decides whether those hands may move funds |
| GOAT SDK | Agentic finance toolkit: payments, yield, trading, insights | Чіткий agentic finance фокус | GOAT guarded tool example | GOAT builds actions; Interlock guards actions |
| Sigil | AI agent wallet security with deterministic rules, simulation, risk scoring | Близький конкурент по safety narrative | Three-layer safety UX, policy guardrails, MCP | Sigil is wallet-first; Interlock is wallet/framework-neutral preflight control plane |
| AAWP | AI-only wallet protocol with on-chain identity | Дуже сильний invariant: only AI can own wallet | Identity/reputation story, wallet explorer pattern | AAWP answers who owns wallet; Interlock answers whether proposed tx is allowed |
| Safe/Rhinestone/ERC-7579 | Smart-account modules, guards, session keys, audited module infrastructure | Production-grade wallet path | Roadmap to hook/module compatibility | Interlock starts lighter via SDK/API/MCP, not full smart account migration |
| Tenderly | Simulation/debugging infrastructure | Simulation depth and developer trust | Deeper simulation reports as optional integration | Interlock wraps simulation into policy decision + on-chain attestation |
| Blockaid/Blowfish | Wallet transaction security | Clear user-facing risk explanations | Human-readable reason codes | Interlock is agent/developer-facing, not only wallet popup security |
| Sui AI Stack | Coordination, programmable control, Walrus, Seal, agent payments | Strong full-stack AI+chain product story | Action Bundle Review, evidence store, identity/reputation UX | Interlock brings these patterns to Mantle/EVM agent execution |

## 7. GitLawb: що саме треба аналізувати глибше

Якщо робити повний GitLawb-style teardown, найкорисніші репозиторії:

- [Gitlawb/node](https://github.com/Gitlawb/node) - live node/daemon, network/explorer patterns.
- [Gitlawb/contracts](https://github.com/Gitlawb/contracts) - identity/capability/on-chain parts.
- [Gitlawb/gl-npm](https://github.com/Gitlawb/gl-npm) - package/distribution flow.
- [Gitlawb/homebrew-tap](https://github.com/Gitlawb/homebrew-tap) - CLI release polish.
- [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude) - agent client/runtime UX.
- [Gitlawb/openclaude-skills](https://github.com/Gitlawb/openclaude-skills) - skill packaging for agents.
- [Gitlawb/agentvm](https://github.com/Gitlawb/agentvm) - agent runtime direction.
- [Gitlawb/releases](https://github.com/Gitlawb/releases) - release artifacts and public product maturity.

Що не треба копіювати:

- IPFS/libp2p as core;
- decentralized git narrative;
- token/staking;
- broad "network" claims без реальної мережі.

Що треба скопіювати як product pattern:

- root README як launch page для девів;
- install path;
- CLI doctor;
- live status;
- MCP tools;
- public explorer;
- releases;
- "why this is for agents" framing.

## 8. Sui patterns, які варто взяти без Sui integration

Sui не має бути нашим target chain. Але його AI/product patterns корисні:

1. **Programmable Transaction Blocks -> Action Bundle Review**
   - У Sui сильна ідея bundle transaction.
   - Для Interlock це має стати: agent proposes action bundle, firewall перевіряє весь bundle до execution.

2. **Dry-run / inspect-first**
   - Sui dev culture робить inspect/simulation нормальним кроком.
   - У нас Action Review має бути "Mantle dry-run for agents".

3. **Walrus/Seal -> Evidence Store**
   - Великі traces, prompts, simulation reports не треба писати повністю on-chain.
   - Треба зберігати JSON report off-chain, а on-chain писати hash.

4. **zkLogin / sponsored UX -> frictionless judge mode**
   - Не для прямої реалізації.
   - Патерн: користувач має швидко побачити цінність без важкого wallet setup.

5. **Object/capability model -> human-readable capabilities**
   - Policy не має виглядати як сухий allowlist.
   - Має виглядати так:

```text
can call approved router
can spend up to 0.05 MNT
can use only approved selectors
cannot approve unlimited spender
cannot interact with unknown target
```

## 9. Що треба змінити в продукті

### Залишити

- core loop: `action -> check -> decision -> evidence -> reputation`;
- Mantle Sepolia deployment;
- SDK/CLI/MCP/dashboard/indexer surfaces;
- Benchmark Arena;
- Agent Safety Card;
- no fake data rule;
- Dev Alpha disclaimers.

### Посилити

1. **Hero agent runtime**
   - Додати один очевидний "agent runner" сценарій:

```text
LLM/agent receives goal
-> proposes Mantle action
-> Interlock preflight
-> allow/block
-> optional send/record
-> public result
```

2. **Mantle DeFi/RWA action pack**
   - Один pack має виглядати реально, не як abstract config.
   - Якщо немає verified protocol testnet addresses, чесно зробити `Interlock Test Strategy Contracts` і назвати їх test contracts.

3. **Benchmark as product**
   - Benchmark Arena має створювати public summary:
     - safe passed;
     - risky blocked;
     - failed simulations;
     - score;
     - on-chain evidence links.

4. **Public recorder**
   - Hosted API або robust RPC fallback має забезпечити, щоб public dashboard показував реальні attestations.

5. **Integration-first demo**
   - У demo video показати не форму, а SDK/MCP/CLI integration:

```text
interlock_preflight tool call
-> decision JSON
-> dashboard pipeline
-> Mantlescan evidence
```

6. **Signed decision receipts**
   - Не обов'язково для MVP, але roadmap має бути чіткий:
     - EIP-712 decision;
     - expiry;
     - action hash;
     - replay protection.

### Прибрати або не пушити як core

- full wallet;
- trading bot with real capital;
- RWA document platform;
- tokenomics;
- multichain;
- ZK reputation;
- natural-language policy DSL;
- fake protocol addresses;
- generic "AI security" claims.

## 10. Два найкращі напрями розвитку

### Напрям 1: Mantle Agent Benchmark & Safety Control Plane

Це найсильніший напрям.

Суть:

Interlock стає стандартним safety/benchmark layer для Mantle AI agents. Будь-який agent framework може викликати SDK/REST/MCP перед виконанням tx. Рішення записується on-chain, а public Agent Safety Card показує performance evidence.

Чому це сильніше:

- напряму відповідає on-chain benchmarking narrative;
- добре лягає в `AI DevTools`;
- зачіпає `Agentic Wallets & Economy`;
- не потребує реального trading capital;
- можна красиво показати за 90 секунд;
- схоже на GitLawb maturity pattern: agent-native tools + public explorer + CLI + docs.

MVP demo:

```text
AI agent receives goal: "prepare safe Mantle strategy check"
-> proposes safe action
-> Interlock allows
-> proposes unknown target / overspend / high slippage
-> Interlock blocks
-> decisions recorded on Mantle
-> public /agent/:id card shows benchmark score
-> dev copies MCP/SDK snippet
```

Що треба доробити:

- agent runner має бути явно AI/agent-driven, а не тільки manual dashboard;
- Benchmark Arena має записувати/експортувати public result;
- docs мають пояснювати "how to benchmark your Mantle agent";
- README hero має вести до this flow first.

### Напрям 2: Mantle DeFi/RWA Agent Guard

Це другий сильний напрям, але більш ризиковий.

Суть:

Interlock додає policy packs і action review для Mantle DeFi/RWA actions: swap, deposit, rebalance, yield allocation, payment, RWA exposure. Агент може пропонувати стратегію, але Interlock перевіряє allowed targets, selectors, value, slippage, exposure і simulation.

Чому це цікаво:

- зачіпає `AI Trading & Strategy`;
- зачіпає `AI x RWA`;
- виглядає Mantle-native;
- краще показує реальну користь.

Ризики:

- треба реальні адреси/ABI/тестові liquidity flows;
- без цього pack виглядатиме як template;
- trading/RWA легко роздуває scope.

Як робити без фейку:

- для реальних протоколів використовувати тільки verified addresses і docs;
- якщо testnet протоколів немає, робити власні `TestStrategyVault` / `TestRouter` і прямо маркувати як test contracts;
- не писати "інтегровано з Merchant Moe", якщо реально немає їх адрес/ABI у flow.

## 11. План по фазах і кроках до сильного submission

Цей план має вести не до "ще одного dashboard demo", а до продукту, який можна показати як Mantle-native developer infrastructure. Кожна фаза закриває один продуктовий ризик:

```text
story unclear -> no agent flow -> benchmark looks decorative -> Mantle fit looks shallow -> public evidence weak -> submission not packaged
```

### Phase 0 - Зафіксувати поточний baseline

Ціль: зрозуміти, що вже працює, і не ламати сильний фундамент.

Кроки:

1. Зафіксувати current shape у README і docs:
   - `Interlock Control Plane`;
   - Mantle Sepolia Dev Alpha;
   - primary track: `AI DevTools`;
   - secondary track: `Agentic Wallets & Economy`;
   - no production security claims.
2. Переконатися, що core loop всюди описаний однаково:

```text
agent proposes action -> preflight checks -> allow/block -> on-chain attestation -> evidence -> benchmark/reputation
```

3. Перевірити, що dashboard, CLI, SDK, MCP, indexer і examples не обіцяють різні продукти.
4. Перевірити no-fake-data правило:
   - no fake balances;
   - no fake history;
   - no fake transactions;
   - no fake protocol addresses;
   - no hidden mock mode in public UI.

Файли/модулі:

- `README.md`
- `docs/product-logic.md`
- `docs/submission-readiness.md`
- `docs/dashboard-behavior.md`
- `apps/web/src/app/page.tsx`

Acceptance:

- `pnpm check`, `pnpm test`, `pnpm smoke:all` проходять;
- суддя з першого екрану розуміє, що Interlock не є wallet, trading bot або RWA platform;
- усі claims у README підтверджені кодом, dashboard або Mantle Sepolia deployment.

### Phase 1 - Product story freeze

Ціль: одна сильна історія для суддів і девів.

Фінальна формула:

```text
Interlock is the safety and benchmark control plane that Mantle AI agents call before moving funds.
```

Кроки:

1. Переписати hero narrative навколо одного сценарію:
   - AI agent отримує goal;
   - agent proposes Mantle transaction;
   - Interlock симулює і перевіряє policy;
   - safe action проходить;
   - risky action блокується;
   - decision записується on-chain;
   - `/agent/:id` показує evidence.
2. У README first screen показати не список фіч, а flow:

```text
agent goal -> proposed tx -> preflight -> allow/block -> attestation -> benchmark -> safety card
```

3. У `docs/pitch.md` і `docs/demo-video-script.md` зробити 90-секундний pitch:
   - 10 секунд: проблема;
   - 20 секунд: safe action;
   - 20 секунд: risky action;
   - 20 секунд: on-chain evidence;
   - 20 секунд: SDK/MCP/CLI integration.
4. Прибрати з core story все, що розмиває фокус:
   - full wallet;
   - real trading capital;
   - RWA issuer/KYC/document flow;
   - tokenomics;
   - multichain.

Файли/модулі:

- `README.md`
- `docs/pitch.md`
- `docs/demo-video-script.md`
- `docs/demo-runbook.md`
- `docs/submission-package.md`

Acceptance:

- перші 30 секунд demo відповідають на питання "що це і для кого";
- весь pitch веде до `action -> check -> evidence -> score`;
- у README є чітке порівняння:

```text
AgentKit/GOAT give agents tools.
Interlock decides whether the proposed action is allowed.
```

### Phase 2 - Agent runtime як головний proof

Ціль: довести, що продукт agent-native, а не manual transaction form.

Кроки:

1. Посилити `apps/agent-demo` як hero runtime:
   - agent receives goal;
   - agent creates safe proposed action;
   - agent creates unknown-target attack;
   - agent creates overspend/high-slippage action;
   - Interlock SDK checks each action;
   - runner prints JSON report and human summary.
2. Додати режим read-only і write:
   - read-only: `pnpm agent:benchmark`;
   - write: `RECORD_DECISIONS=true PRIVATE_KEY=0x... pnpm agent:benchmark`.
3. Додати результат, який можна вставити в demo/video:
   - agent id;
   - policy id;
   - scenario name;
   - expected decision;
   - actual decision;
   - reason code;
   - score;
   - dashboard URL;
   - safety card URL;
   - Mantlescan tx links, якщо записано on-chain.
4. Додати CLI equivalent:

```bash
pnpm cli -- benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id>
pnpm cli -- benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id> --record --private-key 0x...
```

Файли/модулі:

- `apps/agent-demo/src/index.ts`
- `packages/sdk/src/benchmark.ts`
- `packages/cli/src/index.ts`
- `docs/benchmark-arena.md`
- `docs/examples.md`

Acceptance:

- `pnpm agent:benchmark` працює без wallet і показує реальний Mantle Sepolia preflight;
- output не містить fake transactions;
- результат можна прочитати як доказ: що agent хотів зробити, що firewall вирішив, чому.

### Phase 3 - Benchmark Arena як продукт, не декор

Ціль: зробити benchmark основною judge-facing фічею.

Кроки:

1. У dashboard зробити Benchmark Arena центральним сценарієм:
   - safe action;
   - unknown target;
   - overspend;
   - high slippage;
   - unapproved approve selector;
   - selector-only calldata simulation failure;
   - empty calldata selector check.
2. Для кожного scenario показувати:
   - intent;
   - proposed tx;
   - expected decision;
   - actual decision;
   - reason code;
   - pass/fail;
   - explanation;
   - optional attestation link.
3. Додати "Copy benchmark evidence":
   - JSON summary;
   - markdown summary;
   - short judge summary.
4. `/agent/:id` має показувати:
   - allowed/blocked/failed counters;
   - last decisions;
   - benchmark score;
   - latest evidence links;
   - disclaimer: `Dev Alpha evidence, not audited production reputation`.
5. Якщо indexer недоступний, dashboard має чесно:
   - показати RPC fallback;
   - або пояснити, що Flight Recorder потребує hosted/local indexer;
   - не показувати synthetic rows.

Файли/модулі:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/agent/[id]/page.tsx`
- `packages/indexer/src/server.ts`
- `packages/indexer/src/api-model.ts`
- `docs/dashboard-behavior.md`
- `docs/benchmark-arena.md`

Acceptance:

- judge за 60-90 секунд бачить score і причини allow/block;
- benchmark score базується тільки на real preflight decisions;
- public Agent Safety Card виглядає як evidence report, не як decorative stats card.

### Phase 4 - Mantle-specific policy/action pack

Ціль: показати, що це не просто EVM tool, а Mantle product.

Кроки:

1. Вибрати один головний Mantle-specific сценарій для demo:
   - DeFi Trading Guard;
   - RWA Yield Guard;
   - Byreal/RealClaw-style skill adapter;
   - Agent Wallet Spending Constitution.
2. Перевірити, чи є реальні testnet/mainnet адреси й ABI для потрібного протоколу.
3. Якщо реальні адреси підтверджені:
   - додати pack з verified addresses;
   - додати ABI/calldata helper;
   - додати docs link на джерело адреси;
   - не називати pack "ready", якщо потрібна ручна конфігурація.
4. Якщо реальних адрес немає:
   - зробити чесний test-contract flow;
   - назвати його `Interlock Mantle Sepolia Test Strategy Contracts`;
   - прямо написати, що це test contract, який моделює Merchant Moe/Agni/Fluxion-style action;
   - не писати "integrated with Merchant Moe/Agni/Fluxion", якщо це не правда.
5. У dashboard policy pack picker має показувати:
   - track fit;
   - ecosystem fit;
   - required addresses;
   - supported selectors;
   - risk notes;
   - copy JSON template.
6. У SDK/CLI додати registry validation:
   - no fake addresses;
   - content hash;
   - trust tier;
   - aliases;
   - deprecated marker, якщо pack старий.

Файли/модулі:

- `packages/sdk/src/ecosystem-packs.ts`
- `packages/sdk/src/policy-pack-registry.ts`
- `packages/cli/src/index.ts`
- `packages/contracts/contracts/*` якщо потрібні test contracts
- `docs/mantle-ecosystem-packs.md`

Acceptance:

- є хоча б один Mantle-specific pack, який можна пояснити без сорому;
- якщо це template, UI явно пише `requires real protocol addresses`;
- якщо це test contract, UI явно пише `Mantle Sepolia test contract`;
- немає fake protocol addresses.

### Phase 5 - Recorder Service і public evidence

Ціль: public dashboard має одразу показувати реальні докази, а не виглядати порожнім.

Кроки:

1. Перетворити indexer на Recorder Service у product narrative:
   - `/health`;
   - `/status`;
   - `/network`;
   - `/agents/:id`;
   - `/agents/:id/actions`;
   - `/benchmark/:agentId`.
2. Hosted або local API має показувати:
   - RPC status;
   - configured contracts;
   - latest indexed block;
   - latest action;
   - sync status;
   - storage mode.
3. Dashboard має відображати:
   - Recorder live/unavailable;
   - latest tx;
   - manual sync CTA;
   - Mantlescan fallback link.
4. Якщо hosted indexer немає:
   - RPC fallback має читати real events;
   - empty state має бути чесним;
   - не показувати fake history.
5. Додати operator docs:
   - як запустити recorder локально;
   - як захостити;
   - які env потрібні;
   - як перевірити `/status`.

Файли/модулі:

- `packages/indexer/src/server.ts`
- `packages/indexer/src/store.ts`
- `apps/web/src/lib/indexer.ts`
- `apps/web/src/lib/rpc-history.ts`
- `docs/indexer.md`
- `packages/indexer/README.md`
- `.env.example`

Acceptance:

- public dashboard або показує real records, або чесно пояснює чому records недоступні;
- `/status` можна показати судді як live runtime health;
- `Flight Recorder` ніколи не рендерить fake rows.

### Phase 6 - MCP/CLI developer workflow

Ціль: зробити продукт реально корисним для девів, які будують агентів.

Кроки:

1. CLI має покривати повний path:

```bash
interlock init
interlock doctor
interlock whoami
interlock quickstart
interlock benchmark run
interlock policy-pack-registry
interlock history
```

2. `doctor` має давати fix-oriented output:
   - wrong chain;
   - missing RPC;
   - missing contract address;
   - missing private key for write commands;
   - indexer unavailable;
   - no contract code at address.
3. MCP server має дати agent-native tools:
   - `interlock_get_status`;
   - `interlock_run_benchmark`;
   - `interlock_get_safety_card`;
   - `interlock_explain_decision`;
   - `interlock_create_policy_pack`;
   - `interlock_validate_policy_pack`.
4. Docs мають показати 3 integration paths:
   - dashboard path;
   - CLI/MCP path;
   - SDK/REST path.
5. Додати "common developer mistakes":
   - selector-only calldata;
   - wrong chain;
   - stale policy id;
   - recording before send;
   - assuming attestation proves execution;
   - allowlisting `approve` without spender-level review.

Файли/модулі:

- `packages/cli/src/index.ts`
- `packages/cli/src/doctor.ts`
- `packages/mcp/src/index.ts`
- `docs/cli.md`
- `docs/mcp.md`
- `docs/integration-guide.md`
- `docs/headless-setup.md`

Acceptance:

- дев може інтегрувати read-only path за 10 хвилин;
- CLI/MCP не виглядають як afterthought;
- errors пояснюють, що сталося і що робити далі.

### Phase 7 - Security, validation і adversarial hardening

Ціль: не допустити очевидних багів у safety product.

Кроки:

1. SDK validation layer має ловити:
   - invalid address;
   - invalid calldata;
   - odd-length calldata;
   - negative value;
   - invalid slippage bps;
   - empty agent/policy id;
   - wrong chain;
   - missing contracts.
2. Contracts мають reject:
   - `maxSlippageBps > 10000`;
   - invalid decision/reason pair;
   - `ALLOW + SIMULATION_FAILED`;
   - empty target;
   - unauthorized policy updates.
3. Dashboard має:
   - disable invalid actions;
   - show reason near the button;
   - never send invalid preflight to RPC;
   - map wallet rejected / insufficient funds / revert / RPC failure to actionable messages.
4. Adversarial tests:
   - `0x0` calldata;
   - `0x123` calldata;
   - `--value -1`;
   - slippage `-1`;
   - slippage `20000`;
   - invalid policy id;
   - stale action after input change.
5. Static analysis:
   - `pnpm security:slither`;
   - document expected warnings;
   - no mainnet claims before audit.

Файли/модулі:

- `packages/sdk/src/validation.ts`
- `packages/sdk/src/calldata.ts`
- `packages/contracts/contracts/*`
- `scripts/adversarial-smoke.mjs`
- `scripts/slither-check.mjs`
- `docs/threat-model.md`
- `SECURITY.md`

Acceptance:

- `pnpm security:adversarial` проходить;
- `pnpm security:slither` проходить або має documented manual setup;
- UI не дозволяє очевидно невалідний preflight;
- contracts не приймають нелогічні attestations.

### Phase 8 - Release і submission polish

Ціль: продукт виглядає як готовий Dev Alpha launch, а не локальний хакатонний repo.

Кроки:

1. Підготувати release artifacts:

```bash
pnpm release:pack
pnpm release:draft
```

2. Перевірити package distribution:

```bash
pnpm smoke:packages
pnpm smoke:pack
pnpm smoke:consumer
```

3. Перевірити dashboard:

```bash
pnpm web:smoke
pnpm browser:qa
pnpm screenshots:capture
```

4. Перевірити final gates:

```bash
pnpm check
pnpm test
pnpm smoke:all
pnpm security:adversarial
pnpm security:slither
pnpm docs:links
```

5. Submission assets:
   - public GitHub URL;
   - public Vercel dashboard;
   - demo video under 3 minutes;
   - screenshots;
   - deployment manifest;
   - Mantlescan links;
   - README quickstart;
   - final submission text.
6. Mantlescan:
   - verify `AgentRegistry`;
   - verify `PolicyRegistry`;
   - verify `ActionAttestation`;
   - add links to README/submission docs.

Файли/модулі:

- `scripts/release-pack.mjs`
- `scripts/release-draft.mjs`
- `docs/submission-package.md`
- `docs/submission-readiness.md`
- `docs/dorahacks-requirements-audit.md`
- `deployments/mantle-sepolia/*`
- `docs/screenshots/*`

Acceptance:

- `pnpm submission:doctor:final` проходить після додавання public GitHub/dashboard/video links;
- release artifacts мають checksums;
- demo video показує agent runtime, benchmark, on-chain evidence і integration snippet;
- усі claims у submission можна перевірити.

### Phase 9 - Що лишити після хакатону

Ціль: мати roadmap без роздування MVP.

Roadmap only:

- signed EIP-712 decision receipts;
- ERC-8004 validation/reputation registry;
- ERC-7579/Safe/Rhinestone module;
- off-chain Evidence Store for full prompt/simulation traces;
- Action Bundle Review;
- hosted Recorder Service with Postgres;
- protocol-specific policy packs with verified Mantle partners;
- mainnet only after audit.

Не додавати до MVP:

- full wallet;
- real trading bot with capital;
- RWA document/KYC platform;
- tokenomics;
- staking;
- ZK reputation;
- multichain;
- fake integrations.

Final acceptance для всього плану:

- Interlock можна описати однією фразою;
- є live Mantle Sepolia flow;
- є agent runner, не тільки dashboard;
- benchmark дає public evidence;
- developer може інтегрувати через SDK/CLI/MCP/REST;
- dashboard не показує fake data;
- submission assets готові;
- продукт виглядає як Dev Alpha infrastructure, а не як форма для перевірки транзакції.

## 12. Потрібні інтеграції

### Must-have

- Mantle Sepolia RPC and Mantlescan.
- Interlock contracts on Mantle Sepolia.
- SDK + Viem.
- MCP server.
- CLI.
- Dashboard with public Agent Safety Card.
- Benchmark Arena.
- Hosted or fallback real event recorder.

### Strong additions

- AgentKit wrapper:
  - action provider proposes tx;
  - Interlock preflights;
  - allowed tx can continue.
- GOAT guarded tool:
  - GOAT builds financial action;
  - Interlock checks before execution.
- Byreal/RealClaw-style adapter:
  - not full integration unless APIs are available;
  - show `RealClaw skill proposes action -> Interlock preflight`.
- Mantle DeFi policy packs:
  - Merchant Moe-style router pack;
  - Agni-style DEX pack;
  - Fluxion-style strategy pack.
- RWA policy packs:
  - mETH/USDY-like vault exposure rules;
  - max value;
  - max slippage;
  - approved vaults only.

### Roadmap only

- ERC-8004 registry integration.
- ERC-7579/Safe module.
- signed EIP-712 decision receipts.
- off-chain Evidence Store for full simulation/prompt traces.
- ZK reputation.
- mainnet launch.

## 13. Final recommendation

Не варто переходити на іншу ідею. Але не можна подавати поточний продукт як просто `firewall demo`.

Правильна стратегія:

```text
Interlock Control Plane = safety + benchmark + evidence layer for Mantle AI agents
```

Фокус submission:

1. **AI DevTools** як primary track.
2. **Agentic Wallets & Economy** як secondary track.
3. DeFi/RWA/Alpha як policy-pack extensions, не як core.

Найважливіше доробити:

- real agent runner;
- benchmark result as public evidence;
- hosted recorder or reliable RPC event fallback;
- one Mantle-specific policy/action pack;
- Mantlescan verification;
- final demo video.

У фінальному демо не треба показувати все. Треба показати одну сильну історію:

```text
AI agent wants to act on Mantle.
Interlock checks the action before funds move.
Safe action passes.
Risky action is blocked.
Every decision is recorded on Mantle.
Agent gets a public safety/benchmark card.
Developer can integrate the same flow via SDK, REST, MCP, or CLI.
```

Це вже виглядатиме не як форма для транзакцій, а як developer infrastructure для нової категорії Mantle AI agents.

## 14. Корисні посилання

### Mantle і хакатон

- [DoraHacks Mantle Turing Test Hackathon 2026](https://dorahacks.io/hackathon/mantleturingtesthackathon2026/detail) - основна сторінка, може блокуватись human verification/WAF.
- [PRNewswire: Mantle Turing Test Hackathon 2026](https://www.prnewswire.com/news-releases/mantle-unites-global-ai-tech-and-youth-communities-for-its-largest-ai-hackathon-backed-by-tencent-cloud-bybit-byreal-and-blockchain-for-good-alliance-302750420.html)
- [Mantle docs](https://docs.mantle.xyz/)
- [Mantle Sepolia explorer](https://sepolia.mantlescan.xyz/)
- [Mantle Sepolia faucet](https://faucet.sepolia.mantle.xyz/)
- [Byreal](https://www.byreal.io/)
- [Merchant Moe](https://merchantmoe.com/)
- [Agni Finance](https://www.agni.finance/)

### AI agents і agent wallets

- [Coinbase AgentKit](https://github.com/coinbase/agentkit)
- [GOAT SDK](https://github.com/goat-sdk/goat)
- [Sigil Protocol](https://sigil.codes/)
- [AAWP](https://aawp.ai/)

### Smart-account / guard references

- [Safe ERC-7579](https://docs.safe.global/advanced/erc-7579/7579-safe)
- [Rhinestone docs](https://docs.rhinestone.dev/)

### GitLawb

- [GitLawb site](https://gitlawb.com/)
- [GitLawb GitHub](https://github.com/Gitlawb)
- [GitLawb repositories](https://github.com/orgs/Gitlawb/repositories)
- [Gitlawb/node](https://github.com/Gitlawb/node)
- [Gitlawb/contracts](https://github.com/Gitlawb/contracts)
- [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude)

### Sui patterns

- [Sui AI Stack](https://www.sui.io/ai)
- [Sui zkLogin](https://www.sui.io/zklogin)
- [Walrus docs](https://docs.wal.app/docs/system-overview/core-concepts)
- [Seal docs](https://seal-docs.wal.app/)
