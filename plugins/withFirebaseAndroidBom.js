const { withProjectBuildGradle } = require('@expo/config-plugins');

// BoM 34.13.0 supplies Firestore 26.3.0, required by RNFirebase 27.1.0.
const FIREBASE_ANDROID_BOM_VERSION = '34.13.0';
const MARKER = '// Fynage Firebase Android BoM override';

module.exports = function withFirebaseAndroidBom(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes(MARKER)) {
      config.modResults.contents = contents.replace(
        /firebase: \[bom: '[^']+'\]/,
        `firebase: [bom: '${FIREBASE_ANDROID_BOM_VERSION}']`,
      );
      return config;
    }

    config.modResults.contents = `${MARKER}\nproject.ext {\n  set('react-native', [\n    versions: [\n      firebase: [bom: '${FIREBASE_ANDROID_BOM_VERSION}']\n    ]\n  ])\n}\n\n${contents}`;
    return config;
  });
};
