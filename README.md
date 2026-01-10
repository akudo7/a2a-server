# A2A Protocol Server

A production-ready **Agent-to-Agent (A2A) Protocol Server** that implements Google's A2A Protocol v0.3.0 with dual protocol support (HTTP REST + JSON-RPC 2.0). Built on top of **SceneGraphManager v2.0.0** (private package), a JSON-driven AI workflow engine that executes LangChain-based workflows from declarative configuration files.

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

- Node.js 22+
- Yarn (this project uses Yarn, not npm)
- API keys for LLM providers (OpenAI, Anthropic, etc.)
- SceneGraphManager v2.0.0 package (included via local tarball)

### Installation

```bash
# Clone the repository
git clone https://github.com/akudo7/a2a-server.git
cd a2a-server

# Install dependencies (Yarn required)
yarn install

# Configure environment variables
cp .env.example .env
# Edit .env and add your API keys
```

### Running the Server

```bash
# Run with a workflow configuration
yarn server json/a2a/servers/task-creation.json

# Or use predefined scripts
yarn server:main           # Main research workflow
yarn server:task           # Task creation subagent
yarn server:research       # Research execution subagent
yarn server:quality        # Quality evaluation subagent

# Development mode with hot reload
yarn server:dev json/a2a/servers/task-creation.json

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
        "messageId": "msg-test-001",
        "parts": [
          {
            "kind": "text",
            "text": "Please research Google's company overview"
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
    "result": "Research results text...",
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
          "text": "Please research the given topic"
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

# Tavily (for web search)
TAVILY_API_KEY=...

# LangChain (optional)
LANGCHAIN_VERBOSE=false
```

### Workflow Configuration

Workflows are defined in JSON files. For detailed JSON workflow file format specification and examples, please refer to **[OpenAgentJson](https://github.com/akudo7/OpenAgentJson)** documentation.

**Quick Example:**

```json
{
  "config": {
    "recursionLimit": 100,
    "a2aEndpoint": {
      "port": 3001,
      "agentCard": {
        "name": "TaskCreationAgent",
        "description": "Task creation agent for research planning",
        "supportedMessageFormats": ["text/plain", "application/json"]
      }
    }
  },
  "models": [
    {
      "id": "taskModel",
      "type": "OpenAI",
      "config": {
        "model": "gpt-4o-mini",
        "temperature": 0.7
      },
      "systemPrompt": "You are an agent specialized in creating market research tasks..."
    }
  ],
  "stateAnnotation": {
    "name": "AgentState",
    "type": "Annotation.Root"
  },
  "annotation": {
    "messages": {
      "type": "BaseMessage[]",
      "reducer": "(x, y) => x.concat(y)",
      "default": []
    },
    "taskList": {
      "type": "any[]",
      "reducer": "(x, y) => y",
      "default": []
    }
  },
  "nodes": [
    {
      "id": "task_creator",
      "handler": {
        "parameters": [
          {
            "name": "state",
            "parameterType": "state",
            "stateType": "typeof AgentState.State"
          },
          {
            "name": "model",
            "parameterType": "model",
            "modelRef": "taskModel"
          }
        ],
        "function": "// Node implementation..."
      }
    }
  ],
  "edges": [
    { "from": "__start__", "to": "task_creator" },
    { "from": "task_creator", "to": "__end__" }
  ],
  "stateGraph": {
    "annotationRef": "AgentState",
    "config": {
      "checkpointer": {
        "type": "MemorySaver"
      }
    }
  }
}
```

**Full examples available in:** [kudosflow2](https://github.com/akudo7/kudosflow) repository

- [task-creation.json](https://github.com/akudo7/kudosflow/blob/main/json/research/task-creation.json) - Task creation agent
- [research-execution.json](https://github.com/akudo7/kudosflow/blob/main/json/research/research-execution.json) - Research execution agent
- [quality-evaluation.json](https://github.com/akudo7/kudosflow/blob/main/json/research/quality-evaluation.json) - Quality evaluation agent

**For complete documentation**, see [OpenAgentJson](https://github.com/akudo7/OpenAgentJson).

## Key Components

### Server Layer ([src/server.ts](src/server.ts))

- **SimpleExecutionEventBus** (lines 30-56): Custom event bus for JSON-RPC response collection
- **AgentExecutor**: Implements workflow execution and task management
- **Dual Protocol Handlers**: HTTP REST + JSON-RPC 2.0 endpoints
- **DefaultRequestHandler**: A2A SDK's standard request handler
- **InMemoryTaskStore**: Task state management

### WorkflowEngine (SceneGraphManager v2.0.0)

The workflow engine uses **SceneGraphManager v2.0.0** (private package):

- Loads and validates JSON workflow configurations
- Builds LangGraph state machines
- Manages model initialization (OpenAI, Anthropic, Ollama)
- Configures MCP servers and A2A servers
- Executes workflows with checkpointing

**Learn more**: See [OpenAgentJson](https://github.com/akudo7/OpenAgentJson) for JSON workflow file format documentation

### Multi-Agent Communication

Workflows can communicate with other A2A agents:

1. Define A2A servers in the `a2aServers` section
2. Bind servers to models via `bindA2AServers`
3. Use generated tools in workflow nodes: `send_message_to_agentName()`

## Development

### Project Structure

```text
a2a-server/
├── src/
│   └── server.ts             # Main server implementation
├── .env.example              # Environment variables example
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── LICENSE                   # MIT License
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

For comprehensive debugging guidance, see the [JSON Workflow Debugging Guide](json-workflow-debugging.md).

Quick debugging tips:

```bash
# Enable verbose logging
export DEBUG=true
export LANGCHAIN_VERBOSE=true

# Or in .env file
DEBUG=true
LANGCHAIN_VERBOSE=true

# Monitor logs in real-time
tail -f /tmp/workflow.log

# Check specific node execution
grep "NodeName" /tmp/workflow.log
```

The debugging guide covers:

- Basic debugging workflow and log monitoring
- Common issues and solutions (server won't start, tools not executing, infinite loops)
- Adding console.log statements to workflow nodes
- Debugging conditional routing and tool execution
- Testing with JSON-RPC 2.0 format
- Supporting multiple input formats

For detailed examples and troubleshooting, refer to [json-workflow-debugging.md](json-workflow-debugging.md).

## API Reference

### JSON-RPC Methods

#### message/send

Send a message to the agent and execute the workflow.

**Request Format:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "messageId": "msg-unique-id",
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

**Example using curl:**

```bash
curl -X POST http://localhost:3001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-001",
        "parts": [
          {
            "kind": "text",
            "text": "Please research Google company overview"
          }
        ]
      },
      "contextId": "session-001"
    }
  }'
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

**Request Format:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "agent/getAuthenticatedExtendedCard",
  "params": {}
}
```

**Example using curl:**

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

## Documentation & Resources

- **[OpenAgentJson](https://github.com/akudo7/OpenAgentJson)** - JSON workflow file format documentation and examples
- **[kudosflow2](https://github.com/akudo7/kudosflow)** - Complete multi-agent research system sample
- **[A2A Protocol Spec](https://google-a2a.github.io/A2A)** - Official protocol documentation
- **[LangGraph](https://langchain-ai.github.io/langgraph/)** - Workflow orchestration framework
- **[A2A SDK](https://github.com/google/a2a-sdk)** - A2A JavaScript SDK

## Related Projects

This server is part of a larger AI agent ecosystem:

- **SceneGraphManager v2.0.0** - Core JSON workflow engine (private package)
- **[OpenAgentJson](https://github.com/akudo7/OpenAgentJson)** - JSON workflow file format documentation
- **[kudosflow2](https://github.com/akudo7/kudosflow)** - Complete multi-agent research system

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright (c) 2026 Akira Kudo

**Third-Party Components:**

This project includes the SceneGraphManager v2.0.0 component (private package), which has separate licensing terms:

- Free for use within this a2a-server project
- Commercial use outside of this project requires a separate license
- For licensing inquiries, contact: [Akira Kudo](https://www.linkedin.com/in/akira-kudo-4b04163/)

See the [LICENSE](LICENSE) file for complete details.

## Support

For issues and questions:

- Review [OpenAgentJson documentation](https://github.com/akudo7/OpenAgentJson) for JSON workflow file format specification
- Check [kudosflow2 sample](https://github.com/akudo7/kudosflow) for multi-agent system examples
- Review server logs for error details
- Verify environment variables and configuration files
- Test with simple workflows first
- Submit issues on [GitHub](https://github.com/akudo7/a2a-server/issues)

---

**Built with:**

- [Express.js](https://expressjs.com/) - Web framework
- [A2A SDK](https://github.com/google/a2a-sdk) - Protocol implementation
- [LangGraph](https://langchain-ai.github.io/langgraph/) - Workflow orchestration
- [TypeScript](https://www.typescriptlang.org/) - Type-safe development
