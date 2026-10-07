import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.braier.outbound",
  appName: "Outbound Sales",
  webDir: "dist",
  server: { androidScheme: "https" },
};

export default config;
