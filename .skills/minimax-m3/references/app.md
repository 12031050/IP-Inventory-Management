# App（Expo / React Native）前端调用

> 本文件只补 App 端。Edge Function 侧代码（`minimax-m3` 非流式、`minimax-m3-stream` SSE 透传）**完全不变**。改的只有前端：非流式走 `invoke`；流式**不能**抄 Web 段的 `import.meta.env` + `fetch().response.body.getReader()`——RN 全局 fetch 的 `response.body` 是 `undefined`（请求成功但零输出），必须用 `expo/fetch`。与 [minimax-chat] 同型。

两条路径。优先非流式（零装包）；要打字机效果再用流式。

## 路径一：非流式（推荐、零依赖）

```typescript
import { supabase } from "@/client/supabase";

export async function chat(messages: { role: string; content: unknown }[]) {
  const { data, error } = await supabase.functions.invoke("minimax-m3", {
    body: { model: "MiniMax-M3.1-Flash", thinking: { type: "adaptive" }, messages },
  });
  if (error) throw new Error(error.message);
  return data.choices?.[0]?.message?.content ?? "";
}
```

`@/client/supabase` 已用 `process.env.EXPO_PUBLIC_SUPABASE_URL` 建好，此路径不碰任何环境变量。多模态（图片/视频理解）同 Web：`content` 传文本 / `image_url` / `video_url` 内容块，字段与上游一致，App 端不用改。

## 路径二：流式（SSE 打字机效果）

不要抄 Web 段的 `import.meta.env.VITE_SUPABASE_URL` + `response.body.getReader()`——RN 全局 fetch 的 `response.body` 是 `undefined`。用 `expo/fetch`（polyfill 了 `getReader()`），SSE 解析用 `eventsource-parser`。

```bash
pnpm add eventsource-parser
```

```typescript
import { fetch } from "expo/fetch";
import { createParser } from "eventsource-parser";

export async function chatStream(
  messages: { role: string; content: unknown }[],
  onDelta: (t: string) => void,
  signal?: AbortSignal,
) {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/minimax-m3-stream`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "MiniMax-M3.1-Flash", thinking: { type: "adaptive" }, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`请求失败：${res.status}`);

  const parser = createParser({
    onEvent: (e) => {
      if (!e.data || e.data === "[DONE]") return;
      try {
        const delta = JSON.parse(e.data).choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch { /* 不完整分片跳过 */ }
    },
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf8");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
}
```

## 说明

- 非流式走 `supabase.functions.invoke`、不碰环境变量、最稳；流式因要自拼 URL 才用到 `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`（`expo-template/src/client/supabase.ts` 已在用，App 工程一定有）。
- SKILL.md 支持平台表写的是 Web / MiniProgram；App 端两条路径均可用，非流式无条件可用，流式需上面装包一步。
- markdown 渲染如需要，用 `react-native-marked`（`pnpm add react-native-marked`），不要用 Web 的 streamdown。
- 深度思考 `thinking.type` / `reasoning_split` 等参数是请求体字段，与端无关，App 照传即可。
