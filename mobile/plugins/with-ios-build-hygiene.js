const {
  IOSConfig,
  withFinalizedMod,
  withPodfile,
  withXcodeProject,
} = require("expo/config-plugins");
const xcode = require("xcode");

const HERMES_PHASE_NAME =
  "[CP-User] [Hermes] Replace Hermes for the right configuration, if needed";
const DEV_LAUNCHER_PHASE_NAME =
  "[Expo Dev Launcher] Strip Local Network Keys for Release";
const PODFILE_MARKER =
  "# Patch: Hermes replacement is intentionally always out of date";

function stripQuotes(value) {
  return typeof value === "string" ? value.replace(/^\"(.*)\"$/, "$1") : value;
}

function withHermesPhaseConfiguration(config) {
  return withPodfile(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(PODFILE_MARKER)) return modConfig;

    const postInstallCall =
      /(\n    react_native_post_install\([\s\S]*?\n    \)\n)/;
    if (!postInstallCall.test(contents)) {
      throw new Error("Unable to find react_native_post_install in Podfile.");
    }

    contents = contents.replace(
      postInstallCall,
      `$1    ${PODFILE_MARKER}\n` +
        "    installer.pods_project.targets.each do |pod_target|\n" +
        "      pod_target.shell_script_build_phases.each do |phase|\n" +
        `        phase.always_out_of_date = '1' if phase.name == '${HERMES_PHASE_NAME}'\n` +
        "      end\n" +
        "    end\n",
    );
    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function withAppLinkerFlags(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const targetName = modConfig.modRequest.projectName ?? modConfig.name;
    const targetId = project.findTargetKey(targetName);
    if (!targetId)
      throw new Error("Unable to find the iOS application target.");

    const nativeTarget = project.pbxNativeTargetSection()[targetId];
    const configurationList =
      project.pbxXCConfigurationList()[nativeTarget.buildConfigurationList];
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const reference of configurationList.buildConfigurations) {
      const configuration = configurations[reference.value];
      const linkerFlags = configuration?.buildSettings?.OTHER_LDFLAGS;
      if (Array.isArray(linkerFlags)) {
        configuration.buildSettings.OTHER_LDFLAGS = linkerFlags.filter(
          (flag) => stripQuotes(flag) !== "-lc++",
        );
      }
    }
    return modConfig;
  });
}

function withDevLauncherPhaseConfiguration(config) {
  return withFinalizedMod(config, [
    "ios",
    async (modConfig) => {
      const projectPath = IOSConfig.Paths.getPBXProjectPath(
        modConfig.modRequest.projectRoot,
      );
      const project = xcode.project(projectPath);
      project.parseSync();

      const targetName = modConfig.modRequest.projectName ?? modConfig.name;
      const targetId = project.findTargetKey(targetName);
      const nativeTarget = project.pbxNativeTargetSection()[targetId];
      const phases =
        project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
      const phaseReference = nativeTarget?.buildPhases?.find(
        (reference) =>
          stripQuotes(phases[reference.value]?.name) ===
          DEV_LAUNCHER_PHASE_NAME,
      );
      if (!phaseReference) {
        throw new Error("Unable to find the Expo Dev Launcher build phase.");
      }

      phases[phaseReference.value].alwaysOutOfDate = 1;
      require("fs").writeFileSync(projectPath, project.writeSync());
      return modConfig;
    },
  ]);
}

module.exports = function withIosBuildHygiene(config) {
  config = withHermesPhaseConfiguration(config);
  config = withAppLinkerFlags(config);
  return withDevLauncherPhaseConfiguration(config);
};
