const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Custom serializer to strip sanctioned URLs from the JS bundle
const originalProcessModuleFilter = config.serializer?.processModuleFilter;
config.serializer = {
  ...config.serializer,
  // Keep existing behavior, just ensure we have config ready
};

module.exports = config;
