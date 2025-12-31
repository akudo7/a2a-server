# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **A2A (Agent-to-Agent) Protocol Server** that implements Google's A2A Protocol v0.3.0 for inter-agent communication. The server is built on top of **SceneGraphManager**, a JSON-driven AI workflow engine that executes LangChain-based workflows from declarative configuration files.

### Key Concepts

- **SceneGraphManager**: A TypeScript library that converts JSON workflow configurations into executable LangGraph state machines
- **WorkflowEngine**: The core orchestrator that builds and executes workflows from WorkflowConfig JSON
- **A2A Protocol**: Enables agents to communicate and collaborate through standard REST endpoints
- **Multi-Agent Workflows**: Workflows can invoke other A2A agents via A2AClient tools injected into the graph

## Development Commands

### Build & Run

```bash
# Build TypeScript to JavaScript
yarn build

# Run the A2A server (requires config file)
yarn server <config-file-path>

# Development mode (with tsx hot reload)
yarn server:dev <config-file-path>
```

### Example Server Commands

```bash
# Run with specific workflow configurations
yarn server:main           # Main research workflow
yarn server:task           # Task creation subagent
yarn server:research       # Research execution subagent
yarn server:quality        # Quality evaluation subagent

# Run with custom configuration
yarn server ./json/research/main.json
yarn server /absolute/path/to/config.json
```

### Help Command

```bash
yarn server --help
```

## Architecture

### Request Flow

The server supports **dual protocol access** for maximum compatibility:

```
HTTP REST API:
A2A Client → Express Routes → DefaultRequestHandler → A2AEndpoint
                                                           ↓
                                                    WorkflowEngine.invoke()
                                                           ↓
                                           CompiledStateGraph (LangGraph)
                                                           ↓
                                    Nodes (FunctionNodes + ToolNodes)
                                                           ↓
                              Models (OpenAI/Anthropic/Ollama) + Tools (MCP + A2A)

JSON-RPC 2.0:
JSON-RPC Client → POST / → AgentExecutor → WorkflowEngine.invoke() → Result
```

### Core Components

#### 1. Server Layer ([server.ts](src/server.ts))

- **Dual Protocol Support**: HTTP REST API + JSON-RPC 2.0
- **HTTP REST API**: A2A Protocol v0.3.0 compliant endpoints
  - `GET /.well-known/agent.json` - Agent card information
  - `POST /message/send` - Send message to agent
  - `GET /tasks/{taskId}` - Query task status
  - `POST /tasks/{taskId}/cancel` - Cancel running task
  - `GET /health` - Server health check
- **JSON-RPC 2.0**: Standard protocol used by Claude Desktop and A2A SDK
  - `POST /` - JSON-RPC endpoint
  - Methods: `message/send`, `agent/getAuthenticatedExtendedCard`
  - Error codes: -32601 (method not found), -32602 (invalid params), -32603 (internal error)
- Uses A2A SDK's `DefaultRequestHandler` and `A2AExpressApp` for protocol compliance
- Builds `AgentCard` from WorkflowConfig's `a2aEndpoint` configuration
- Wraps WorkflowEngine in A2AEndpoint executor

#### 2. WorkflowEngine (SceneGraphManager)

The WorkflowEngine is a symlinked module (`src/SceneGraphManager -> ../../kudos-cli/src/SceneGraphManager`) that:

- Loads WorkflowConfig JSON files
- Builds LangGraph StateGraph from configuration
- Manages model initialization (OpenAI, Anthropic, Ollama)
- Configures MCP servers and A2A clients
- Executes workflows with checkpointing and recursion limits

#### 3. A2AEndpoint & SimpleExecutionEventBus

- **AgentExecutor**: Implements `AgentExecutor` interface from A2A SDK
  - Manages task lifecycle: `submitted` → `working` → `completed`/`failed`/`canceled`
  - Handles cancellation requests by tracking task IDs
  - Extracts results from various formats (direct messages, tasks, artifacts)
- **SimpleExecutionEventBus**: Custom event bus implementation (lines 30-56)
  - Extends EventEmitter to implement `ExecutionEventBus` interface
  - Collects response text from agent messages during workflow execution
  - Provides `publish()` method to collect responses
  - Provides `finished()` method to signal workflow completion
  - Provides `getResponse()` method to retrieve collected text
  - Used for JSON-RPC synchronous response collection

#### 4. ModelFactoryManager

Singleton that manages:
- Model provider factories (OpenAI, Anthropic, Ollama)
- MCP client initialization with configured servers
- A2A client creation from `a2aClients` config
- Tool binding (MCP + A2A) to models

#### 5. A2AToolGenerator

- Converts A2AClient instances into LangChain DynamicTools
- Generates tools: `send_message_to_{agentName}` and `stream_message_to_{agentName}`
- Handles flexible input formats (string, JSON, object)
- Error classification: connection_refused, timeout, 404, auth errors
- Extracts content from Message/Task/artifact responses

## WorkflowConfig JSON Structure

Workflow configurations are JSON files with this structure:

```json
{
  "stateAnnotation": {
    "name": "StateName",
    "type": "Annotation.Root"
  },
  "annotation": {
    "fieldName": {
      "type": "string|number|array|object",
      "reducer": "optional_reducer_function",
      "default": "default_value"
    }
  },
  "config": {
    "name": "AgentName",
    "description": "Agent description",
    "recursionLimit": 50,
    "eventEmitter": "on|off",
    "mcpServers": { "serverName": { "command": "...", "args": [...] } },
    "a2aEndpoint": {
      "port": 3000,
      "name": "AgentName",
      "description": "Description",
      "agentCard": { /* A2A AgentCard config */ }
    }
  },
  "models": [
    {
      "id": "modelId",
      "type": "anthropic|openai|ollama",
      "config": { "model": "model-name", "temperature": 0.7 },
      "bindMcpServers": ["serverName"],
      "bindA2AClients": ["agentName"]
    }
  ],
  "nodes": [
    {
      "id": "nodeId",
      "function": {
        "parameters": ["state", "model"],
        "output": "field1,field2",
        "implementation": "function body as string"
      }
    }
  ],
  "edges": [
    { "from": "nodeA", "to": "nodeB", "type": "normal" },
    { "from": "nodeB", "to": "END", "type": "conditional", "condition": "routing_function" }
  ],
  "stateGraph": {
    "annotationRef": "StateName"
  },
  "a2aClients": {
    "agentName": {
      "cardUrl": "http://agent-url/.well-known/agent.json",
      "timeout": 30000
    }
  }
}
```

### Key WorkflowConfig Sections

- **stateAnnotation**: Defines the LangGraph state structure
- **annotation**: State fields with types, reducers (for combining updates), and defaults
- **config**: Global settings including MCP servers, A2A endpoint config, recursion limits
- **models**: LLM provider configurations with optional tool bindings
- **nodes**: Workflow steps - either FunctionNodes (JavaScript code) or ToolNodes (external tools)
- **edges**: Connections between nodes - normal (direct) or conditional (routing logic)
- **a2aClients**: Other A2A agents this workflow can communicate with

## Configuration Files

### Required Files

- **[.env](.env)**: Environment variables for API keys (OpenAI, Anthropic, Azure, Google, Tavily)
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `AZURE_OPENAI_API_KEY` (plus instance/deployment/version configs)
  - `GOOGLE_API_KEY`
  - `TAVILY_API_KEY`
  - `LANGCHAIN_VERBOSE`

### Important Notes

- The `.env` file contains API keys and should NEVER be committed (already in [.gitignore](.gitignore))
- Configuration files are stored in `json/` directory (symlinked from parent project)
- SceneGraphManager is symlinked from `../../kudos-cli/src/SceneGraphManager`
- PNG workflow diagrams are generated alongside JSON configs

## TypeScript Configuration

- **Target**: ES2020 with Node16 module resolution
- **Output**: [dist/](dist/) directory
- **Source**: [src/](src/) directory (currently only contains [server.ts](src/server.ts))
- **JSX**: React JSX (for potential Ink CLI components)
- **Strict mode**: Enabled

## Protocol Details

### Dual Protocol Support

The server supports **two protocols** for maximum compatibility:

#### 1. HTTP REST API (A2A Protocol v0.3.0)

Standard A2A Protocol endpoints:

- `GET /.well-known/agent.json` - Returns AgentCard with capabilities, skills, version
- `POST /message/send` - Send message, returns Task or direct Message
- `GET /tasks/{taskId}` - Query task status and artifacts
- `POST /tasks/{taskId}/cancel` - Cancel running task
- `GET /tasks/{taskId}/stream` - SSE stream for task updates (if streaming enabled)
- `GET /health` - Health check with uptime and endpoint information

#### 2. JSON-RPC 2.0 (Claude Desktop & A2A SDK)

JSON-RPC endpoint at root path:

- `POST /` - JSON-RPC 2.0 endpoint

Supported methods:

- `message/send` - Send message to agent and execute workflow
  - Params: `{ message: Message, contextId?: string }`
  - Returns: `{ taskId: string, result: string, thread_id: string }`
- `agent/getAuthenticatedExtendedCard` - Get agent card information
  - Params: `{}`
  - Returns: `AgentCard`

Standard JSON-RPC error codes:

- `-32601` - Method not found
- `-32602` - Invalid params
- `-32603` - Internal error

### AgentCard Configuration

AgentCard is built from WorkflowConfig's `config.a2aEndpoint.agentCard` or defaults:

```typescript
{
  name: "AgentName",
  description: "Description",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: "http://localhost:3000/",
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: true
  },
  skills: []
}
```

### Client Communication

When workflows need to call other agents:

1. Define A2A clients in WorkflowConfig's `a2aClients` section
2. Bind clients to models via `bindA2AClients` array
3. A2AToolGenerator wraps clients as LangChain tools
4. Use tools in FunctionNodes: `await send_message_to_agentName("user message")`

## Testing

### Testing with JSON-RPC

The server supports JSON-RPC 2.0 for testing workflows. Here's how to test a workflow configuration:

#### 1. Start the Server

```bash
cd /Users/akirakudo/Desktop/MyWork/CLI/server
yarn server json/SceneGraphManager/research/task-creation.json
```

Or use a predefined script:

```bash
yarn server:task    # Task creation workflow
yarn server:main    # Main research workflow
```

#### 2. Send JSON-RPC Request with curl

```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "parts": [
          {
            "kind": "text",
            "text": "矢崎総業の会社概要、製品サービス、強み弱み、中期戦略、AIの取り組みについて調査してください。"
          }
        ]
      },
      "contextId": "test-session-001"
    }
  }'
```

#### 3. Expected Response

Success response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "taskId": "task-1234567890-abc123def",
    "result": "調査結果のテキスト...",
    "thread_id": "test-session-001"
  }
}
```

Error response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "エラーメッセージ"
  }
}
```

#### 4. Other Test Commands

Get agent card:

```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "agent/getAuthenticatedExtendedCard",
    "params": {}
  }'
```

Health check (REST API):

```bash
curl http://localhost:3001/health
```

Agent card (REST API):

```bash
curl http://localhost:3001/.well-known/agent.json
```

#### 5. Pretty Print with jq

If you have `jq` installed, you can format the output:

```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "parts": [
          {
            "kind": "text",
            "text": "矢崎総業について調査してください"
          }
        ]
      },
      "contextId": "test-session-001"
    }
  }' | jq '.'
```

### Testing with HTTP REST API

You can also test using the A2A Protocol HTTP endpoints:

```bash
# Send a message
curl -X POST http://localhost:3001/message/send \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "parts": [
        {
          "kind": "text",
          "text": "研究課題について調査してください"
        }
      ]
    },
    "sessionId": "test-session-001"
  }'
```

## Development Patterns

### Adding a New Workflow

1. Create JSON configuration file in `json/` directory
2. Define state annotation and fields with appropriate reducers
3. Configure models with necessary tool bindings (MCP + A2A)
4. Implement nodes with clear input/output contracts
5. Define edges for node routing (normal or conditional)
6. Add corresponding npm script in [package.json](package.json) if needed
7. Test with `yarn server:dev path/to/config.json`

### Modifying Server Behavior

The main server logic is in [src/server.ts](src/server.ts):

- **loadWorkflowConfig()**: Validates and loads JSON configuration
- **buildAgentCardFromConfig()**: Constructs A2A AgentCard from config
- **runA2AServer()**: Main orchestrator that ties everything together

To modify server behavior:
1. Update configuration parsing in `loadWorkflowConfig()`
2. Adjust AgentCard generation in `buildAgentCardFromConfig()`
3. Modify executor function in `runA2AServer()` to change workflow invocation
4. Rebuild: `yarn build`

### Error Handling

The server includes comprehensive error handling:
- Configuration validation (missing required fields)
- Port conflicts (EADDRINUSE)
- Workflow execution errors (caught and returned in A2A format)
- Graceful shutdown on SIGINT/SIGTERM
- Task cancellation support

## Related Documentation

- **A2A SDK Documentation**: [a2a_readme.md](a2a_readme.md) - Comprehensive guide to A2A Protocol and SDK usage
- **A2A Protocol Spec**: https://google-a2a.github.io/A2A
- **LangGraph Documentation**: https://langchain-ai.github.io/langgraph/

## Project Context

This server is part of a larger "kudos-cli" ecosystem:
- Parent project: `../../kudos-cli/`
- Shared SceneGraphManager library
- Shared JSON configuration files
- Multiple related workflows (research, task creation, quality evaluation)
