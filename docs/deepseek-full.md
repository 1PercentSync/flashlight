# DeepSeek Docs

有疑问的地方咨询用户,不要自己猜

# **模型 & 价格**

下表所列模型价格以“百万 tokens”为单位。Token 是模型用来表示自然语言文本的的最小单位，可以是一个词、一个数字或一个标点符号等。我们将根据模型输入和输出的总 token 数进行计量计费。

---

# **模型细节**

**模型deepseek-v4-flash(1)deepseek-v4-proBASE URL (OpenAI 格式)[https://api.deepseek.com](https://api.deepseek.com/)BASE URL (Anthropic 格式)[https://api.deepseek.com/anthropic](https://api.deepseek.com/anthropic)模型版本DeepSeek-V4-FlashDeepSeek-V4-Pro思考模式支持非思考与思考模式（默认）切换方式详见[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)上下文长度1M输出长度最大 384K功能[Json Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode)支持支持[Tool Calls](https://api-docs.deepseek.com/zh-cn/guides/tool_calls)支持支持[对话前缀续写（Beta）](https://api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion)支持支持[FIM 补全（Beta）](https://api-docs.deepseek.com/zh-cn/guides/fim_completion)仅非思考模式支持仅非思考模式支持价格百万tokens输入（缓存命中）(2)0.02元0.025元（2.5折(3)）~~0.1元~~百万tokens输入（缓存未命中）1元3元（2.5折(3)）~~12元~~百万tokens输出2元6元（2.5折(3)）~~24元~~**

(1) deepseek-chat 与 deepseek-reasoner 两个模型名将于日后弃用。出于兼容考虑，二者分别对应 deepseek-v4-flash 的非思考与思考模式。

(2) 全系列模型，输入缓存命中的价格已降至首发价格的 1/10，该价格调整自北京时间 2026/4/26 20:15 起生效

(3) **当前 deepseek-v4-pro 模型 2.5 折，优惠期延长至北京时间 2026/05/31 23:59。**

---

# **扣费规则**

扣减费用 = token 消耗量 × 模型单价，对应的费用将直接从充值余额或赠送余额中进行扣减。 当充值余额与赠送余额同时存在时，优先扣减赠送余额。

产品价格可能发生变动，DeepSeek 保留修改价格的权利。请您依据实际用量按需充值，定期查看此页面以获知最新价格信息。

---

# **错误码**

您在调用 DeepSeek API 时，可能会遇到以下错误。这里列出了相关错误的原因及其解决方法。

| **错误码** | **描述** |
| --- | --- |
| 400 - 格式错误 | **原因**：请求体格式错误**解决方法**：请根据错误信息提示修改请求体 |
| 401 - 认证失败 | **原因**：API key 错误，认证失败**解决方法**：请检查您的 API key 是否正确，如没有 API key，请先 [创建 API key](https://platform.deepseek.com/api_keys) |
| 402 - 余额不足 | **原因**：账号余额不足**解决方法**：请确认账户余额，并前往 [充值](https://platform.deepseek.com//top_up) 页面进行充值 |
| 422 - 参数错误 | **原因**：请求体参数错误**解决方法**：请根据错误信息提示修改相关参数 |
| 429 - 请求速率达到上限 | **原因**：请求速率（TPM 或 RPM）达到上限**解决方法**：请合理规划您的请求速率。 |
| 500 - 服务器故障 | **原因**：服务器内部故障**解决方法**：请等待后重试。若问题一直存在，请联系我们解决 |
| 503 - 服务器繁忙 | **原因**：服务器负载过高**解决方法**：请稍后重试您的请求 |

---

# **思考模式**

DeepSeek 模型支持思考模式：在输出最终回答之前，模型会先输出一段思维链内容，以提升最终答案的准确性。

# **思考模式开关与思考强度控制**

**控制参数（OpenAI 格式）控制参数（Anthropic 格式）思考模式开关(1)`{"thinking": {"type": "enabled/disabled"}}`思考强度控制(2)(3)`{"reasoning_effort": "high/max"}{"output_config": {"effort": "high/max"}}`**

(1) 默认思考开关为 `enabled`

(2) 思考模式下，对普通请求，默认 effort 为 high；对一些复杂 Agent 类请求（如 Claude Code、OpenCode），effort 自动设置为 `max`

(3) 思考模式下，出于兼容考虑 `low`、`medium` 会映射为 `high`, `xhigh` 会映射为 `max`

您在使用 OpenAI SDK 设置 `thinking` 参数时，需要将 `thinking` 参数传入 `extra_body` 中：

```python
response= client.chat.completions.create(  model="deepseek-v4-pro",# ...  reasoning_effort="high",  extra_body={"thinking":{"type":"enabled"}})
```

# **输入输出参数**

思考模式不支持 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 参数。请注意，为了兼容已有软件，设置参数不会报错，但也不会生效。

在思考模式下，思维链内容通过 `reasoning_content` 参数返回，与 `content` 同级。在后续的轮次的拼接中，可以选择性地返回 `reasoning_content` 给 API：

- 在两个 `user` 消息之间，如果模型**未进行工具调用**，则中间 `assistant` 的 `reasoning_content` 无需参与上下文拼接，在后续轮次中将其传入 API 会被忽略。详见[多轮对话拼接](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode#%E5%A4%9A%E8%BD%AE%E5%AF%B9%E8%AF%9D%E6%8B%BC%E6%8E%A5)。
- 在两个 `user` 消息之间，如果模型**进行了工具调用**，则中间 `assistant` 的 `reasoning_content` 需参与上下文拼接，在后续所有 user 交互轮次中必须**回传给 API**。详见[工具调用](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode#%E5%B7%A5%E5%85%B7%E8%B0%83%E7%94%A8)。

# **多轮对话拼接**

在每一轮对话过程中，模型会输出思维链内容（`reasoning_content`）和最终回答（`content`）。如果没有工具调用，则在下一轮对话中，之前轮输出的思维链内容不会被拼接到上下文中，如下图所示：

![](https://api-docs.deepseek.com/zh-cn/img/deepseek_r1_multiround_example_cn.jpeg)

### **样例代码**

下面的代码以 Python 语言为例，展示了如何访问思维链和最终回答，以及如何在多轮对话中进行上下文拼接。

**非流式流式**

- 非流式
- 流式

```python
from openaiimport OpenAIclient= OpenAI(api_key="<DeepSeek API Key>", base_url="https://api.deepseek.com")# Turn 1messages=[{"role":"user","content":"9.11 and 9.8, which is greater?"}]response= client.chat.completions.create(    model="deepseek-reasoner",    messages=messages,    stream=True,    reasoning_effort="high"    extra_body={"thinking":{"type":"enabled"}},)reasoning_content=""content=""for chunkin response:if chunk.choices[0].delta.reasoning_content:        reasoning_content+= chunk.choices[0].delta.reasoning_contentelse:        content+= chunk.choices[0].delta.content# Turn 2# The reasoning_content will be ignored by the APImessages.append({"role":"assistant","reasoning_content": reasoning_content,"content": content})messages.append({'role':'user','content':"How many Rs are there in the word 'strawberry'?"})response= client.chat.completions.create(    model="deepseek-reasoner",    messages=messages,    stream=True,    reasoning_effort="high"    extra_body={"thinking":{"type":"enabled"}},)# ...
```

# **工具调用**

DeepSeek 模型的思考模式支持工具调用功能。模型在输出最终答案之前，可以进行多轮的思考与工具调用，以提升答案的质量。其调用模式如下图所示：

![](https://api-docs.deepseek.com/zh-cn/img/thinking_with_tools.jpg)

请注意，区别于思考模式下的未进行工具调用的轮次，进行了工具调用的轮次，在后续所有请求中，必须完整回传 `reasoning_content` 给 API。

若您的代码中未正确回传 `reasoning_content`，API 会返回 400 报错。正确回传方法请您参考下面的样例代码。

### **样例代码**

下面是一个简单的在思考模式下进行工具调用的样例代码：

```python
import osimport jsonfrom openaiimport OpenAIfrom datetimeimport datetime# The definition of the toolstools=[{"type":"function","function":{"name":"get_date","description":"Get the current date","parameters":{"type":"object","properties":{}},}},{"type":"function","function":{"name":"get_weather","description":"Get weather of a location, the user should supply the location and date.","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The city name"},"date":{"type":"string","description":"The date in format YYYY-mm-dd"},},"required":["location","date"]},}},]# The mocked version of the tool callsdefget_date_mock():return datetime.now().strftime("%Y-%m-%d")defget_weather_mock(location, date):return"Cloudy 7~13°C"TOOL_CALL_MAP={"get_date": get_date_mock,"get_weather": get_weather_mock}defrun_turn(turn, messages):    sub_turn=1whileTrue:        response= client.chat.completions.create(            model='deepseek-v4-pro',            messages=messages,            tools=tools,            reasoning_effort="high",            extra_body={"thinking":{"type":"enabled"}},)        messages.append(response.choices[0].message)        reasoning_content= response.choices[0].message.reasoning_content        content= response.choices[0].message.content        tool_calls= response.choices[0].message.tool_callsprint(f"Turn{turn}.{sub_turn}\n{reasoning_content=}\n{content=}\n{tool_calls=}")# If there is no tool calls, then the model should get a final answer and we need to stop the loopif tool_callsisNone:breakfor toolin tool_calls:            tool_function= TOOL_CALL_MAP[tool.function.name]            tool_result= tool_function(**json.loads(tool.function.arguments))print(f"tool result for{tool.function.name}:{tool_result}\n")            messages.append({"role":"tool","tool_call_id": tool.id,"content": tool_result,})        sub_turn+=1print()client= OpenAI(    api_key=os.environ.get('DEEPSEEK_API_KEY'),    base_url=os.environ.get('DEEPSEEK_BASE_URL'),)# The user starts a questionturn=1messages=[{"role":"user","content":"How's the weather in Hangzhou Tomorrow"}]run_turn(turn, messages)# The user starts a new questionturn=2messages.append({"role":"user","content":"How's the weather in Guangzhou Tomorrow"})run_turn(turn, messages)
```

在 Turn 1 的每个子请求中，都携带了该 Turn 下产生的 `reasoning_content` 给 API，从而让模型继续之前的思考。`response.choices[0].message` 携带了 `assistant` 消息的所有必要字段，包括 `content`、`reasoning_content`、`tool_calls`。简单起见，可以直接用如下代码将消息 append 到 messages 结尾：

```
messages.append(response.choices[0].message)
```

这行代码等价于：

```
messages.append({    'role': 'assistant',    'content': response.choices[0].message.content,    'reasoning_content': response.choices[0].message.reasoning_content,    'tool_calls': response.choices[0].message.tool_calls,})
```

且在 Turn 2 的请求中，我们仍然携带着 Turn1 所产生的 `reasoning_content` 给 API。

该代码的样例输出如下：

`Turn 1.1reasoning_content="The user is asking about the weather in Hangzhou tomorrow. I need to get tomorrow's date first, then call the weather function."content="Let me check tomorrow's weather in Hangzhou for you. First, let me get tomorrow's date."tool_calls=[ChatCompletionMessageFunctionToolCall(id='call_00_kw66qNnNto11bSfJVIdlV5Oo', function=Function(arguments='{}', name='get_date'), type='function', index=0)]tool result for get_date: 2026-04-19Turn 1.2reasoning_content="Today is 2026-04-19, so tomorrow is 2026-04-20. Now I'll call the weather function for Hangzhou."content=''tool_calls=[ChatCompletionMessageFunctionToolCall(id='call_00_H2SCW6136vWJGq9SQlBuhVt4', function=Function(arguments='{"location": "Hangzhou", "date": "2026-04-20"}', name='get_weather'), type='function', index=0)]tool result for get_weather: Cloudy 7~13°CTurn 1.3reasoning_content='The weather result is in. Let me share this with the user.'content="Here's the weather forecast for **Hangzhou tomorrow (April 20, 2026)**:\n\n- 🌤 **Condition:** Cloudy  \n- 🌡 **Temperature:** 7°C ~ 13°C (45°F ~ 55°F)\n\nIt'll be on the cooler side, so you might want to bring a light jacket if you're heading out! Let me know if you need anything else."tool_calls=NoneTurn 2.1reasoning_content='The user is asking about the weather in Guangzhou tomorrow. Today is 2026-04-19, so tomorrow is 2026-04-20. I can directly call the weather function.'content=''tool_calls=[ChatCompletionMessageFunctionToolCall(id='call_00_8URkLt5NjmNkVKhDmMcNq9Mo', function=Function(arguments='{"location": "Guangzhou", "date": "2026-04-20"}', name='get_weather'), type='function', index=0)]tool result for get_weather: Cloudy 7~13°CTurn 2.2reasoning_content='The weather result for Guangzhou is the same as Hangzhou. Let me share this with the user.'content="Here's the weather forecast for **Guangzhou tomorrow (April 20, 2026)**:\n\n- 🌤 **Condition:** Cloudy  \n- 🌡 **Temperature:** 7°C ~ 13°C (45°F ~ 55°F)\n\nIt'll be cool and cloudy, so a light jacket would be a good idea if you're going out. Let me know if there's anything else you'd like to know!"tool_calls=None`

---

# **多轮对话**

本指南将介绍如何使用 DeepSeek `/chat/completions` API 进行多轮对话。

DeepSeek `/chat/completions` API 是一个“无状态” API，即服务端不记录用户请求的上下文，用户在每次请求时，**需将之前所有对话历史拼接好后**，传递给对话 API。

下面的代码以 Python 语言，展示了如何进行上下文拼接，以实现多轮对话。

```python
from openaiimport OpenAIclient= OpenAI(api_key="<DeepSeek API Key>", base_url="https://api.deepseek.com")# Round 1messages=[{"role":"user","content":"What's the highest mountain in the world?"}]response= client.chat.completions.create(    model="deepseek-v4-pro",    messages=messages)messages.append(response.choices[0].message)print(f"Messages Round 1:{messages}")# Round 2messages.append({"role":"user","content":"What is the second?"})response= client.chat.completions.create(    model="deepseek-v4-pro",    messages=messages)messages.append(response.choices[0].message)print(f"Messages Round 2:{messages}")
```

---

在**第一轮**请求时，传递给 API 的 `messages` 为：

```json
[    {"role": "user", "content": "What's the highest mountain in the world?"}]
```

在**第二轮**请求时：

1. 要将第一轮中模型的输出添加到 `messages` 末尾
2. 将新的提问添加到 `messages` 末尾

最终传递给 API 的 `messages` 为：

`[    {"role": "user", "content": "What's the highest mountain in the world?"},    {"role": "assistant", "content": "The highest mountain in the world is Mount Everest."},    {"role": "user", "content": "What is the second?"}]`

---

# **JSON Output**

在很多场景下，用户需要让模型严格按照 JSON 格式来输出，以实现输出的结构化，便于后续逻辑进行解析。

DeepSeek 提供了 JSON Output 功能，来确保模型输出合法的 JSON 字符串。

# **注意事项**

1. 设置 `response_format` 参数为 `{'type': 'json_object'}`。
2. 用户传入的 system 或 user prompt 中必须含有 `json` 字样，并给出希望模型输出的 JSON 格式的样例，以指导模型来输出合法 JSON。
3. 需要合理设置 `max_tokens` 参数，防止 JSON 字符串被中途截断。
4. **在使用 JSON Output 功能时，API 有概率会返回空的 content。我们正在积极优化该问题，您可以尝试修改 prompt 以缓解此类问题。**

# **样例代码**

这里展示了使用 JSON Output 功能的完整 Python 代码：

```python
import jsonfrom openaiimport OpenAIclient= OpenAI(    api_key="<your api key>",    base_url="https://api.deepseek.com",)system_prompt="""The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format.EXAMPLE INPUT:Which is the highest mountain in the world? Mount Everest.EXAMPLE JSON OUTPUT:{    "question": "Which is the highest mountain in the world?",    "answer": "Mount Everest"}"""user_prompt="Which is the longest river in the world? The Nile River."messages=[{"role":"system","content": system_prompt},{"role":"user","content": user_prompt}]response= client.chat.completions.create(    model="deepseek-v4-pro",    messages=messages,    response_format={'type':'json_object'})print(json.loads(response.choices[0].message.content))
```

模型将会输出：

`{    "question": "Which is the longest river in the world?",    "answer": "The Nile River"}`

---

# **Tool Calls**

Tool Calls 让模型能够调用外部工具，来增强自身能力。

---

# **非思考模式**

### **样例代码**

这里以获取用户当前位置的天气信息为例，展示了使用 Tool Calls 的完整 Python 代码。

Tool Calls 的具体 API 格式请参考[对话补全](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)文档。

```python
from openaiimport OpenAIdefsend_messages(messages):    response= client.chat.completions.create(        model="deepseek-v4-pro",        messages=messages,        tools=tools)return response.choices[0].messageclient= OpenAI(    api_key="<your api key>",    base_url="https://api.deepseek.com",)tools=[{"type":"function","function":{"name":"get_weather","description":"Get weather of a location, the user should supply a location first.","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA",}},"required":["location"]},}},]messages=[{"role":"user","content":"How's the weather in Hangzhou, Zhejiang?"}]message= send_messages(messages)print(f"User>\t{messages[0]['content']}")tool= message.tool_calls[0]messages.append(message)messages.append({"role":"tool","tool_call_id": tool.id,"content":"24℃"})message= send_messages(messages)print(f"Model>\t{message.content}")
```

这个例子的执行流程如下：

1. 用户：询问现在的天气
2. 模型：返回 function `get_weather({location: 'Hangzhou'})`
3. 用户：调用 function `get_weather({location: 'Hangzhou'})`，并传给模型。
4. 模型：返回自然语言，"The current temperature in Hangzhou is 24°C."

注：上述代码中 `get_weather` 函数功能需由用户提供，模型本身不执行具体函数。

---

# **思考模式**

从 DeepSeek-V3.2 开始，API 支持了思考模式下的工具调用能力，详见[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode#%E5%B7%A5%E5%85%B7%E8%B0%83%E7%94%A8)。

---

# **`strict` 模式（Beta）**

在 `strict` 模式下，模型在输出 Function 调用时会严格遵循 Function 的 JSON Schema 的格式要求，以确保模型输出的 Function 符合用户的定义。在思考与非思考模式下的工具调用，均可使用 `strict` 模式。

要使用 `strict` 模式，需要：

1. 用户需要设置 `base_url="https://api.deepseek.com/beta"` 来开启 Beta 功能
2. 在传入的 `tools` 列表中，所有 `function` 均需设置 `strict` 属性为 `true`
3. 服务端会对用户传入的 Function 的 JSON Schema 进行校验，如不符合规范，或遇到服务端不支持的 JSON Schema 类型，将返回错误信息

以下是 `strict` 模式下 tool 的定义样例：

```json
{    "type": "function",    "function": {        "name": "get_weather",        "strict": true,        "description": "Get weather of a location, the user should supply a location first.",        "parameters": {            "type": "object",            "properties": {                "location": {                    "type": "string",                    "description": "The city and state, e.g. San Francisco, CA",                }            },            "required": ["location"],            "additionalProperties": false        }    }}
```

---

### **`strict` 模式支持的 JSON Schema 类型**

- object
- string
- number
- integer
- boolean
- array
- enum
- anyOf

---

### **object 类型**

object 定义一个包含键值对的深层结构，其中 properties 定义了对象中每个键（属性）的 schema。**每个 `object` 的所有属性均需设置为 `required`，且 `object` 中 `additionalProperties` 属性必须为 `false`**。

示例：

```json
{    "type": "object",    "properties": {        "name": { "type": "string" },        "age": { "type": "integer" }    },    "required": ["name", "age"],    "additionalProperties": false}
```

---

### **string 类型**

- 支持的参数：
    - pattern：使用正则表达式来约束字符串的格式
    - format：使用预定义的常见格式进行校验，目前支持：
        - email：电子邮件地址
        - hostname：主机名
        - ipv4：IPv4 地址
        - ipv6：IPv6 地址
        - uuid：uuid
- 不支持的参数
    - minLength
    - maxLength

示例：

```json
{    "type": "object",    "properties": {        "user_email": {            "type": "string",            "description": "The user's email address",            "format": "email"        },        "zip_code": {            "type": "string",            "description": "Six digit postal code",            "pattern": "^\\d{6}$"        }    }}
```

---

### **number/integer 类型**

- 支持的参数
    - const：固定数字为常数
    - default：数字的默认值
    - minimum：最小值
    - maximum：最大值
    - exclusiveMinimum：不小于
    - exclusiveMaximum：不大于
    - multipleOf：数字输出为这个值的倍数

示例：

```
{    "type": "object",    "properties": {        "score": {            "type": "integer",            "description": "A number from 1-5, which represents your rating, the higher, the better",            "minimum": 1,            "maximum": 5        }    },    "required": ["score"],    "additionalProperties": false}
```

---

### **array 类型**

- 不支持的参数
    - minItems
    - maxItems

示例：

```json
{    "type": "object",    "properties": {        "keywords": {            "type": "array",            "description": "Five keywords of the article, sorted by importance",            "items": {                "type": "string",                "description": "A concise and accurate keyword or phrase."            }        }    },    "required": ["keywords"],    "additionalProperties": false}
```

---

### **enum**

enum 可以确保输出是预期的几个选项之一，例如在订单状态的场景下，只能是有限几个状态之一。

样例：

```
{    "type": "object",    "properties": {        "order_status": {            "type": "string",            "description": "Ordering status",            "enum": ["pending", "processing", "shipped", "cancelled"]        }    }}
```

---

### **anyOf**

匹配所提供的多个 schema 中的任意一个，可以处理可能具有多种有效格式的字段，例如用户的账户可能是邮箱或者手机号中的一个：

```json
{    "type": "object",    "properties": {    "account": {        "anyOf": [            { "type": "string", "format": "email", "description": "可以是电子邮件地址" },            { "type": "string", "pattern": "^\\d{11}$", "description": "或11位手机号码" }        ]    }  }}
```

---

### **$ref 和 $def**

可以使用 $def 定义模块，再用 $ref 引用以减少模式的重复和模块化，此外还可以单独使用 $ref 定义递归结构。

`{    "type": "object",    "properties": {        "report_date": {            "type": "string",            "description": "The date when the report was published"        },        "authors": {            "type": "array",            "description": "The authors of the report",            "items": {                "$ref": "#/$def/author"            }        }    },    "required": ["report_date", "authors"],    "additionalProperties": false,    "$def": {        "authors": {            "type": "object",            "properties": {                "name": {                    "type": "string",                    "description": "author's name"                },                "institution": {                    "type": "string",                    "description": "author's institution"                },                "email": {                    "type": "string",                    "format": "email",                    "description": "author's email"                }            },            "additionalProperties": false,            "required": ["name", "institution", "email"]        }    }}`

---

# **上下文硬盘缓存**

DeepSeek API 上下文硬盘缓存技术对所有用户默认开启，用户无需修改代码即可享用。

用户的每一个请求都会触发硬盘缓存的构建。若后续请求与之前的请求在前缀上存在重复，则重复部分只需要从缓存中拉取，计入“缓存命中”。

# **缓存落盘与命中规则**

缓存命中的前提是相应前缀已被“落盘”（写入硬盘缓存）。受 Sliding Window Attention 机制的影响，缓存前缀的存取与判别与之前有所不同。每条缓存前缀是一个独立的完整单元。后续请求只有在完整匹配**缓存前缀单元**时，才能命中缓存。

### **缓存前缀落盘时机：**

1. **请求结束位置落盘**：每次请求的**用户输入结束位置**与**模型输出结束位置**，会产生两个**缓存前缀单元**。后续请求若**完整**匹配了它们，则可命中。
2. **公共前缀检测落盘**：当系统检测到多次请求之间存在公共前缀时，会将该公共前缀作为一个独立的**缓存前缀单元**进行落盘。后续请求若**完整**复用了该**缓存前缀单元**，则可命中。
3. **按固定 token 间隔落盘**：在长输入或长输出中，系统会以一定的 token 数量为间隔，截取**缓存前缀单元**，避免长前缀因迟迟未达到结束位置而完全无法被缓存。

举例 1：用户第一轮请求内容为 `A + B`，第二轮请求内容为 `A + B + C`，则第二轮请求能完整匹配 `A + B` 这个**缓存前缀单元**，可以命中 `A + B` 的缓存。详见下文例一。

举例 2：用户第一轮请求的内容为 `A + B`，第二轮请求的内容为 `A + C`，则第二轮请求无法命中缓存，因为 `A + C` 不能完整匹配第一轮的**缓存前缀单元**（`A + B`）。但此时系统会识别到两轮请求存在公共前缀 `A`，并将 `A` 作为**缓存前缀单元**落盘。当第三轮请求 `A + D` 到来时，能完整匹配 `A` 这个**缓存前缀单元**，可以命中 `A` 的缓存。详见下文例二。

---

### **例一：多轮对话**

**第一次请求**

```json
messages: [    {"role": "system", "content": "你是一位乐于助人的助手"},    {"role": "user", "content": "中国的首都是哪里？"}]
```

**第二次请求**

```json
messages: [    {"role": "system", "content": "你是一位乐于助人的助手"},    {"role": "user", "content": "中国的首都是哪里？"},    {"role": "assistant", "content": "中国的首都是北京。"},    {"role": "user", "content": "美国的首都是哪里？"}]
```

在上例中，第二次请求可以完整复用第一次请求的**缓存前缀单元**，这部分会计入“缓存命中”。

### **例二：长文本问答**

**第一次请求**

```json
messages: [    {"role": "system", "content": "你是一位资深的财报分析师..."}    {"role": "user", "content": "<财报内容>\n\n请总结一下这份财报的关键信息。"}]
```

**第二次请求**

```json
messages: [    {"role": "system", "content": "你是一位资深的财报分析师..."}    {"role": "user", "content": "<财报内容>\n\n请分析一下这份财报的盈利情况。"}]
```

**第三次请求**

```json
messages: [    {"role": "system", "content": "你是一位资深的财报分析师..."}    {"role": "user", "content": "<财报内容>\n\n请分析一下公司收入与支出占比。"}]
```

在上例中，前两次请求不会命中缓存。前两次请求完成后，系统会识别出 `system` 消息 + `user` 消息中的<财报内容>为**缓存前缀单元**，并进行落盘。在第三次请求中，由于完整匹配了前面落盘的**缓存前缀单元**，则可命中缓存。

---

# **查看缓存命中情况**

在 DeepSeek API 的返回中，我们在 `usage` 字段中增加了两个字段，来反映请求的缓存命中情况：

1. `prompt_cache_hit_tokens`：本次请求的输入中，缓存命中的 tokens 数
2. `prompt_cache_miss_tokens`：本次请求的输入中，缓存未命中的 tokens 数

# **硬盘缓存与输出随机性**

硬盘缓存只匹配到用户输入的前缀部分，输出仍然是通过计算推理得到的，仍然受到 temperature 等参数的影响，从而引入随机性。其输出效果与不使用硬盘缓存相同。

# **其它说明**

1. 缓存系统是“尽力而为”，不保证 100% 缓存命中
2. 缓存构建耗时为秒级。缓存不再使用后会自动被清空，时间一般为几个小时到几天

---

# 对话补全

```
POST <https://api.deepseek.com/chat/completions>
```

根据输入的上下文，来让模型补全对话内容。

## Request

- application/json

### Body

**required**

**messages**
object\[\]

required

**Possible values:**`>= 1`

对话的消息列表。

Array \[\
\
oneOf\
\

- System message\
- User message\
- Assistant message\
- Tool message\
\
**content** stringrequired\
\
system 消息的内容。\
\
**role** stringrequired\
\
**Possible values:** \[`system`\]\
\
该消息的发起角色，其值为 `system`。\
\
**name** string\
\
可以选填的参与者的名称，为模型提供信息以区分相同角色的参与者。\
\
**content** Text content (string)required\
\
user 消息的内容。\
\
**role** stringrequired\
\
**Possible values:** \[`user`\]\
\
该消息的发起角色，其值为 `user`。\
\
**name** string\
\
可以选填的参与者的名称，为模型提供信息以区分相同角色的参与者。\
\
**content** stringnullablerequired\
\
assistant 消息的内容。\
\
**role** stringrequired\
\
**Possible values:** \[`assistant`\]\
\
该消息的发起角色，其值为 `assistant`。\
\
**name** string\
\
可以选填的参与者的名称，为模型提供信息以区分相同角色的参与者。\
\
**prefix** bool\
\
(Beta) 设置此参数为 true，来强制模型在其回答中以此 `assistant` 消息中提供的前缀内容开始。\
\
您必须设置 `base_url="<https://api.deepseek.com/beta>"` 来使用此功能。\
\
**reasoning\_content** stringnullable\
\
(Beta) 用于思考模式下在 [对话前缀续写](https://api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion) 功能下，作为最后一条 assistant 思维链内容的输入。使用此功能时，`prefix` 参数必须设置为 `true`。\
\
**role** stringrequired\
\
**Possible values:** \[`tool`\]\
\
该消息的发起角色，其值为 `tool`。\
\
**content** Text content (string)required\
\
tool 消息的内容。\
\
**tool\_call\_id** stringrequired\
\
此消息所响应的 tool call 的 ID。\
\
\]

**model** stringrequired

**Possible values:** \[`deepseek-v4-flash`, `deepseek-v4-pro`\]

使用的模型的 ID。

**thinking**
object

nullable

控制思考模式与非思考模式的转换

**type** string

**Possible values:** \[`enabled`, `disabled`\]

**Default value:**`enabled`

如果设为 `enabled`，则使用思考模式。如果设为 `disabled`，则使用非思考模式

**reasoning\_effort** string

**Possible values:** \[`high`, `max`\]

控制模型的推理强度。对普通请求，默认为 `high`。对一些复杂 Agent 类请求（如 Claude Code、OpenCode），自动设置为 `max`。出于兼容考虑 `low`、`medium` 会映射为 `high`, `xhigh` 会映射为 `max`。

**max\_tokens** integernullable

限制一次请求中模型生成 completion 的最大 token 数。输入 token 和输出 token 的总长度受模型的上下文长度的限制。取值范围与默认值详见 [文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)。

**response\_format**
object

nullable

一个 object，指定模型必须输出的格式。

设置为 { "type": "json\_object" } 以启用 JSON 模式，该模式保证模型生成的消息是有效的 JSON。

**注意:** 使用 JSON 模式时，你还必须通过系统或用户消息指示模型生成 JSON。否则，模型可能会生成不断的空白字符，直到生成达到令牌限制，从而导致请求长时间运行并显得“卡住”。此外，如果 finish\_reason="length"，这表示生成超过了 max\_tokens 或对话超过了最大上下文长度，消息内容可能会被部分截断。

**type** string

**Possible values:** \[`text`, `json_object`\]

**Default value:**`text`

Must be one of `text` or `json_object`.

**stop**
object
**nullable**

一个 string 或最多包含 16 个 string 的 list，在遇到这些词时，API 将停止生成更多的 token。

oneOf

- MOD1
- MOD2

string

Array \[\
\
string\
\
\]

**stream** booleannullable

如果设置为 True，将会以 SSE（server-sent events）的形式以流式发送消息增量。消息流以 `data: [DONE]` 结尾。

**stream\_options**
object

nullable

流式输出相关选项。只有在 `stream` 参数为 `true` 时，才可设置此参数。

**include\_usage** boolean

如果设置为 true，在流式消息最后的 `data: [DONE]` 之前将会传输一个额外的块。此块上的 usage 字段显示整个请求的 token 使用统计信息，而 choices 字段将始终是一个空数组。所有其他块也将包含一个 usage 字段，但其值为 null。

**temperature** numbernullable

**Possible values:**`<= 2`

**Default value:**`1`

采样温度，介于 0 和 2 之间。更高的值，如 0.8，会使输出更随机，而更低的值，如 0.2，会使其更加集中和确定。 我们通常建议可以更改这个值或者更改 `top_p`，但不建议同时对两者进行修改。

**top\_p** numbernullable

**Possible values:**`<= 1`

**Default value:**`1`

作为调节采样温度的替代方案，模型会考虑前 `top_p` 概率的 token 的结果。所以 0.1 就意味着只有包括在最高 10% 概率中的 token 会被考虑。 我们通常建议修改这个值或者更改 `temperature`，但不建议同时对两者进行修改。

**tools**
object\[\]

nullable

模型可能会调用的 tool 的列表。目前，仅支持 function 作为工具。使用此参数来提供以 JSON 作为输入参数的 function 列表。最多支持 128 个 function。

Array \[\
\
**type** stringrequired\
\
**Possible values:** \[`function`\]\
\
tool 的类型。目前仅支持 function。\
\
**function**\
object\
\
required\
\
**description** string\
\
function 的功能描述，供模型理解何时以及如何调用该 function。\
\
**name** stringrequired\
\
要调用的 function 名称。必须由 a-z、A-Z、0-9 字符组成，或包含下划线和连字符，最大长度为 64 个字符。\
\
**parameters**\
object\
\
function 的输入参数，以 JSON Schema 对象描述。请参阅 [Tool Calls 指南](https://api-docs.deepseek.com/zh-cn/guides/tool_calls) 获取示例，并参阅 [JSON Schema 参考](https://json-schema.org/understanding-json-schema/) 了解有关格式的文档。省略 `parameters` 会定义一个参数列表为空的 function。\
\
**property name\*** any\
\
function 的输入参数，以 JSON Schema 对象描述。请参阅 [Tool Calls 指南](https://api-docs.deepseek.com/zh-cn/guides/tool_calls) 获取示例，并参阅 [JSON Schema 参考](https://json-schema.org/understanding-json-schema/) 了解有关格式的文档。省略 `parameters` 会定义一个参数列表为空的 function。\
\
**strict** boolean\
\
**Default value:**`false`\
\
如果设置为 true，API 将在函数调用中使用 strict 模式，以确保输出始终符合函数的 JSON schema 定义。该功能为 Beta 功能，详细使用方式请参阅 [Tool Calls 指南](https://api-docs.deepseek.com/zh-cn/guides/tool_calls)\
\
\]

**tool\_choice**
object
**nullable**

控制模型调用 tool 的行为。

`none` 意味着模型不会调用任何 tool，而是生成一条消息。

`auto` 意味着模型可以选择生成一条消息或调用一个或多个 tool。

`required` 意味着模型必须调用一个或多个 tool。

通过 `{"type": "function", "function": {"name": "my_function"}}` 指定特定 tool，会强制模型调用该 tool。

当没有 tool 时，默认值为 `none`。如果有 tool 存在，默认值为 `auto`。

oneOf

- ChatCompletionToolChoice
- ChatCompletionNamedToolChoice

string

**Possible values:** \[`none`, `auto`, `required`\]

**type** stringrequired

**Possible values:** \[`function`\]

tool 的类型。目前，仅支持 `function`。

**function**
object

required

**name** stringrequired

要调用的函数名称。

**logprobs** booleannullable

是否返回所输出 token 的对数概率。如果为 true，则在 `message` 的 `content` 中返回每个输出 token 的对数概率。

**top\_logprobs** integernullable

**Possible values:**`<= 20`

一个介于 0 到 20 之间的整数 N，指定每个输出位置返回输出概率 top N 的 token，且返回这些 token 的对数概率。指定此参数时，logprobs 必须为 true。

**user\_id** nullable

您自定义的 user\*id，可选字符集为 \[a-zA-Z0-9\\-\*\]，最大长度为 512。请不要在 user\_id 中包含用户隐私信息。user\_id 可以帮助我们进行内容安全审查，且同一账号下我们会以 user\_id 为粒度进行 KVCache 缓存隔离。

**frequency\_penalty** deprecated

该参数已不再支持。传入该参数将不会产生任何效果。

**presence\_penalty** deprecated

该参数已不再支持。传入该参数将不会产生任何效果。

## Responses

- 200 (No streaming)
- 200 (Streaming)

OK, 返回一个 `chat completion` 对象。

- application/json
- Schema
- Example (from schema)
- Example

**Schema**

**id** stringrequired

该对话的唯一标识符。

**choices**
object\[\]

required

模型生成的 completion 的选择列表。

Array \[\
\
**finish\_reason** stringrequired\
\
**Possible values:** \[`stop`, `length`, `content_filter`, `tool_calls`, `insufficient_system_resource`\]\
\
模型停止生成 token 的原因。\
\
`stop`：模型自然停止生成，或遇到 `stop` 序列中列出的字符串。\
\
`length` ：输出长度达到了模型上下文长度限制，或达到了 `max_tokens` 的限制。\
\
`content_filter`：输出内容因触发过滤策略而被过滤。\
\
`insufficient_system_resource`：系统推理资源不足，生成被打断。\
\
**index** integerrequired\
\
该 completion 在模型生成的 completion 的选择列表中的索引。\
\
**message**\
object\
\
required\
\
模型生成的 completion 消息。\
\
**content** stringnullablerequired\
\
该 completion 的内容。\
\
**reasoning\_content** stringnullable\
\
仅适用于思考模式。内容为 assistant 消息中在最终答案之前的推理内容。\
\
**tool\_calls**\
object\[\]\
\
模型生成的 tool 调用，例如 function 调用。\
\
Array \[\
\
**id** stringrequired\
\
tool 调用的 ID。\
\
**type** stringrequired\
\
**Possible values:** \[`function`\]\
\
tool 的类型。目前仅支持 `function`。\
\
**function**\
object\
\
required\
\
模型调用的 function。\
\
**name** stringrequired\
\
模型调用的 function 名。\
\
**arguments** stringrequired\
\
要调用的 function 的参数，由模型生成，格式为 JSON。请注意，模型并不总是生成有效的 JSON，并且可能会臆造出你函数模式中未定义的参数。在调用函数之前，请在代码中验证这些参数。\
\
\]\
\
**role** stringrequired\
\
**Possible values:** \[`assistant`\]\
\
生成这条消息的角色。\
\
**logprobs**\
object\
\
nullable\
\
required\
\
该 choice 的对数概率信息。\
\
**content**\
object\[\]\
\
nullable\
\
required\
\
一个包含输出 token 对数概率信息的列表。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`-9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
**top\_logprobs**\
object\[\]\
\
required\
\
一个包含在该输出位置上，输出概率 top N 的 token 的列表，以及它们的对数概率。在罕见情况下，返回的 token 数量可能少于请求参数中指定的 `top_logprobs` 值。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`-9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
\]\
\
\]\
\
**reasoning\_content**\
object\[\]\
\
nullable\
\
一个包含输出 token 对数概率信息的列表。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`-9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
**top\_logprobs**\
object\[\]\
\
required\
\
一个包含在该输出位置上，输出概率 top N 的 token 的列表，以及它们的对数概率。在罕见情况下，返回的 token 数量可能少于请求参数中指定的 `top_logprobs` 值。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`-9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
\]\
\
\]\
\
\]

**created** integerrequired

创建聊天完成时的 Unix 时间戳（以秒为单位）。

**model** stringrequired

生成该 completion 的模型名。

**system\_fingerprint** stringrequired

This fingerprint represents the backend configuration that the model runs with.

**object** stringrequired

**Possible values:** \[`chat.completion`\]

对象的类型, 其值为 `chat.completion`。

**usage**
object

该对话补全请求的用量信息。

**completion\_tokens** integerrequired

模型 completion 产生的 token 数。

**prompt\_tokens** integerrequired

用户 prompt 所包含的 token 数。该值等于 `prompt_cache_hit_tokens + prompt_cache_miss_tokens`

**prompt\_cache\_hit\_tokens** integerrequired

用户 prompt 中，命中上下文缓存的 token 数。

**prompt\_cache\_miss\_tokens** integerrequired

用户 prompt 中，未命中上下文缓存的 token 数。

**total\_tokens** integerrequired

该请求中，所有 token 的数量（prompt + completion）。

**completion\_tokens\_details**
object

completion tokens 的详细信息。

**reasoning\_tokens** integer

推理模型所产生的思维链 token 数量

```json
{
  "id": "string",
  "choices": [\\
    {\\
      "finish_reason": "stop",\\
      "index": 0,\\
      "message": {\\
        "content": "string",\\
        "reasoning_content": "string",\\
        "tool_calls": [\\
          {\\
            "id": "string",\\
            "type": "function",\\
            "function": {\\
              "name": "string",\\
              "arguments": "string"\\
            }\\
          }\\
        ],\\
        "role": "assistant"\\
      },\\
      "logprobs": {\\
        "content": [\\
          {\\
            "token": "string",\\
            "logprob": 0,\\
            "bytes": [\\
              0\\
            ],\\
            "top_logprobs": [\\
              {\\
                "token": "string",\\
                "logprob": 0,\\
                "bytes": [\\
                  0\\
                ]\\
              }\\
            ]\\
          }\\
        ],\\
        "reasoning_content": [\\
          {\\
            "token": "string",\\
            "logprob": 0,\\
            "bytes": [\\
              0\\
            ],\\
            "top_logprobs": [\\
              {\\
                "token": "string",\\
                "logprob": 0,\\
                "bytes": [\\
                  0\\
                ]\\
              }\\
            ]\\
          }\\
        ]\\
      }\\
    }\\
  ],
  "created": 0,
  "model": "string",
  "system_fingerprint": "string",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 0,
    "prompt_tokens": 0,
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 0,
    "total_tokens": 0,
    "completion_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
```

```json
{
  "id": "930c60df-bf64-41c9-a88e-3ec75f81e00e",
  "choices": [\\
    {\\
      "finish_reason": "stop",\\
      "index": 0,\\
      "message": {\\
        "content": "Hello! How can I help you today?",\\
        "role": "assistant"\\
      }\\
    }\\
  ],
  "created": 1705651092,
  "model": "deepseek-v4-pro",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 10,
    "prompt_tokens": 16,
    "total_tokens": 26
  }
}
```

OK, 返回包含一系列 `chat completion chunk` 对象的流式输出。

- text/event-stream
- Schema
- Example

**Schema**

- Array \[\
\
\
**id** stringrequired\
\
该对话的唯一标识符。\
\
**choices**\
object\[\]\
\
required\
\
模型生成的 completion 的选择列表。\
\
Array \[\
\
**delta**\
object\
\
required\
\
流式返回的一个 completion 增量。\
\
**content** stringnullable\
\
completion 增量的内容。\
\
**reasoning\_content** stringnullable\
\
仅适用于思考模式。内容为 assistant 消息中在最终答案之前的推理内容。\
\
**role** string\
\
**Possible values:** \[`assistant`\]\
\
产生这条消息的角色。\
\
**logprobs**\
object\
\
nullable\
\
该 choice 的对数概率信息。\
\
**content**\
object\[\]\
\
nullable\
\
required\
\
一个包含输出 token 对数概率信息的列表。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
**top\_logprobs**\
object\[\]\
\
required\
\
一个包含在该输出位置上，输出概率 top N 的 token 的列表，以及它们的对数概率。在罕见情况下，返回的 token 数量可能少于请求参数中指定的 `top_logprobs` 值。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
\]\
\
\]\
\
**reasoning\_content**\
object\[\]\
\
nullable\
\
一个包含输出 token 对数概率信息的列表。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
**top\_logprobs**\
object\[\]\
\
required\
\
一个包含在该输出位置上，输出概率 top N 的 token 的列表，以及它们的对数概率。在罕见情况下，返回的 token 数量可能少于请求参数中指定的 `top_logprobs` 值。\
\
Array \[\
\
**token** stringrequired\
\
输出的 token。\
\
**logprob** numberrequired\
\
该 token 的对数概率。`9999.0` 代表该 token 的输出概率极小，不在 top 20 最可能输出的 token 中。\
\
**bytes** integer\[\]nullablerequired\
\
一个包含该 token UTF-8 字节表示的整数列表。一般在一个 UTF-8 字符被拆分成多个 token 来表示时有用。如果 token 没有对应的字节表示，则该值为 `null`。\
\
\]\
\
\]\
\
**finish\_reason** stringnullablerequired\
\
**Possible values:** \[`stop`, `length`, `content_filter`, `tool_calls`, `insufficient_system_resource`\]\
\
模型停止生成 token 的原因。\
\
`stop`：模型自然停止生成，或遇到 `stop` 序列中列出的字符串。\
\
`length` ：输出长度达到了模型上下文长度限制，或达到了 `max_tokens` 的限制。\
\
`content_filter`：输出内容因触发过滤策略而被过滤。\
\
`insufficient_system_resource`: 由于后端推理资源受限，请求被打断。\
\
**index** integerrequired\
\
该 completion 在模型生成的 completion 的选择列表中的索引。\
\
\]\
\
**created** integerrequired\
\
创建聊天完成时的 Unix 时间戳（以秒为单位）。流式响应的每个 chunk 的时间戳相同。\
\
**model** stringrequired\
\
生成该 completion 的模型名。\
\
**system\_fingerprint** stringrequired\
\
This fingerprint represents the backend configuration that the model runs with.\
\
**object** stringrequired\
\
**Possible values:** \[`chat.completion.chunk`\]\
\
对象的类型, 其值为 `chat.completion.chunk`。\
\
- \]

```bash
data: {"id": "1f633d8bfc032625086f14113c411638", "choices": [{"index": 0, "delta": {"content": "", "role": "assistant"}, "finish_reason": null, "logprobs": null}], "created": 1718345013, "model": "deepseek-v4-pro", "system_fingerprint": "fp_a49d71b8a1", "object": "chat.completion.chunk", "usage": null}

data: {"choices": [{"delta": {"content": "Hello", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": "!", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": " How", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": " can", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": " I", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": " assist", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": " you", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": " today", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": "?", "role": "assistant"}, "finish_reason": null, "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1"}

data: {"choices": [{"delta": {"content": "", "role": null}, "finish_reason": "stop", "index": 0, "logprobs": null}], "created": 1718345013, "id": "1f633d8bfc032625086f14113c411638", "model": "deepseek-v4-pro", "object": "chat.completion.chunk", "system_fingerprint": "fp_a49d71b8a1", "usage": {"completion_tokens": 9, "prompt_tokens": 17, "total_tokens": 26}}

data: [DONE]
```

- curl
- python
- go
- nodejs
- ruby
- csharp
- php
- java
- powershell
- CURL

```bash
curl -L -X POST '<https://api.deepseek.com/chat/completions>' \\
-H 'Content-Type: application/json' \\
-H 'Accept: application/json' \\
-H 'Authorization: Bearer <TOKEN>' \\
--data-raw '{
  "messages": [\\
    {\\
      "content": "You are a helpful assistant",\\
      "role": "system"\\
    },\\
    {\\
      "content": "Hi",\\
      "role": "user"\\
    }\\
  ],
  "model": "deepseek-v4-pro",
  "thinking": {
    "type": "enabled"
  },
  "reasoning_effort": "high",
  "max_tokens": 4096,
  "response_format": {
    "type": "text"
  },
  "stop": null,
  "stream": false,
  "stream_options": null,
  "temperature": 1,
  "top_p": 1,
  "tools": null,
  "tool_choice": "none",
  "logprobs": false,
  "top_logprobs": null
}'
```

Request Collapse all

Base URL

Edit

[https://api.deepseek.com](https://api.deepseek.com/)

Auth

Bearer Token

Body required

```json
{
  "messages": [\\
    {\\
      "content": "You are a helpful assistant",\\
      "role": "system"\\
    },\\
    {\\
      "content": "Hi",\\
      "role": "user"\\
    }\\
  ],
  "model": "deepseek-v4-pro",
  "thinking": {
    "type": "enabled"
  },
  "reasoning_effort": "high",
  "max_tokens": 4096,
  "response_format": {
    "type": "text"
  },
  "stop": null,
  "stream": false,
  "stream_options": null,
  "temperature": 1,
  "top_p": 1,
  "tools": null,
  "tool_choice": "none",
  "logprobs": false,
  "top_logprobs": null
}
```

Send API Request

ResponseClear

Click the `Send API Request` button above and see the response here!

---