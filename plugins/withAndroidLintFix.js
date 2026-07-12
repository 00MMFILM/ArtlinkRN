const { withAppBuildGradle, withStringsXml } = require("expo/config-plugins");

function withAndroidLintFix(config) {
  // 1. Add lint { disable 'ExtraTranslation' } to build.gradle
  config = withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes("disable 'ExtraTranslation'")) {
      config.modResults.contents = contents.replace(
        /android\s*\{/,
        `android {\n    lint {\n        disable 'ExtraTranslation'\n        abortOnError false\n    }`
      );
    }
    return config;
  });

  // 2. Add NS* strings to default locale strings.xml
  config = withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string || [];
    const toAdd = [
      {
        $: { name: "NSPhotoLibraryUsageDescription" },
        _: "Access to photos is needed to attach images to your profile and notes.",
      },
      {
        $: { name: "NSCameraUsageDescription" },
        _: "Camera access is needed to take profile photos.",
      },
      {
        $: { name: "NSMicrophoneUsageDescription" },
        _: "Microphone access is needed for voice memo recording.",
      },
    ];

    for (const item of toAdd) {
      const exists = strings.find((s) => s.$.name === item.$.name);
      if (!exists) {
        strings.push(item);
      }
    }

    config.modResults.resources.string = strings;
    return config;
  });

  return config;
}

module.exports = withAndroidLintFix;
