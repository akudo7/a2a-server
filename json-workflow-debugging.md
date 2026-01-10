# JSON Workflow Configuration Debugging Guide

This document explains how to debug JSON workflow configuration files for kudosflow2.

## Table of Contents

1. [Basic Debugging Flow](#basic-debugging-flow)
2. [Log Verification Methods](#log-verification-methods)
3. [Common Issues and Solutions](#common-issues-and-solutions)
4. [Adding console.log](#adding-consolelog)
5. [Debugging Edge Conditional Routing](#debugging-edge-conditional-routing)
6. [Debugging Tool Execution](#debugging-tool-execution)
7. [Supporting Multiple Input Formats](#supporting-multiple-input-formats)

---

## Basic Debugging Flow

### 1. Starting the Server and Logging Output

```bash
# Start server in background and output logs to file
node out/execution/serverRunner.js json/a2a/servers/your-workflow.json > /tmp/workflow.log 2>&1 &

# Monitor logs in real-time
tail -f /tmp/workflow.log
```

### 2. Checking Server Status

```bash
# Health check
curl -s http://localhost:3000/health

# Check running processes
ps aux | grep serverRunner.js
```

### 3. Stopping the Server

```bash
pkill -f "serverRunner.js"
```

---

## Log Verification Methods

### Checking Log Files

```bash
# Display latest 50 lines
tail -50 /tmp/workflow.log

# Search for specific keywords
grep "Error" /tmp/workflow.log
grep "ToolNode" /tmp/workflow.log

# Check execution logs for specific nodes
grep -A 20 "research_executor" /tmp/workflow.log
```

### Real-time Log Monitoring

```bash
# Display new logs in real-time
tail -f /tmp/workflow.log

# Display only lines matching specific patterns
tail -f /tmp/workflow.log | grep "🔀"
```

---

## Common Issues and Solutions

### 1. Server Won't Start

**Symptoms**: Server starts and immediately exits

**Verification**:
```bash
# Check logs
cat /tmp/workflow.log
```

**Common Causes**:

- JSON syntax errors
- Required modules not installed
- Port already in use

**Solutions**:
```bash
# Check JSON syntax
node -e "console.log(JSON.parse(require('fs').readFileSync('json/a2a/servers/your-workflow.json', 'utf8')))"

# Check port usage
lsof -i :3000

# Stop existing processes if necessary
pkill -f "serverRunner.js"
```

### 2. Tools Not Executing

**Symptoms**: Tool calls detected but not executed

**Verification**:
```bash
grep "Tool:" /tmp/workflow.log
grep "ToolNode" /tmp/workflow.log
```

**Common Causes**:

- MCP server not running
- Incorrect tool name
- `bindMcpServers: true` not configured

**Solution**:
```json
{
  "models": [
    {
      "id": "yourModel",
      "type": "OpenAI",
      "bindMcpServers": true  // ← Verify this
    }
  ]
}
```

### 3. Infinite Loop Occurs

**Symptoms**: Server reaches recursionLimit

**Verification**:
```bash
grep "recursionLimit" /tmp/workflow.log
grep "🔀" /tmp/workflow.log
```

**Common Causes**:

- Incorrect conditional routing logic
- Tool result counting is incorrect

**Solution**:

- Add detailed logging to conditional routing functions
- Correctly count tool execution results (ToolMessage)

Example:
```javascript
// Edge conditional routing function
const toolResultCount = state.messages.filter(msg => {
  const isToolMessage = (
    msg.role === 'tool' ||
    msg.constructor?.name === 'ToolMessage' ||
    msg.type === 'tool'
  );
  console.log(`  Message[${i}]: type=${msg.constructor?.name}, isToolMessage=${isToolMessage}`);
  return isToolMessage;
}).length;

console.log('  Tool result count:', toolResultCount);
```

### 4. Cannot Retrieve LLM Response

**Symptoms**: `LLM response length: 0 chars`

**Verification**:
```bash
grep "LLM response" /tmp/workflow.log
grep "AIMessage" /tmp/workflow.log
```

**Common Causes**:

- AIMessage content not correctly extracted
- Message structure differs from expectations

**Solution**:
```javascript
// Improved result_formatter example
for (let i = messages.length - 1; i >= 0; i--) {
  const msg = messages[i];

  // Add debug logs
  console.log(`  Message[${i}]:`, {
    type: msg.constructor?.name,
    role: msg.role,
    hasContent: !!msg.content,
    contentLength: msg.content?.length || 0
  });

  // If AIMessage
  if (msg.constructor?.name === 'AIMessage') {
    if (msg.content && typeof msg.content === 'string' && msg.content.length > 0) {
      llmResponse = msg.content;
      break;
    }
  }
}
```

---

## Adding console.log

### Adding Logs to Node Functions

You can add `console.log` statements inside function strings in JSON workflow configurations.

**Example 1: Basic Logging**

```json
{
  "nodes": [
    {
      "id": "example_node",
      "handler": {
        "function": "console.log('='.repeat(80));\nconsole.log('🔍 [ExampleNode] Starting process');\nconsole.log('  State messages:', state.messages.length);\n\nconst result = doSomething();\n\nconsole.log('✅ Process completed');\nreturn { messages: [result] };"
      }
    }
  ]
}
```

**Example 2: Detailed Object Logging**

```javascript
// Check message structure
console.log('  Messages:', JSON.stringify(state.messages, null, 2));

// Check specific properties
console.log('  Last message:', {
  type: lastMessage.constructor?.name,
  role: lastMessage.role,
  content: lastMessage.content?.substring(0, 100)
});
```

**Example 3: Loop Debugging**

```javascript
for (let i = 0; i < messages.length; i++) {
  const msg = messages[i];
  console.log(`  [${i}] type=${msg.constructor?.name}, role=${msg.role}`);
}
```

### Log Formatting

Best practices for readable logs:

```javascript
// Section dividers
console.log('\\n' + '='.repeat(80));
console.log('🔍 [NodeName] Process title');
console.log('='.repeat(80));

// Indented logs
console.log('  Item 1:', value1);
console.log('  Item 2:', value2);

// Success/Error/Warning displays
console.log('✅ Success message');
console.log('❌ Error message');
console.log('⚠️ Warning message');

// Conditional branch display
console.log('🔀 [Condition Name] Condition evaluation');
console.log('  ✓ Condition A: true');
console.log('  ✗ Condition B: false');
```

---

## Debugging Edge Conditional Routing

### Debugging Conditional Routing Functions

```json
{
  "edges": [
    {
      "type": "conditional",
      "from": "node_a",
      "condition": {
        "name": "checkCondition",
        "handler": {
          "function": "try {\n  console.log('\\n🔀 [checkCondition] Starting condition evaluation');\n  console.log('  Total messages:', state.messages.length);\n  \n  // Check structure of each message\n  state.messages.forEach((msg, idx) => {\n    console.log(`  [${idx}] type=${msg.constructor?.name}, role=${msg.role}`);\n  });\n  \n  // Condition evaluation\n  const hasToolResult = state.messages.some(msg => msg.role === 'tool');\n  console.log('  Has tool result:', hasToolResult);\n  \n  if (hasToolResult) {\n    console.log('  ✓ Routing to node_b');\n    return 'node_b';\n  } else {\n    console.log('  ✓ Routing to node_c');\n    return 'node_c';\n  }\n} catch (error) {\n  console.error('❌ Condition evaluation error:', error);\n  return 'node_c';\n}",
          "possibleTargets": ["node_b", "node_c"]
        }
      }
    }
  ]
}
```

### Tracing Conditional Routing

```bash
# Extract conditional routing logs
grep "🔀" /tmp/workflow.log

# Check specific condition evaluation results
grep -A 5 "checkCondition" /tmp/workflow.log
```

---

## Debugging Tool Execution

### Checking Tool Node Logs

```bash
# Check tool execution logs
grep "🔧" /tmp/workflow.log
grep "ToolNode" /tmp/workflow.log

# Check tool results
grep "ToolMessage" /tmp/workflow.log
```

### Debugging Tool Calls

```javascript
// research_executor node example
console.log('\\n🤖 LLM response received');
console.log('  Has tool_calls:', !!response.tool_calls);
if (response.tool_calls && response.tool_calls.length > 0) {
  console.log('  Tool calls count:', response.tool_calls.length);
  response.tool_calls.forEach((tc, idx) => {
    console.log(`  [${idx + 1}] ${tc.name}`);
    console.log('    Args:', JSON.stringify(tc.args, null, 2));
  });
}
```

### Validating Tool Results

```javascript
// result_formatter node example
for (let i = messages.length - 1; i >= 0; i--) {
  const msg = messages[i];

  const isToolMessage = (
    msg.role === 'tool' ||
    msg.constructor?.name === 'ToolMessage' ||
    msg.type === 'tool'
  );

  if (isToolMessage) {
    console.log(`  ✓ Found tool message at index ${i}`);
    console.log('    Content length:', msg.content?.length);
    console.log('    Content preview:', msg.content?.substring(0, 200));
    toolResults.push(msg.content);
  }
}

console.log('  Total tool results:', toolResults.length);
```

---

## Sending Test Requests

### Testing with curl

**Important**: All A2A servers use **JSON-RPC 2.0 format**. Send POST requests to the root endpoint (`http://localhost:PORT/`).

#### JSON-RPC 2.0 Format

All requests to A2A servers must follow this structure:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "messageId": "unique-message-id",
      "parts": [{
        "kind": "text",
        "text": "Message body"
      }]
    },
    "contextId": "context-identifier"
  }
}
```

**Required Fields**:

- `jsonrpc`: Must be `"2.0"`
- `id`: Unique identifier for the request (number or string)
- `method`: Must be `"message/send"`
- `params.message.messageId`: Unique message ID
- `params.message.parts`: Array of message parts
- `params.contextId`: Context ID (for session management)

#### Testing research-execution Server

```bash
# Basic test (send to root endpoint)
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "test-001",
        "parts": [{
          "kind": "text",
          "text": "Please research Yazaki Corporation"
        }]
      },
      "contextId": "test-context"
    }
  }'
```

#### Testing quality-evaluation Server

**Important**: The quality-evaluation server also uses **JSON-RPC 2.0 format**. Send requests to the root endpoint (`http://localhost:PORT/`).

The quality-evaluation server supports **two input formats** through Phase 8 improvements:

**Format 1: Structured JSON** (structured data)

```bash
curl -X POST http://localhost:3003/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "test-json-002",
        "parts": [{
          "kind": "text",
          "text": "{\"originalRequest\": \"Please research Yazaki Corporation\", \"researchResults\": [{\"taskId\": 1, \"objective\": \"Company overview research\", \"findings\": \"Yazaki Corporation was founded in 1941 and is an automotive parts manufacturer.\", \"sources\": [\"https://www.yazaki-group.com\"]}], \"totalResults\": 1}"
        }]
      },
      "contextId": "test-json-context"
    }
  }'
```

**Format 2: Natural Language** (markdown/plain text)

```bash
curl -X POST http://localhost:3003/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "test-natural-002",
        "parts": [{
          "kind": "text",
          "text": "Please evaluate the quality of the following research results:\n\n1. **Company Overview**: Yazaki Corporation was founded in 1941 and is an automotive parts manufacturer.\n2. **Product Information**: Main product is wire harnesses."
        }]
      },
      "contextId": "test-natural-context"
    }
  }'
```

**Notes**:

- Always use the **root endpoint** (`http://localhost:3003/`)
- No need to add paths like `/message/send`
- `jsonrpc`, `id`, and `method` fields are required
- For structured JSON format, escape newline characters as `\n` inside JSON strings

#### Formatted Response Display

```bash
# Display formatted response
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{...}' | python3 -m json.tool
```

### Simultaneous Log and Response Monitoring

```bash
# Terminal 1: Monitor logs
tail -f /tmp/workflow.log

# Terminal 2: Send request
curl -X POST http://localhost:3000/ -H "Content-Type: application/json" -d '{...}'
```

---

## Troubleshooting Checklist

### Server Startup

- [ ] JSON file syntax is correct
- [ ] Required environment variables (OPENAI_API_KEY, etc.) are set
- [ ] Port is available
- [ ] TypeScript is compiled (`out/` directory exists)

### Workflow Execution

- [ ] Log file is generated
- [ ] Nodes execute in order
- [ ] Conditional routing works correctly
- [ ] Tools execute normally
- [ ] Error messages output to logs

### Debugging

- [ ] Appropriate logs added to each node
- [ ] Message structure verified in logs
- [ ] Conditional routing evaluation results verified in logs
- [ ] Tool execution results verified in logs

---

## Supporting Multiple Input Formats

### Phase 8: quality-evaluation Input Format Improvements

The quality-evaluation server supports two different input formats:

#### Format 1: Structured JSON

When clients send structured JSON data:

```json
{
  "originalRequest": "Please research Yazaki Corporation",
  "researchResults": [
    {
      "taskId": 1,
      "objective": "Company overview research",
      "findings": "Yazaki Corporation was founded in 1941...",
      "sources": ["https://www.yazaki-group.com"]
    }
  ],
  "totalResults": 1
}
```

**Processing**: Extract `originalRequest` and `researchResults` array via JSON parsing

#### Format 2: Natural Language

Reports written in markdown or plain text:

```text
Please evaluate the quality of the following research results:

1. **Company Overview Report**: Yazaki Corporation was founded in 1941...
2. **Product Service List**: In automotive business, wiring components...
```

**Processing**: Treat entire text as single research result and convert to `researchResults` array

### Implementation Method

The JSON parsing section in quality-evaluation.json handles both formats:

```javascript
try {
  console.log('\\n🔍 Starting JSON parsing...');

  const jsonMatch = userContent.match(/\\{[\\s\\S]*\\}/);

  if (jsonMatch) {
    // JSON format case
    console.log('  ✓ JSON section detected');
    let evaluationData = JSON.parse(jsonMatch[0]);
    originalRequest = evaluationData.originalRequest || '';
    researchResults = evaluationData.researchResults || [];
  } else {
    // ★ Natural language format case
    console.log('  ✓ Natural language format detected');
    console.log('  Processing entire text as single research result');

    // Extract user request
    const requestMatch = userContent.match(/^([^\\n:：]+)[：:]/);
    if (requestMatch) {
      originalRequest = requestMatch[1].trim();
    } else {
      originalRequest = 'Research results quality evaluation';
    }

    // Treat entire text as single research result
    researchResults = [{
      taskId: 1,
      objective: 'Comprehensive research report',
      findings: userContent,
      sources: [],
      format: 'natural_language'
    }];

    console.log('  ✅ Converted natural language text to research result');
  }
} catch (e) {
  // Fallback processing
  console.error('\\n❌ JSON parsing error:', e.message);
  originalRequest = 'Text parsing error';
  researchResults = [{
    taskId: 1,
    objective: 'Error recovery',
    findings: userContent,
    sources: []
  }];
}
```

### Testing Methods

#### Test 1: Natural Language Format

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "test-natural-001",
        "parts": [{
          "kind": "text",
          "text": "Please evaluate the quality of the following research results:\n\n1. **Company Overview**: Yazaki Corporation was founded in 1941...\n2. **Product Information**: Main product is wire harnesses..."
        }]
      },
      "contextId": "test-natural"
    }
  }'
```

**Expected Logs**:

```text
🔍 Starting JSON parsing...
  ✓ Natural language format detected
  Processing entire text as single research result
  Extracted user request: Please evaluate the quality of the following research results
  ✅ Converted natural language text to research result

📋 Parsing Results Summary:
  Research results count: 1    ← Not 0!

✅ Evaluation result parsing successful
  Quality Score: 85
```

#### Test 2: JSON Format

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "test-json-001",
        "parts": [{
          "kind": "text",
          "text": "{\"originalRequest\": \"Research Yazaki Corporation\", \"researchResults\": [{\"taskId\": 1, \"objective\": \"Company overview\", \"findings\": \"Yazaki Corporation was founded in 1941...\", \"sources\": [\"https://www.yazaki-group.com\"]}], \"totalResults\": 1}"
        }]
      },
      "contextId": "test-json"
    }
  }'
```

**Expected Logs**:

```text
🔍 Starting JSON parsing...
  ✓ JSON section detected
  ✓ evaluationData parsing successful
  ✅ Using research results directly: 1 items

📋 Parsing Results Summary:
  Research results count: 1

✅ Evaluation result parsing successful
  Quality Score: 75
```

### Troubleshooting

#### Issue: `researchResults.length === 0`

**Symptoms**:

```text
⚠️  Warning: No research results found
Returning fallback response
```

**Causes**:

- Neither JSON format nor processed as natural language format
- `researchResults` remains empty array in `else` block

**Solution**:

Modified through Phase 8 implementation to convert natural language text to `researchResults` array in `else` block.

#### Issue: JSON Parsing Error

**Symptoms**:

```text
❌ JSON parsing error: Unexpected token
```

**Causes**:

- Control characters (newlines, tabs, etc.) in JSON string not properly escaped

**Solution**:

Control character escaping processing implemented in Phase 7:
```javascript
try {
  evaluationData = JSON.parse(jsonStr);
} catch (parseError) {
  console.log('  ⚠️ Standard JSON.parse failed, attempting string correction');

  // Escape control characters
  jsonStr = jsonStr.replace(/"([^"]*)"/g, (match, content) => {
    const escaped = content
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  });

  evaluationData = JSON.parse(jsonStr);
}
```

### System Prompt Updates

The quality-evaluation system prompt specifies support for both input formats:

```json
{
  "systemPrompt": "You are an agent specialized in quality evaluation and report creation for market research.

【Input Formats】
This agent supports two input formats:

1. Structured JSON format:
   - originalRequest: Original user request
   - researchResults: Structured research results array
   - Each result includes taskId, objective, findings, sources

2. Natural language format:
   - Research reports written in markdown or plain text
   - Does not contain structured data
   - Analyze and evaluate entire text

【Evaluation Methods】
- JSON format: Evaluate each research result individually and check completeness
- Natural language format: Evaluate overall text quality, structure, and content depth
- For both formats, generate quality score and executive summary"
}
```

---

## Reference Links

- [CLAUDE.md](../CLAUDE.md) - Project overview
- [Phase 7 Documentation](refactoring/mcp-connection-fix/phase7-workflow-redesign.md) - Workflow redesign details
- [Phase 8 Documentation](refactoring/mcp-connection-fix/phase8-quality-evaluation-input-format.md) - Input format improvement details
- [research-execution.json](../json/a2a/servers/research-execution.json) - Implementation example
- [quality-evaluation.json](../json/a2a/servers/quality-evaluation.json) - Multiple input format support implementation example

---

**Last Updated**: 2026-01-05 (Phase 8 completed)
