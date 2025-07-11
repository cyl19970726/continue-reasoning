import { ISandbox, ShellExecutionResult, ExecutionOptions } from './interface.js';
import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Path to the Seatbelt executable on macOS
const PATH_TO_SEATBELT_EXECUTABLE = "/usr/bin/sandbox-exec";

/**
 * macOS Seatbelt sandbox implementation.
 * Uses the macOS sandbox-exec mechanism for process isolation.
 */
export class SeatbeltSandbox implements ISandbox {
  readonly type = "seatbelt";

  /**
   * Check if Seatbelt is available on this system
   */
  public static async isAvailable(): Promise<boolean> {
    if (os.platform() !== 'darwin') {
      return false;
    }

    try {
      await fs.access(PATH_TO_SEATBELT_EXECUTABLE, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async executeSecurely(
    command: string,
    options?: ExecutionOptions
  ): Promise<ShellExecutionResult> {
    // Verify that we're on macOS
    if (os.platform() !== 'darwin') {
      throw new Error('SeatbeltSandbox is only available on macOS');
    }
    
    console.log('SeatbeltSandbox: Using macOS Seatbelt (sandbox-exec).');
    let tempProfilePath: string | undefined;
    const effectiveCwd = options?.cwd || process.cwd();

    try {
      // Ensure effectiveCwd is writable if it's not already covered by writablePaths
      const allEffectiveWritablePaths = [...new Set([...(options?.writablePaths || []), effectiveCwd])];
      
      // Generate the Seatbelt profile
      const profileContent = this.generateSeatbeltProfile(allEffectiveWritablePaths, options?.allowNetwork);
      
      // Write the profile to a temporary file
      tempProfilePath = path.join(os.tmpdir(), `hhh-agent-sb-profile-${Date.now()}.sb`);
      await fs.writeFile(tempProfilePath, profileContent);
      
      // Build the sandboxed command
      const sandboxedCommand = `${PATH_TO_SEATBELT_EXECUTABLE} -f "${tempProfilePath}" ${command}`;
      console.log(`Executing with Seatbelt profile (${tempProfilePath}): ${sandboxedCommand}`);
      
      // Execute the command
      const execOptions: ExecOptions = { 
        cwd: effectiveCwd, 
        timeout: options?.timeout || 60000,
        env: options?.env ? { ...process.env, ...options.env } : process.env,
      };
      const { stdout, stderr } = await execAsync(sandboxedCommand, execOptions);
      return { stdout, stderr, exitCode: 0 };

    } catch (error: any) {
      console.error('SeatbeltSandbox error:', error);
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || `Seatbelt execution failed: ${error.message}`,
        exitCode: typeof error.code === 'number' ? error.code : 1,
        error: new Error(`Seatbelt execution failed: ${error.message || error.stderr || error.stdout}`),
      };
    } finally {
      // Clean up the temporary profile file
      if (tempProfilePath) {
        try {
          await fs.unlink(tempProfilePath);
        } catch (cleanupError) {
          console.error(`Failed to clean up Seatbelt profile ${tempProfilePath}:`, cleanupError);
        }
      }
    }
  }

  /**
   * Generate a Seatbelt profile with the given writable paths
   */
  private generateSeatbeltProfile(
    writablePaths: string[] = [],
    allowNetwork: boolean = false
  ): string {
    let profile = BASE_MACOS_SEATBELT_PROFILE;

    if (writablePaths.length > 0) {
      profile += "\n\n; Dynamically allowed writable paths\n";
      const writablePathRules = writablePaths.map(p => {
        const escapedPath = this.escapePathForScheme(p);
        // Allow write, create, delete, rename, etc., within these subpaths
        return `(allow file-write* (subpath "${escapedPath}"))`;
      }).join("\n");
      profile += writablePathRules;
    }

    if (allowNetwork) {
      profile += `
; Allow network access (use with caution)
(allow network-outbound (remote ip "*:*")) ; Allows all outgoing connections
(allow system-socket)
`;
    } else {
      profile += `
; Explicitly deny network if not allowed
(deny network-outbound (remote ip "*:*"))
`;
    }
    
    return profile;
  }

  /**
   * Escape a path for use in a Scheme string
   */
  private escapePathForScheme(filePath: string): string {
    // Scheme strings use backslashes to escape quotes and backslashes.
    return filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

// Base Seatbelt profile for macOS
const BASE_MACOS_SEATBELT_PROFILE = `
(version 1)
(debug deny) ; Log denials to syslog, remove (debug deny) for production to reduce noise

; Start with closed-by-default
(deny default)

; Allow read-only file operations globally
(allow file-read*)

; Child processes inherit the policy of their parent
(allow process-exec) ; This might need to be more restrictive if possible
(allow process-fork)
(allow signal (target self)) ; Allow sending signals to itself

; Allow writing to /dev/null and standard I/O streams
(allow file-write-data (literal "/dev/null") (vnode-type CHARACTER-DEVICE))
(allow file-write* 
    (literal "/dev/stdout") 
    (literal "/dev/stderr")
)
(allow file-read* (literal "/dev/stdin"))


; Sysctls permitted (inspired by Chrome's sandbox policy)
(allow sysctl-read
  (sysctl-name "hw.activecpu")
  (sysctl-name "hw.busfrequency_compat")
  (sysctl-name "hw.byteorder")
  (sysctl-name "hw.cacheconfig")
  (sysctl-name "hw.cachelinesize_compat")
  (sysctl-name "hw.cpufamily")
  (sysctl-name "hw.cpufrequency_compat")
  (sysctl-name "hw.cputype")
  (sysctl-name "hw.l1dcachesize_compat")
  (sysctl-name "hw.l1icachesize_compat")
  (sysctl-name "hw.l2cachesize_compat")
  (sysctl-name "hw.l3cachesize_compat")
  (sysctl-name "hw.logicalcpu_max")
  (sysctl-name "hw.machine")
  (sysctl-name "hw.ncpu")
  (sysctl-name "hw.nperflevels")
  (sysctl-name "hw.optional.arm.FEAT_BF16")
  (sysctl-name "hw.optional.arm.FEAT_DotProd")
  (sysctl-name "hw.optional.arm.FEAT_FCMA")
  (sysctl-name "hw.optional.arm.FEAT_FHM")
  (sysctl-name "hw.optional.arm.FEAT_FP16")
  (sysctl-name "hw.optional.arm.FEAT_I8MM")
  (sysctl-name "hw.optional.arm.FEAT_JSCVT")
  (sysctl-name "hw.optional.arm.FEAT_LSE")
  (sysctl-name "hw.optional.arm.FEAT_RDM")
  (sysctl-name "hw.optional.arm.FEAT_SHA512")
  (sysctl-name "hw.optional.armv8_2_sha512")
  (sysctl-name "hw.memsize")
  (sysctl-name "hw.pagesize")
  (sysctl-name "hw.packages")
  (sysctl-name "hw.pagesize_compat")
  (sysctl-name "hw.physicalcpu_max")
  (sysctl-name "hw.tbfrequency_compat")
  (sysctl-name "hw.vectorunit")
  (sysctl-name "kern.hostname")
  (sysctl-name "kern.maxfilesperproc")
  (sysctl-name "kern.osproductversion")
  (sysctl-name "kern.osrelease")
  (sysctl-name "kern.ostype")
  (sysctl-name "kern.osvariant_status")
  (sysctl-name "kern.osversion")
  (sysctl-name "kern.secure_kernel")
  (sysctl-name "kern.usrstack64")
  (sysctl-name "kern.version")
  (sysctl-name "sysctl.proc_cputype")
  (sysctl-name-prefix "hw.perflevel")
)

; Import common system policy. This is crucial.
(import "system.sb") 
; (import "bsd.sb") ; Might be needed for more file system operations or network
`.trim(); 