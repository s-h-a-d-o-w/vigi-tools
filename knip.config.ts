import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // Provided by the OS, not by a dependency.
  ignoreBinaries: ["ping"],
};

export default config;
