import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const serveFunctions = process.argv[2] === "--serve-functions";
const commandIndex = serveFunctions ? 3 : 2;
const command = process.argv[commandIndex];
const args = process.argv.slice(commandIndex + 1);
if (!command) {
  process.stderr.write(
    "Usage: node scripts/with-local-supabase.mjs [--serve-functions] <command> [...args]\n",
  );
  process.exit(1);
}

const supabaseBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  "supabase",
);
const statusResult = spawnSync(supabaseBin, ["status", "-o", "json"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (statusResult.status !== 0) {
  process.stderr.write(
    "Local Supabase is not running. Start it with `npm run supabase:start`.\n",
  );
  process.exit(statusResult.status ?? 1);
}

let status;
try {
  status = JSON.parse(statusResult.stdout);
} catch {
  process.stderr.write("Could not read the local Supabase status.\n");
  process.exit(1);
}

const localMobileHost = process.env.LOCAL_MOBILE_HOST?.trim();
const localMobileSupabaseUrl = new URL(status.API_URL);
if (localMobileHost) localMobileSupabaseUrl.hostname = localMobileHost;
const sharedEnvironment = {
  ...process.env,
  SUPABASE_URL: status.API_URL,
  SUPABASE_ANON_KEY: status.ANON_KEY ?? status.PUBLISHABLE_KEY,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
};

const functionServer = serveFunctions
  ? spawn(supabaseBin, ["functions", "serve"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: sharedEnvironment,
    })
  : null;
const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...sharedEnvironment,
    EXPO_PUBLIC_SUPABASE_URL:
      process.env.EXPO_PUBLIC_SUPABASE_URL ?? localMobileSupabaseUrl.toString(),
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      status.PUBLISHABLE_KEY ??
      status.ANON_KEY,
  },
});

child.on("exit", (code, signal) => {
  functionServer?.kill("SIGTERM");
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

functionServer?.on("exit", (code) => {
  if (code && child.exitCode == null) {
    process.stderr.write(
      "The local Edge Functions server stopped unexpectedly.\n",
    );
    child.kill("SIGTERM");
  }
});
