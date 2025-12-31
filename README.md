# A2A Protocol Server

A production-ready **Agent-to-Agent (A2A) Protocol Server** that implements Google's A2A Protocol v0.3.0 with dual protocol support (HTTP REST + JSON-RPC 2.0). Built on top of **SceneGraphManager**, a JSON-driven AI workflow engine that executes LangChain-based workflows from declarative configuration files.

## Features

✅ **Dual Protocol Support**

- HTTP REST API (A2A Protocol v0.3.0)
- JSON-RPC 2.0 (Claude Desktop & A2A SDK compatible)

✅ **Workflow Engine**

- JSON-driven workflow configuration
- LangGraph state machine execution
- Multi-model support (OpenAI, Anthropic, Ollama)
- MCP server integration
- Inter-agent communication (A2A clients)

✅ **Production Ready**

- Task lifecycle management
- Cancellation support
- Checkpointing for conversation persistence
- Comprehensive error handling
- Graceful shutdown

## Quick Start

### Prerequisites

- Node.js 18+
- Yarn or npm
- API keys for LLM providers (OpenAI, Anthropic, etc.)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd server

# Install dependencies
yarn install

# Configure environment variables
cp .env.example .env
# Edit .env and add your API keys
```

### Running the Server

```bash
# Run with a workflow configuration
yarn server json/SceneGraphManager/research/task-creation.json

# Or use predefined scripts
yarn server:main           # Main research workflow
yarn server:task           # Task creation subagent
yarn server:research       # Research execution subagent
yarn server:quality        # Quality evaluation subagent

# Development mode with hot reload
yarn server:dev json/path/to/config.json

# Show help
yarn server --help
```

## Architecture

### Dual Protocol Access

The server provides two ways to interact with workflows:

#### 1. HTTP REST API (A2A Protocol v0.3.0)

Standard A2A Protocol endpoints:

- `GET /.well-known/agent.json` - Agent card information
- `POST /message/send` - Send message to agent
- `GET /tasks/{taskId}` - Query task status
- `POST /tasks/{taskId}/cancel` - Cancel running task
- `GET /health` - Health check

#### 2. JSON-RPC 2.0 (Claude Desktop & A2A SDK)

JSON-RPC endpoint for programmatic access:

- `POST /` - JSON-RPC 2.0 endpoint
- Methods: `message/send`, `agent/getAuthenticatedExtendedCard`
- Standard error codes: -32601, -32602, -32603

### Request Flow

```text
JSON-RPC Client → POST / → AgentExecutor → WorkflowEngine
                                                ↓
                                         LangGraph State Machine
                                                ↓
                                    FunctionNodes + ToolNodes
                                                ↓
                                    LLM Models + MCP + A2A Tools
```

## Testing

### JSON-RPC Testing

Start the server:

```bash
yarn server json/SceneGraphManager/research/task-creation.json
```

Send a test request:

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
            "text": "矢崎総業の会社概要について調査してください"
          }
        ]
      },
      "contextId": "test-session-001"
    }
  }'
```

Expected response:

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

### HTTP REST API Testing

```bash
# Get agent card
curl http://localhost:3001/.well-known/agent.json

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

# Health check
curl http://localhost:3001/health
```

### Pretty Print with jq

```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"agent/getAuthenticatedExtendedCard","params":{}}' \
  | jq '.'
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Azure OpenAI (optional)
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_API_INSTANCE_NAME=...
AZURE_OPENAI_API_DEPLOYMENT_NAME=...
AZURE_OPENAI_API_VERSION=...

# Google (optional)
GOOGLE_API_KEY=...

# Tavily (for web search)
TAVILY_API_KEY=...

# LangChain (optional)
LANGCHAIN_VERBOSE=false
```

### Workflow Configuration

Workflows are defined in JSON files with this structure:

```json
{
  "stateAnnotation": {
    "name": "ResearchState",
    "type": "Annotation.Root"
  },
  "annotation": {
    "messages": {
      "type": "array",
      "reducer": "addMessages",
      "default": []
    }
  },
  "config": {
    "name": "ResearchAgent",
    "description": "An agent that performs research tasks",
    "recursionLimit": 50,
    "a2aEndpoint": {
      "port": 3001,
      "name": "ResearchAgent",
      "description": "Research workflow agent"
    }
  },
  "models": [
    {
      "id": "main",
      "type": "anthropic",
      "config": {
        "model": "claude-3-5-sonnet-20241022",
        "temperature": 0.7
      },
      "bindMcpServers": ["brave-search"],
      "bindA2AClients": ["task-creator"]
    }
  ],
  "nodes": [
    {
      "id": "research",
      "function": {
        "parameters": ["state", "model"],
        "output": "messages",
        "implementation": "// Node implementation..."
      }
    }
  ],
  "edges": [
    { "from": "START", "to": "research", "type": "normal" },
    { "from": "research", "to": "END", "type": "normal" }
  ],
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"]
    }
  },
  "a2aClients": {
    "task-creator": {
      "cardUrl": "http://localhost:3002/.well-known/agent.json",
      "timeout": 30000
    }
  }
}
```

## Key Components

### Server Layer ([src/server.ts](src/server.ts))

- **SimpleExecutionEventBus** (lines 30-56): Custom event bus for JSON-RPC response collection
- **AgentExecutor**: Implements workflow execution and task management
- **Dual Protocol Handlers**: HTTP REST + JSON-RPC 2.0 endpoints
- **DefaultRequestHandler**: A2A SDK's standard request handler
- **InMemoryTaskStore**: Task state management

### WorkflowEngine (SceneGraphManager)

The workflow engine is a symlinked module that:

- Loads and validates JSON workflow configurations
- Builds LangGraph state machines
- Manages model initialization (OpenAI, Anthropic, Ollama)
- Configures MCP servers and A2A clients
- Executes workflows with checkpointing

### Multi-Agent Communication

Workflows can communicate with other A2A agents:

1. Define A2A clients in the `a2aClients` section
2. Bind clients to models via `bindA2AClients`
3. Use generated tools in workflow nodes: `send_message_to_agentName()`

## Development

### Project Structure

```text
server/
├── src/
│   ├── server.ts              # Main server implementation
│   └── SceneGraphManager/     # Symlinked workflow engine
├── json/                      # Workflow configuration files (symlinked)
├── dist/                      # Compiled JavaScript
├── .env                       # Environment variables (not committed)
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── CLAUDE.md                 # Detailed developer guide
└── README.md                 # This file
```

### Build Commands

```bash
# Build TypeScript
yarn build

# Development mode (hot reload)
yarn server:dev <config-file>

# Run built server
node dist/server.js <config-file>
```

### Adding a New Workflow

1. Create a JSON configuration file in `json/` directory
2. Define state annotation and fields
3. Configure models with tool bindings
4. Implement workflow nodes
5. Define edges for routing
6. Add npm script to `package.json` (optional)
7. Test with `yarn server:dev path/to/config.json`

### Debugging

Enable verbose logging:

```bash
# Set environment variable
export DEBUG=true

# Or in .env file
DEBUG=true
LANGCHAIN_VERBOSE=true
```

Check server logs for detailed execution traces.

## API Reference

### JSON-RPC Methods

#### message/send

Send a message to the agent and execute the workflow.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "parts": [
        {
          "kind": "text",
          "text": "Your message here"
        }
      ]
    },
    "contextId": "session-id"
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "taskId": "task-xxx",
    "result": "Agent response text",
    "thread_id": "session-id"
  }
}
```

#### agent/getAuthenticatedExtendedCard

Get agent card information.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "agent/getAuthenticatedExtendedCard",
  "params": {}
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "name": "AgentName",
    "description": "Agent description",
    "protocolVersion": "0.3.0",
    "version": "1.0.0",
    "url": "http://localhost:3001/",
    "defaultInputModes": ["text/plain"],
    "defaultOutputModes": ["text/plain"],
    "capabilities": {
      "streaming": false,
      "pushNotifications": false,
      "stateTransitionHistory": true
    },
    "skills": []
  }
}
```

## Error Handling

### JSON-RPC Error Codes

- `-32601` - Method not found
- `-32602` - Invalid params (missing or malformed)
- `-32603` - Internal error (workflow execution failure)

### HTTP Status Codes

- `200` - Success
- `400` - Bad request (invalid message format)
- `404` - Resource not found
- `500` - Internal server error

### Common Issues

#### Port Already in Use (EADDRINUSE)

```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>

# Or change port in config
```

#### Missing API Keys

Ensure all required API keys are set in `.env` file.

#### Configuration Errors

Validate JSON configuration files for syntax errors and required fields.

## Related Documentation

- **[CLAUDE.md](CLAUDE.md)** - Detailed developer guide
- **[A2A Protocol Spec](https://google-a2a.github.io/A2A)** - Official protocol documentation
- **[LangGraph](https://langchain-ai.github.io/langgraph/)** - Workflow engine documentation
- **[A2A SDK](https://github.com/google/a2a-sdk)** - A2A JavaScript SDK

## Contributing

This server is part of the larger kudos-cli ecosystem:

- Parent project: `../../kudos-cli/`
- Shared SceneGraphManager library
- Shared workflow configurations
- Multiple coordinated agents

## License

[Your License Here]

## Support

For issues and questions:

- Check [CLAUDE.md](CLAUDE.md) for detailed documentation
- Review server logs for error details
- Verify environment variables and configuration files
- Test with simple workflows first

---

**Built with:**

- [Express.js](https://expressjs.com/) - Web framework
- [A2A SDK](https://github.com/google/a2a-sdk) - Protocol implementation
- [LangGraph](https://langchain-ai.github.io/langgraph/) - Workflow orchestration
- [TypeScript](https://www.typescriptlang.org/) - Type-safe development
