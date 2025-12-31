// src/server.ts
import path from "path";
import * as dotenv from "dotenv";
import express from "express";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { WorkflowEngine, WorkflowConfig  } from "@kudos/scene-graph-manager";

// A2A SDK imports
import type { AgentCard } from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  type AgentExecutor,
  type RequestContext,
  type ExecutionEventBus
} from "@a2a-js/sdk/server";
import {
  jsonRpcHandler,
  agentCardHandler,
  restHandler,
  UserBuilder
} from "@a2a-js/sdk/server/express";

// ES Module で __filename, __dirname を取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数の読み込み
const envPath = path.join(process.cwd(), ".env");
dotenv.config({ path: envPath });

// デバッグモードを有効化
process.env.DEBUG = process.env.DEBUG || "false";

/**
 * WorkflowConfigをロードする関数
 */
const loadWorkflowConfig = (configPath: string): WorkflowConfig => {
  try {
    // 相対パスの場合は現在のディレクトリからの絶対パスに変換
    const fullPath = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);

    // ファイルの存在確認
    if (!existsSync(fullPath)) {
      throw new Error(`Configuration file not found: ${fullPath}`);
    }

    console.log(`Loading configuration from: ${fullPath}`);
    const jsonContent = readFileSync(fullPath, "utf-8");
    const config = JSON.parse(jsonContent) as WorkflowConfig;

    // 必須フィールドの検証
    if (
      !config.stateAnnotation ||
      !config.annotation ||
      !config.nodes ||
      !config.edges
    ) {
      throw new Error(
        "Invalid workflow configuration format. Missing required fields: stateAnnotation, annotation, nodes, or edges"
      );
    }

    return config;
  } catch (error) {
    throw new Error(`Failed to load workflow configuration: ${error}`);
  }
};

/**
 * 設定ファイルからAgentCardを構築（SDK準拠）
 */
const buildAgentCardFromConfig = (
  workflowConfig: WorkflowConfig,
  port: number
): AgentCard => {
  const a2aConfig = workflowConfig.config?.a2aEndpoint;

  // 設定ファイルにagentCardがある場合はそれを基に構築
  if (a2aConfig?.agentCard) {
    const configCard = a2aConfig.agentCard;
    return {
      name: configCard.name,
      description: configCard.description,
      protocolVersion: configCard.protocolVersion || "0.3.0", // ✅ 必須プロパティ
      version: configCard.version || "1.0.0",
      url: configCard.url || `http://localhost:${port}/`,
      defaultInputModes: configCard.defaultInputModes || ["text/plain"], // ✅ 必須プロパティ
      defaultOutputModes: configCard.defaultOutputModes || ["text/plain"], // ✅ 必須プロパティ
      capabilities: {
        streaming: configCard.capabilities?.streaming || false,
        pushNotifications: configCard.capabilities?.pushNotifications || false,
        stateTransitionHistory:
          configCard.capabilities?.stateTransitionHistory || true,
      },
      skills: configCard.skills || [],
    };
  }

  // フォールバック（基本設定）
  const agentName =
    a2aConfig?.name || workflowConfig.config?.name || "WorkflowAgent";
  const agentDescription =
    a2aConfig?.description ||
    workflowConfig.config?.description ||
    "A workflow agent that processes tasks through multiple steps";

  return {
    name: agentName,
    description: agentDescription,
    protocolVersion: "0.3.0", // ✅ 必須プロパティ
    version: "1.0.0",
    url: `http://localhost:${port}/`,
    defaultInputModes: ["text/plain"], // ✅ 必須プロパティ
    defaultOutputModes: ["text/plain"], // ✅ 必須プロパティ
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: [],
  };
};

/**
 * メイン実行関数（SDK準拠）
 */
async function runA2AServer(configPath: string): Promise<void> {
  console.log(`\n=== Starting A2A Server with config: ${configPath} ===`);

  try {
    // ワークフロー設定をロード
    const workflowConfig = loadWorkflowConfig(configPath);
    console.log(`Configuration loaded successfully`);

    // WorkflowEngineを構築
    const workflow = new WorkflowEngine(workflowConfig);
    await workflow.build();
    console.log(`Workflow engine built successfully`);

    // ポート設定
    const port = workflowConfig.config?.a2aEndpoint?.port || 3000;

    // AgentCardを構築（SDK準拠）
    const agentCard = buildAgentCardFromConfig(workflowConfig, port);
    console.log(`Agent Card built:`, {
      name: agentCard.name,
      description: agentCard.description,
      protocolVersion: agentCard.protocolVersion,
      url: agentCard.url,
      skills: agentCard.skills?.length || 0,
    });

    // AgentExecutorを作成（SDK準拠）
    const agentExecutor: AgentExecutor = {
      execute: async (
        requestContext: RequestContext,
        eventBus: ExecutionEventBus
      ): Promise<void> => {
        try {
          // Extract text content from user message
          const userMessage = requestContext.userMessage;
          const textContent = userMessage.parts
            ?.filter((part: any) => part.kind === "text" || part.type === "text")
            .map((part: any) => part.text)
            .join(" ")
            .trim();

          console.log(
            `Executing workflow with input: ${textContent?.substring(0, 100)}...`
          );
          console.log(`Task ID: ${requestContext.taskId}`);
          console.log(`Context ID: ${requestContext.contextId}`);

          // LangGraph checkpointing用の設定を作成
          const config = {
            configurable: {
              thread_id: requestContext.contextId || "default",
            },
          };

          // ワークフローを実行
          const result = await workflow.invoke(
            {
              messages: [{ role: "user", content: textContent || "" }],
            },
            config
          );

          console.log(`Workflow execution completed`);
          console.log(`Result type: ${typeof result}`);

          // Extract response text from result
          let responseText: string;
          if (typeof result === "string") {
            responseText = result;
          } else if (result && typeof result === "object") {
            // Try to extract from common result formats
            if ("messages" in result && Array.isArray(result.messages)) {
              const lastMessage = result.messages[result.messages.length - 1];
              responseText =
                typeof lastMessage === "string"
                  ? lastMessage
                  : lastMessage?.content || JSON.stringify(result, null, 2);
            } else {
              responseText = JSON.stringify(result, null, 2);
            }
          } else {
            responseText = String(result);
          }

          // Publish response as Message event
          eventBus.publish({
            kind: "message",
            role: "agent",
            messageId: `msg-${Date.now()}`,
            parts: [
              {
                kind: "text",
                text: responseText,
              },
            ],
          });

          // Signal completion
          eventBus.finished();
        } catch (error) {
          console.error(`Workflow execution error:`, error);
          // Publish error and finish
          eventBus.publish({
            kind: "message",
            role: "agent",
            messageId: `error-${Date.now()}`,
            parts: [
              {
                kind: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          });
          eventBus.finished();
          throw error;
        }
      },
      cancelTask: async (
        taskId: string,
        eventBus: ExecutionEventBus
      ): Promise<void> => {
        console.log(`Task cancellation requested for: ${taskId}`);
        // Implement cancellation logic here if needed
        eventBus.finished();
      },
    };

    // SDK標準コンポーネントを使用してサーバーを構築
    const taskStore = new InMemoryTaskStore();
    const requestHandler = new DefaultRequestHandler(
      agentCard,
      taskStore,
      agentExecutor
    );

    // Create Express app with new middleware approach
    const app = express();

    // Add basic middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Add health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        name: agentCard.name,
        status: "running",
        protocolVersion: agentCard.protocolVersion,
        uptime: process.uptime(),
        endpoints: {
          agentCard: "/.well-known/agent.json",
          messageSend: "/message/send",
          tasks: "/tasks",
          jsonRpc: "/",
        },
      });
    });

    // Use new SDK middlewares
    // JSON-RPC 2.0 endpoint (root path for Claude Desktop compatibility)
    app.use(
      "/",
      jsonRpcHandler({
        requestHandler,
        userBuilder: UserBuilder.noAuthentication,
      })
    );

    // Agent card endpoint (standard A2A location)
    app.use(
      "/.well-known/agent.json",
      agentCardHandler({
        agentCardProvider: requestHandler,
      })
    );

    // REST API endpoints (A2A Protocol v0.3.0)
    app.use(
      restHandler({
        requestHandler,
        userBuilder: UserBuilder.noAuthentication,
      })
    );

    // サーバー起動
    const server = app.listen(port, () => {
      console.log(`\n🚀 A2A Server started successfully!`);
      console.log(`Port: ${port}`);
      console.log(`Agent Name: ${agentCard.name}`);
      console.log(`Protocol Version: ${agentCard.protocolVersion}`);
      console.log(`\n📡 Endpoints:`);
      console.log(`  JSON-RPC: http://localhost:${port}/ (POST)`);
      console.log(`  Agent Card: http://localhost:${port}/.well-known/agent.json`);
      console.log(`  REST API: http://localhost:${port}/v1/*`);
      console.log(`  Health Check: http://localhost:${port}/health`);
      console.log(`\n✅ Server is ready to receive A2A requests (JSON-RPC & REST)`);
    });

    // プロセス終了時のハンドリング
    const gracefulShutdown = () => {
      console.log("\n\n🛑 Shutting down gracefully...");
      server.close(() => {
        console.log("✅ Server closed successfully");
        process.exit(0);
      });
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    // エラーハンドリング
    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use`);
        console.error(
          `Please try a different port or stop the service using port ${port}`
        );
      } else {
        console.error(`❌ Server error:`, error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error(`\n=== Server Startup Error ===`);
    console.error("Error details:", error);
    throw error;
  }
}

/**
 * JSONファイルパスからPNGファイル名を生成
 */
const getPngFileName = (jsonPath: string): string => {
  const fileName = path.basename(jsonPath, ".json");
  return `${fileName}.png`;
};

/**
 * コマンドライン引数の処理
 */
function parseArguments(): string {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: yarn server <config-file-path>");
    console.error(
      "Example: yarn server ./json/SceneGraphManager/research/research-execution.json"
    );
    process.exit(1);
  }

  if (args[0] === "--help" || args[0] === "-h") {
    console.log("A2A Server - Agent-to-Agent Protocol Server (SDK Compliant)");
    console.log("");
    console.log("Usage: yarn server <config-file-path>");
    console.log("");
    console.log("Arguments:");
    console.log("  config-file-path    Path to the JSON configuration file");
    console.log("");
    console.log("Examples:");
    console.log(
      "  yarn server ./json/SceneGraphManager/research/research-execution.json"
    );
    console.log("  yarn server /absolute/path/to/config.json");
    console.log(
      "  yarn server json/SceneGraphManager/research/task-creation.json"
    );
    console.log("");
    console.log("Features:");
    console.log("  ✅ A2A Protocol v0.3.0 compliant");
    console.log(
      "  ✅ Standard endpoints (/.well-known/agent.json, /message/send, /tasks/*)"
    );
    console.log("  ✅ Task lifecycle management");
    console.log("  ✅ Cancellation support");
    console.log("  ✅ Express.js integration");
    console.log("");
    console.log(
      "The configuration file should contain a valid WorkflowConfig JSON structure."
    );
    process.exit(0);
  }

  return args[0];
}

/**
 * メイン関数
 */
async function main(): Promise<void> {
  try {
    const configPath = parseArguments();
    await runA2AServer(configPath);
  } catch (error) {
    console.error("\n=== Application Error ===");
    console.error("Error details:", error);
    process.exit(1);
  }
}

// ES Module での実行判定（require.main の代替）
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

// アプリケーションの実行
if (isMainModule) {
  main().catch((error) => {
    console.error("Application failed:", error);
    process.exit(1);
  });
}

export { runA2AServer, loadWorkflowConfig };
