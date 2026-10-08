import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.braier.outbound",
  appName: "Outbound Sales",
  webDir: "dist",
  server: { androidScheme: "https" },
  ios: {
    preferredContentMode: "mobile",
    contentInset: "never",
    scrollEnabled: true,
  },
};

export default config;
