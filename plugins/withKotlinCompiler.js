const { withProjectBuildGradle } = require("@expo/config-plugins");

module.exports = function withKotlinCompiler(config) {
  return withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    const dependency =
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.21')";

    const kotlinClasspath =
      /classpath\s*\(?\s*['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]*)?['"]\s*\)?/;

    if (kotlinClasspath.test(contents)) {
      contents = contents.replace(kotlinClasspath, dependency);
    } else {
      const dependenciesBlock =
        /(buildscript\s*\{[\s\S]*?dependencies\s*\{)/;

      if (!dependenciesBlock.test(contents)) {
        throw new Error("Could not locate buildscript dependencies in android/build.gradle");
      }

      contents = contents.replace(
        dependenciesBlock,
        `$1\n        ${dependency}`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};