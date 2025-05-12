import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';

// Server configuration
const serverScriptPath = path.resolve(__dirname, './server.ts');
const serverReadyMessage = "[Server] SSE server listening on port 3001";
const serverUrl = 'http://localhost:3001/sse';
let serverProcess: ChildProcessWithoutNullStreams | null = null;

/**
 * Start the MCP server and wait for it to be ready
 * @returns Promise that resolves when the server is ready
 */
export const startMcpServer = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        console.log(`Starting MCP server with tsx: ${serverScriptPath}...`);
        
        // Use tsx to run the TypeScript file directly
        serverProcess = spawn('npx', ['tsx', serverScriptPath], { shell: false });
        
        let output = '';
        const onData = (data: Buffer) => {
            const message = data.toString();
            output += message;
            console.log(`[Server Output]: ${message.trim()}`);
            if (message.includes(serverReadyMessage)) {
                console.log("MCP server is ready.");
                // Clean up listeners immediately after resolving
                serverProcess!.stdout.removeListener('data', onData);
                serverProcess!.stderr.removeListener('data', onData);
                resolve();
            }
        };

        serverProcess.stdout.on('data', onData);
        serverProcess.stderr.on('data', onData);

        serverProcess.on('error', (err) => {
            console.error('Failed to start MCP server process:', err);
            reject(err);
        });

        serverProcess.on('close', (code) => {
            console.log(`MCP server process exited with code ${code}`);
            // If server exits before ready, reject
            if (!output.includes(serverReadyMessage)) {
                reject(new Error(`Server process exited prematurely (code ${code}) before ready signal. Output:\n${output}`));
            }
        });

        // Timeout for server readiness
        const timeout = setTimeout(() => {
            reject(new Error(`Server readiness timeout (${serverReadyMessage})`));
            if (serverProcess) serverProcess.kill();
        }, 20000); // 20 second timeout

        // Clear timeout once resolved
        const originalResolve = resolve;
        resolve = () => {
            clearTimeout(timeout);
            originalResolve();
        };
    });
};

/**
 * Stop the MCP server
 */
export const stopMcpServer = (): Promise<void> => {
    return new Promise((resolve) => {
        console.log("Stopping MCP server...");
        if (serverProcess && !serverProcess.killed) {
            const killed = serverProcess.kill(); // Use SIGTERM by default
            console.log(`MCP server process kill signal sent: ${killed}`);
        } else {
            console.log("MCP server process already stopped or not started.");
        }
        // Add a small delay to allow server to shut down
        setTimeout(resolve, 500);
    });
};

// Export server URL for tests to use
export { serverUrl }; 