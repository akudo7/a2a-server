// src/main.ts
import path from "path";
import * as dotenv from "dotenv";
import { WorkflowEngine } from "./SceneGraphManager/lib/index.js";
import { WorkflowConfig } from "./SceneGraphManager/types/index.js";
import { readFileSync, existsSync } from "fs";
import { A2AEndpoint } from "./SceneGraphManager/a2a/A2AEndpoint.js";
import { fileURLToPath } from "url";

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
 * JSONファイルパスからPNGファイル名を生成
 */
const getPngFileName = (jsonPath: string): string => {
	const fileName = path.basename(jsonPath, ".json");
	return `${fileName}.png`;
};

/**
 * メイン実行関数
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

		// グラフの可視化を生成（エラーハンドリング追加）
		/*
        try {
            const pngFileName = getPngFileName(configPath);
            await workflow.drawGraph(pngFileName);
            console.log(`Graph visualization saved as: ${pngFileName}`);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            console.warn(
                `⚠️  Graph visualization failed (non-critical): ${errorMessage}`
            );
            console.log(`Continuing with server startup...`);
        }
        */

		// A2AEndpointの設定
		const agentName =
			workflowConfig.config?.a2aEndpoint?.name ||
			workflowConfig.config?.name ||
			"WorkflowAgent";
		const agentDescription =
			workflowConfig.config?.a2aEndpoint?.description ||
			workflowConfig.config?.description ||
			"A workflow agent that processes tasks through multiple steps";
		const port = workflowConfig.config?.a2aEndpoint?.port || 3000;

		console.log(`Agent Name: ${agentName}`);
		console.log(`Agent Description: ${agentDescription}`);
		console.log(`Port: ${port}`);

		// A2AEndpoint作成
		const a2aEndpoint = new A2AEndpoint({
			name: agentName,
			description: agentDescription,
			agentCard: {
				name: agentName,
				description: agentDescription,
				version: "1.0.0",
				url: "", // Will be set by the endpoint
				capabilities: {
					streaming: false,
					pushNotifications: false,
					stateTransitionHistory: true,
				},
				skills: [],
			},
			port: port,
			executor: async (input: string, sessionId?: string): Promise<any> => {
				// ... existing executor code
			},
		});

		console.log(`\nStarting A2A Endpoint on port ${port}...`);
		console.log(
			`Agent discovery endpoint: http://localhost:${port}/.well-known/agent.json`
		);
		console.log(`JSON-RPC endpoint: http://localhost:${port}/jsonrpc`);

		// サーバー起動 - 修正: a2aEndpointを使用
		a2aEndpoint.run(port);

		// プロセス終了時のハンドリング
		process.on("SIGINT", () => {
			console.log("\n\nReceived SIGINT. Shutting down gracefully...");
			process.exit(0);
		});

		process.on("SIGTERM", () => {
			console.log("\n\nReceived SIGTERM. Shutting down gracefully...");
			process.exit(0);
		});
	} catch (error) {
		console.error(`\n=== Server Startup Error ===`);
		console.error("Error details:", error);
		throw error;
	}
}

/**
 * コマンドライン引数の処理
 */
function parseArguments(): string {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error("Usage: yarn server <config-file-path>");
		console.error("Example: yarn server ./research/main.json");
		process.exit(1);
	}

	if (args[0] === "--help" || args[0] === "-h") {
		console.log("A2A Server - Agent-to-Agent Protocol Server");
		console.log("");
		console.log("Usage: yarn server <config-file-path>");
		console.log("");
		console.log("Arguments:");
		console.log("  config-file-path    Path to the JSON configuration file");
		console.log("");
		console.log("Examples:");
		console.log("  yarn server ./research/main.json");
		console.log("  yarn server /absolute/path/to/config.json");
		console.log("  yarn server research/subagents/task-creation.json");
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
