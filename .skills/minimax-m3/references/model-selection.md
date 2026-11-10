# Web与Task模型选择接入

默认MiniMax-M3.1-Flash，可选MiniMax-M3；保持原网关/API ID/鉴权及返回包装，不因本次改动换域名

## Web生成时的最小接入示例
```tsx
const [selectedModel, setSelectedModel] = useState("MiniMax-M3.1-Flash");
<select aria-label="选择模型" value={selectedModel}
  onChange={e => setSelectedModel(e.target.value)}>
  <option value="MiniMax-M3.1-Flash">MiniMax-M3.1-Flash（默认）</option>
  <option value="MiniMax-M3">MiniMax-M3</option>
</select>
// 非流式：保留原invoke方式，只将固定模型替换为选择值
await supabase.functions.invoke("minimax-m3", {
  body: { model: selectedModel, messages }
});
// 流式：保留原fetch地址和鉴权，JSON body同样传model:selectedModel
```
以上是嵌入已有组件的片段，不是独立应用；React的useState/import沿用项目。需要关闭思考的M3请求切回M3.1前应提示并恢复adaptive，不悄悄覆盖用户配置

## 服务端两种示例均需应用
在读取JSON后构造payload时使用以下校验；非流式与流式都应在发起上游请求前执行，不依赖前端限制
```typescript
const model = body.model ?? "MiniMax-M3.1-Flash";
if (!["MiniMax-M3.1-Flash", "MiniMax-M3"].includes(model)) {
  return new Response(JSON.stringify({error:"Unsupported model"}), {status:400});
}
if (model === "MiniMax-M3.1-Flash" &&
    (body.thinking?.type === "disabled" || body.reasoning_split === false || body.service_tier !== undefined)) {
  return new Response(JSON.stringify({error:"Incompatible MiniMax-M3.1-Flash parameters"}), {status:400});
}
// 在现有字段转发逻辑之后确保payload.model=model；禁止后续硬编码覆盖
```

## Task
调用前展示两个模型供选择；用户指定则不重复询问。确认后使用脚本--model传入选中的值；选择M3不改变技能名称或API ID。未明确选型时默认推荐M3.1，等待用户确认后再执行

## 验收边界
本次包内脚本做本地默认值、双模型传参、冲突拦截与模拟HTTP验证；不是实际Web部署。此前原生M3.1非流式文本已测通，但本包平台托管网关、Web/Task真实运行、流式及图片/视频须发布测试环境后回归
