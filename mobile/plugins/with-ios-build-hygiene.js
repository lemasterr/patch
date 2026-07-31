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
const EXPO_MODULES_JSI_TARGET_NAME = "ExpoModulesJSI";
const EXPO_MODULES_JSI_PHASE_NAME =
  "[CP-User] Build ExpoModulesJSI xcframework";
const BUNDLE_PHASE_NAME = "Bundle React Native code and images";
const PODFILE_MARKER =
  "# Patch: Hermes replacement is intentionally always out of date";
const SCOPED_WARNINGS_PODFILE_MARKER =
  "# Patch: scoped upstream dependency warning policy v8";
const XCFRAMEWORK_MODULE_MAP_MARKER =
  "# Patch: mark copied ExpoModulesCore framework as a system module";
const BUNDLE_NO_COLOR_MARKER =
  "# Patch: prevent Node's NO_COLOR/FORCE_COLOR status warning";

// These generated framework module maps ship with precompiled Expo/React
// dependencies. Marking only their affected modules as system modules stops
// Clang from surfacing diagnostics owned by those binary frameworks in Patch
// and unrelated dependent pods, without changing either upstream source.
const PREBUILT_SYSTEM_MODULE_MAPS = Object.freeze([
  {
    relativeGlob:
      "ExpoModulesCore/ExpoModulesCore.xcframework/**/module.modulemap",
    moduleDeclaration: "framework module ExpoModulesCore {",
  },
  {
    relativeGlob: "React-Core-prebuilt/React.xcframework/**/module.modulemap",
    moduleDeclaration: "framework module React {",
  },
  {
    relativeGlob: "React-Core-prebuilt/React.xcframework/**/module.modulemap",
    moduleDeclaration: "framework module React_RCTAppDelegate {",
  },
  {
    relativeGlob: "Target Support Files/Expo/Expo.modulemap",
    moduleDeclaration: "module Expo {",
  },
]);

// Every suppression below is limited to an identified third-party CocoaPods
// target. Patch receives only the narrow warning families emitted by Expo/React
// precompiled headers while compiling the generated AppDelegate.
const PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS = Object.freeze([
  "-Wno-deprecated-declarations",
  "-Wno-nullability-completeness",
  "-Wno-protocol",
]);

const POD_TARGET_WARNING_FLAGS = Object.freeze({
  Expo: [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    // Clang gives Expo's two forward-declared protocol diagnostics no warning
    // group, so an exact dependency-target exception is the only source-free
    // option. It never applies to Patch or any other pod.
    "-Wno-everything",
    "-Wno-deprecated-implementations",
    "-Wno-unused-variable",
  ],
  EXConstants: [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    "-Wno-incomplete-implementation",
  ],
  EXUpdatesInterface: PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
  ExpoModulesWorkletsAdapter: ["-Wno-documentation-deprecated-sync"],
  ExpoSQLite: [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    "-Wno-#warnings",
    "-Wno-ambiguous-macro",
    "-Wno-comma",
    "-Wno-shorten-64-to-32",
    "-Wno-unreachable-code",
  ],
  "expo-dev-launcher": [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    "-Wno-everything",
    "-Wno-objc-property-no-attribute",
    "-Wno-undeclared-selector",
    "-Wno-unused-variable",
  ],
  "expo-dev-menu": [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    "-Wno-everything",
  ],
  RNGestureHandler: [
    "-Wno-deprecated-declarations",
    "-Wno-documentation-deprecated-sync",
    "-Wno-implicit-enum-enum-cast",
    "-Wno-implicit-retain-self",
    "-Wno-mismatched-return-types",
    "-Wno-objc-missing-super-calls",
    "-Wno-unused-function",
  ],
  RNReanimated: [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    "-Wno-documentation-deprecated-sync",
    "-Wno-nullability-completeness",
    "-Wno-shorten-64-to-32",
    "-Wno-unused-function",
  ],
  RNScreens: [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    "-Wno-documentation-deprecated-sync",
    "-Wno-format",
    "-Wno-objc-property-synthesis",
    "-Wno-switch",
    "-Wno-unused-variable",
    "-Wno-unused-function",
  ],
  RNSVG: [
    "-Wno-objc-missing-super-calls",
    "-Wno-objc-property-synthesis",
    "-Wno-unneeded-internal-declaration",
    "-Wno-unused-function",
    "-Wno-vla-cxx-extension",
  ],
  RNWorklets: [
    ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
    "-Wno-documentation-deprecated-sync",
    "-Wno-unused-function",
  ],
  ReactCodegen: PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
  "react-native-safe-area-context": ["-Wno-reorder-init-list"],
});

const POD_TARGETS_WITH_SWIFT6_DEBT = Object.freeze([
  "EXApplication",
  "EXConstants",
  "EXJSONUtils",
  "EXManifests",
  "EXUpdatesInterface",
  "Expo",
  "ExpoAsset",
  "ExpoDevice",
  "ExpoGlassEffect",
  "ExpoLogBox",
  "ExpoNetwork",
  "ExpoNotifications",
  "ExpoRouter",
  "ExpoSecureStore",
  "ExpoSplashScreen",
  "ExpoSystemUI",
  "ExpoUI",
  "ReactCodegen",
  "RNReanimated",
  "RNScreens",
  "ExpoSQLite",
  "RNWorklets",
  "expo-dev-launcher",
  "expo-dev-menu",
  "react-native-safe-area-context",
]);

const POD_TARGETS_WITH_EMPTY_ARCHIVES = Object.freeze([
  "EXUpdatesInterface",
  "EXJSONUtils",
  "ExpoLogBox",
  "ReactCodegen",
  "RNReanimated",
  "RNScreens",
  "RNWorklets",
  "expo-dev-menu",
  "expo-dev-launcher",
  "react-native-safe-area-context",
]);
const APP_DEPENDENCY_HEADER_WARNING_FLAGS = Object.freeze([
  ...PREBUILT_DEPENDENCY_HEADER_WARNING_FLAGS,
  "-Wno-incomplete-umbrella",
]);
const APP_DEPENDENCY_HEADER_SWIFT_FLAGS = Object.freeze(
  APP_DEPENDENCY_HEADER_WARNING_FLAGS.flatMap((flag) => ["-Xcc", flag]),
);

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

function withScopedPodWarningPolicy(config) {
  return withPodfile(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(SCOPED_WARNINGS_PODFILE_MARKER)) return modConfig;

    const postInstallCall =
      /(\n    react_native_post_install\([\s\S]*?\n    \)\n)/;
    if (!postInstallCall.test(contents)) {
      throw new Error("Unable to find react_native_post_install in Podfile.");
    }

    const expectedTargets = [
      ...Object.keys(POD_TARGET_WARNING_FLAGS),
      ...POD_TARGETS_WITH_SWIFT6_DEBT,
      ...POD_TARGETS_WITH_EMPTY_ARCHIVES,
      EXPO_MODULES_JSI_TARGET_NAME,
    ];
    const rubyWarningFlags =
      "{ " +
      Object.entries(POD_TARGET_WARNING_FLAGS)
        .map(
          ([target, flags]) =>
            JSON.stringify(target) + " => " + JSON.stringify(flags),
        )
        .join(", ") +
      " }";
    const rubySystemModuleMaps =
      "[ " +
      PREBUILT_SYSTEM_MODULE_MAPS.map(
        ({ relativeGlob, moduleDeclaration }) =>
          "[" +
          JSON.stringify(relativeGlob) +
          ", " +
          JSON.stringify(moduleDeclaration) +
          "]",
      ).join(", ") +
      " ]";
    const policy = [
      "    " + SCOPED_WARNINGS_PODFILE_MARKER + "\n",
      "    patch_warning_flags = " + rubyWarningFlags + ".freeze\n",
      "    patch_swift_warning_targets = " +
        JSON.stringify(POD_TARGETS_WITH_SWIFT6_DEBT) +
        ".freeze\n",
      "    patch_empty_archive_targets = " +
        JSON.stringify(POD_TARGETS_WITH_EMPTY_ARCHIVES) +
        ".freeze\n",
      "    patch_expected_targets = " +
        JSON.stringify(expectedTargets) +
        ".uniq\n",
      "    patch_available_targets = installer.pods_project.targets.map(&:name)\n",
      "    patch_missing_targets = patch_expected_targets - patch_available_targets\n",
      "    unless patch_missing_targets.empty?\n",
      '      raise "Patch iOS build hygiene expected CocoaPods target(s) missing: #{patch_missing_targets.join(", ")}"\n',
      "    end\n",
      "    patch_system_module_maps = " + rubySystemModuleMaps + ".freeze\n",
      "    patch_system_module_maps.each do |relative_glob, module_declaration|\n",
      "      module_map_paths = Dir.glob(File.join(installer.sandbox.root, relative_glob))\n",
      "      if module_map_paths.empty?\n",
      '        raise "Patch iOS build hygiene expected module map(s) missing: #{relative_glob}"\n',
      "      end\n",
      '      system_declaration = module_declaration.sub(" {", " [system] {")\n',
      "      module_map_paths.each do |module_map_path|\n",
      "        module_map = File.read(module_map_path)\n",
      "        next if module_map.include?(system_declaration)\n",
      "        unless module_map.include?(module_declaration)\n",
      '          raise "Patch iOS build hygiene module declaration missing in #{module_map_path}"\n',
      "        end\n",
      "        File.write(module_map_path, module_map.sub(module_declaration, system_declaration))\n",
      "      end\n",
      "    end\n",
      "    installer.pods_project.targets.each do |pod_target|\n",
      `    if pod_target.name == '${EXPO_MODULES_JSI_TARGET_NAME}'\n`,
      `      patch_jsi_phase = pod_target.shell_script_build_phases.find { |phase| phase.name == '${EXPO_MODULES_JSI_PHASE_NAME}' }\n`,
      "      unless patch_jsi_phase\n",
      '        raise "Patch iOS build hygiene could not find the ExpoModulesJSI build phase"\n',
      "      end\n",
      '      patch_jsi_phase.shell_script = "export PATH=\\\"${PODS_TARGET_SRCROOT}/../../../scripts:${PATH}\\\"\\n\\\"${PODS_TARGET_SRCROOT}/scripts/build-xcframework.sh\\\""\n',
      "    end\n",
      "      patch_flags = patch_warning_flags.fetch(pod_target.name, [])\n",
      "      pod_target.build_configurations.each do |build_configuration|\n",
      "        build_settings = build_configuration.build_settings\n",
      "        unless patch_flags.empty?\n",
      "          %w[OTHER_CFLAGS OTHER_CPLUSPLUSFLAGS].each do |setting|\n",
      '            current_flags = Array(build_settings[setting]).flat_map { |value| value.is_a?(String) ? value.split(" ") : value }\n',
      '            build_settings[setting] = (["$(inherited)"] + current_flags + patch_flags).uniq\n',
      "          end\n",
      "        end\n",
      "        if patch_swift_warning_targets.include?(pod_target.name)\n",
      "          build_settings['SWIFT_SUPPRESS_WARNINGS'] = 'YES'\n",
      "        end\n",
      "        if patch_empty_archive_targets.include?(pod_target.name)\n",
      "          current_flags = Array(build_settings['OTHER_LIBTOOLFLAGS']).flat_map { |value| value.is_a?(String) ? value.split(\" \") : value }\n",
      "          build_settings['OTHER_LIBTOOLFLAGS'] = ([\"$(inherited)\"] + current_flags + ['-no_warning_for_no_symbols']).uniq\n",
      "        end\n",
      "      end\n",
      "    end\n",
      "    patch_xcframework_script = File.join(installer.sandbox.root, 'Target Support Files', 'ExpoModulesCore', 'ExpoModulesCore-xcframeworks.sh')\n",
      "    unless File.file?(patch_xcframework_script)\n",
      "      raise 'Patch iOS build hygiene expected ExpoModulesCore XCFramework copy script'\n",
      "    end\n",
      "    patch_xcframework_contents = File.read(patch_xcframework_script)\n",
      "    unless patch_xcframework_contents.include?(" +
        JSON.stringify(XCFRAMEWORK_MODULE_MAP_MARKER) +
        ")\n",
      "      patch_xcframework_contents += <<~'PATCH_XCFRAMEWORKS'\n",
      "\n",
      XCFRAMEWORK_MODULE_MAP_MARKER + "\n",
      'patch_runtime_module_map="${PODS_XCFRAMEWORKS_BUILD_DIR}/ExpoModulesCore/ExpoModulesCore.framework/Modules/module.modulemap"\n',
      'if [ ! -f "$patch_runtime_module_map" ]; then\n',
      '  echo "error: Patch iOS build hygiene expected copied ExpoModulesCore module map" >&2\n',
      "  exit 1\n",
      "fi\n",
      'if ! grep -Fq "framework module ExpoModulesCore [system] {" "$patch_runtime_module_map"; then\n',
      '  if ! grep -Fq "framework module ExpoModulesCore {" "$patch_runtime_module_map"; then\n',
      '    echo "error: Patch iOS build hygiene could not identify copied ExpoModulesCore module declaration" >&2\n',
      "    exit 1\n",
      "  fi\n",
      "  sed -i '' 's/^framework module ExpoModulesCore {/framework module ExpoModulesCore [system] {/' \"$patch_runtime_module_map\"\n",
      "fi\n",
      "PATCH_XCFRAMEWORKS\n",
      "      File.write(patch_xcframework_script, patch_xcframework_contents)\n",
      "    end\n",
    ].join("");
    contents = contents.replace(postInstallCall, "$1" + policy);
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
      for (const setting of ["OTHER_CFLAGS", "OTHER_CPLUSPLUSFLAGS"]) {
        const existing = configuration?.buildSettings?.[setting];
        const flags = Array.isArray(existing)
          ? existing
          : typeof existing === "string"
            ? existing.split(" ")
            : [];
        configuration.buildSettings[setting] = [
          ...new Set([
            '"$(inherited)"',
            ...flags,
            ...APP_DEPENDENCY_HEADER_WARNING_FLAGS,
          ]),
        ];
      }
      const existingSwiftFlags =
        configuration?.buildSettings?.OTHER_SWIFT_FLAGS;
      const swiftFlags = Array.isArray(existingSwiftFlags)
        ? existingSwiftFlags
        : typeof existingSwiftFlags === "string"
          ? existingSwiftFlags.split(" ")
          : [];
      configuration.buildSettings.OTHER_SWIFT_FLAGS = [
        '"$(inherited)"',
        ...swiftFlags,
        // Each Clang flag needs its own preceding -Xcc, so these tokens must
        // stay paired rather than being de-duplicated like ordinary flags.
        ...APP_DEPENDENCY_HEADER_SWIFT_FLAGS,
      ];
      configuration.buildSettings.HERMES_CLI_PATH =
        '"$(PROJECT_DIR)/../scripts/hermesc"';
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
      const bundlePhaseReference = nativeTarget?.buildPhases?.find(
        (reference) =>
          stripQuotes(phases[reference.value]?.name) === BUNDLE_PHASE_NAME,
      );
      if (!bundlePhaseReference) {
        throw new Error("Unable to find the React Native bundle build phase.");
      }

      phases[phaseReference.value].alwaysOutOfDate = 1;
      const bundlePhase = phases[bundlePhaseReference.value];
      const bundleScript = bundlePhase.shellScript;
      if (!bundleScript.includes(BUNDLE_NO_COLOR_MARKER)) {
        if (!bundleScript.startsWith('"') || !bundleScript.endsWith('"')) {
          throw new Error("Unable to preserve the React Native bundle script.");
        }
        // xcode's project writer expects this field to retain its surrounding
        // PBX quotes.  Unsetting NO_COLOR does not hide diagnostics; it avoids
        // Node's own status warning when Xcode also exports FORCE_COLOR.
        bundlePhase.shellScript = `"${BUNDLE_NO_COLOR_MARKER}\\nunset NO_COLOR\\n${bundleScript.slice(1, -1)}"`;
      }
      require("fs").writeFileSync(projectPath, project.writeSync());
      return modConfig;
    },
  ]);
}

module.exports = function withIosBuildHygiene(config) {
  config = withHermesPhaseConfiguration(config);
  config = withScopedPodWarningPolicy(config);
  config = withAppLinkerFlags(config);
  return withDevLauncherPhaseConfiguration(config);
};
